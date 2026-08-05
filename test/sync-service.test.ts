import { SyncService } from '../backend/src/modules/sync-service/sync-service';
import { logger } from '../backend/src/utils/logger';
import type { ImageFile, SyncSession, SyncPlan, SyncResult } from '../backend/src/types';
import { makeProduct } from './helpers';

function makeImage(name: string): ImageFile {
  return { filename: name, path: `/tmp/${name}`, format: 'jpg' };
}

interface Fakes {
  prestashop: {
    resolveProduct: jest.Mock;
    syncSingleProduct: jest.Mock;
  };
  ai: {
    generateSuggestions: jest.Mock;
  };
  matcher: {
    matchImages: jest.Mock;
  };
  ranker: {
    rankImages: jest.Mock;
  };
}

function makeFakes(): Fakes {
  return {
    prestashop: {
      resolveProduct: jest.fn(),
      syncSingleProduct: jest.fn()
    },
    ai: {
      generateSuggestions: jest.fn()
    },
    matcher: {
      matchImages: jest.fn()
    },
    ranker: {
      rankImages: jest.fn()
    }
  };
}

function makeService(fakes: Fakes): SyncService {
  return new SyncService(
    fakes.prestashop as any,
    fakes.ai as any,
    fakes.matcher as any,
    fakes.ranker as any,
    { batch_size: 10 }
  );
}

function makeEmptySession(dryRun: boolean): SyncSession {
  return {
    id: 'sync_test',
    config: { batch_size: 10 },
    plan: {
      products_to_create: [],
      products_to_update: [],
      stock_updates: [],
      images_to_upload: [],
      texts_to_update: []
    },
    status: 'pending',
    started_at: new Date(),
    dry_run: dryRun
  };
}

const productA = makeProduct({ id: 'a', reference: 'REF-A' });
const productB = makeProduct({ id: 'b', reference: 'REF-B' });

describe('SyncService', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createSyncSession', () => {
    it('creates a pending session and plans every product for creation in dry-run mode', async () => {
      const fakes = makeFakes();
      const service = makeService(fakes);

      const session = await service.createSyncSession([productA, productB], true);

      expect(session.status).toBe('pending');
      expect(session.dry_run).toBe(true);
      expect(session.id).toMatch(/^sync_/);
      expect(session.started_at).toBeInstanceOf(Date);
      expect(session.plan.products_to_create).toHaveLength(2);
      expect(session.plan.products_to_update).toHaveLength(0);
      expect(fakes.prestashop.resolveProduct).not.toHaveBeenCalled();
      expect(fakes.ai.generateSuggestions).not.toHaveBeenCalled();
    });

    it('classifies products and collects planned operations in real runs', async () => {
      const fakes = makeFakes();
      const service = makeService(fakes);

      fakes.prestashop.resolveProduct
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: '9' });
      fakes.ai.generateSuggestions.mockResolvedValue([
        { original_field: 'description', suggested_value: 'New text', improvements: ['improve'], confidence: 0.9 }
      ]);

      const p1 = makeProduct({ id: '1', reference: 'REF-1' });
      const p2 = makeProduct({
        id: '2',
        reference: 'REF-2',
        quantity: 5,
        selected_images: [makeImage('img-a.jpg'), makeImage('img-b.jpg')]
      });

      const session = await service.createSyncSession([p1, p2], false);

      expect(session.plan.products_to_create).toEqual([p1]);
      expect(session.plan.products_to_update).toEqual([p2]);
      expect(session.plan.stock_updates).toEqual([
        { product_id: '9', stock_available_id: '', new_quantity: 5, reference: 'REF-2' }
      ]);
      expect(session.plan.images_to_upload).toEqual([
        { product_id: '9', image_file: makeImage('img-a.jpg') },
        { product_id: '9', image_file: makeImage('img-b.jpg') }
      ]);
      expect(session.plan.texts_to_update).toEqual([
        {
          product_id: expect.stringMatching(/^temp_/),
          field: 'description',
          new_value: 'New text',
          original_value: ''
        },
        {
          product_id: '9',
          field: 'description',
          new_value: 'New text',
          original_value: ''
        }
      ]);
    });

    it('filters out low-confidence or empty AI suggestions', async () => {
      const fakes = makeFakes();
      const service = makeService(fakes);

      fakes.prestashop.resolveProduct.mockResolvedValue(null);
      fakes.ai.generateSuggestions.mockResolvedValue([
        { original_field: 'name', suggested_value: 'A', improvements: ['x'], confidence: 0.5 },
        { original_field: 'description', suggested_value: 'B', improvements: [], confidence: 0.9 }
      ]);

      const session = await service.createSyncSession([productA], false);

      expect(session.plan.texts_to_update).toHaveLength(0);
    });

    it('falls back to planning an update when the assessment fails', async () => {
      const fakes = makeFakes();
      const service = makeService(fakes);

      fakes.prestashop.resolveProduct.mockRejectedValue(new Error('ECONNRESET'));

      const session = await service.createSyncSession([productA], false);

      expect(session.plan.products_to_update).toEqual([productA]);
      expect(logger.warn).toHaveBeenCalledWith('Failed to assess product changes', expect.anything());
    });
  });

  describe('executeSyncSession', () => {
    it('completes products without calling the API in dry-run mode', async () => {
      const fakes = makeFakes();
      const service = makeService(fakes);
      const session = makeEmptySession(true);
      session.plan.products_to_create = [productA, productB];

      const result = await service.executeSyncSession(session);

      expect(fakes.prestashop.syncSingleProduct).not.toHaveBeenCalled();
      expect(result.status).toBe('completed');
      expect(result.completed_at).toBeInstanceOf(Date);
      expect(result.results).toHaveLength(2);
      expect(result.results![0].status).toBe('completed');
      expect(result.results![0].prestashop_id).toMatch(/^temp_/);
      expect(result.results![0].executed_at).toBeInstanceOf(Date);
      expect(result.results![0].response_data.processing_time_ms).toEqual(expect.any(Number));
    });

    it('executes products through the client and determines operations', async () => {
      const fakes = makeFakes();
      const service = makeService(fakes);
      const session = makeEmptySession(false);
      session.plan.products_to_create = [productA];
      session.plan.products_to_update = [makeProduct({ id: 'b', reference: 'REF-B', prestashop_id: '55' })];

      fakes.prestashop.syncSingleProduct.mockResolvedValue({
        success: true,
        product_id: '55',
        operation: 'sync_single_product',
        errors: [],
        warnings: [],
        timestamp: new Date()
      });

      const result = await service.executeSyncSession(session);

      expect(fakes.prestashop.syncSingleProduct).toHaveBeenCalledTimes(2);
      expect(result.status).toBe('completed');
      expect(result.results!.map(r => r.status)).toEqual(['completed', 'completed']);
      expect(result.results![0].operation).toBe('create_product');
      expect(result.results![1].operation).toBe('update_product');
      expect(result.results![0].prestashop_id).toBe('55');
      expect(result.results![0].error).toBeUndefined();
    });

    it('records failed results from the client', async () => {
      const fakes = makeFakes();
      const service = makeService(fakes);
      const session = makeEmptySession(false);
      session.plan.products_to_create = [productA];

      fakes.prestashop.syncSingleProduct.mockResolvedValue({
        success: false,
        product_id: undefined,
        operation: 'sync_single_product',
        errors: ['Stock unavailable'],
        warnings: [],
        timestamp: new Date()
      });

      const result = await service.executeSyncSession(session);

      expect(result.results![0].status).toBe('failed');
      expect(result.results![0].error).toBe('Stock unavailable');
    });

    it('records a failed result when the client throws', async () => {
      const fakes = makeFakes();
      const service = makeService(fakes);
      const session = makeEmptySession(false);
      session.plan.products_to_create = [productA];

      fakes.prestashop.syncSingleProduct.mockRejectedValue(new Error('boom'));

      const result = await service.executeSyncSession(session);

      expect(result.results![0].status).toBe('failed');
      expect(result.results![0].error).toBe('boom');
      expect(logger.error).toHaveBeenCalledWith('Product processing failed', expect.anything());
    });
  });

  describe('getSyncSummary', () => {
    const results = [
      { status: 'completed' },
      { status: 'failed' }
    ] as SyncResult[];

    it('computes totals and the success rate', () => {
      const service = makeService(makeFakes());
      const session = makeEmptySession(false);
      session.plan = {
        products_to_create: [productA],
        products_to_update: [productB],
        stock_updates: [{ product_id: '1', stock_available_id: '', new_quantity: 2 }],
        images_to_upload: [{ product_id: '1', image_file: makeImage('a.jpg') }],
        texts_to_update: [{ product_id: '1', field: 'name', new_value: 'X', original_value: 'Y' }]
      } as SyncPlan;
      session.results = results;
      session.status = 'completed';

      const summary = service.getSyncSummary(session);

      expect(summary.total_operations).toBe(5);
      expect(summary.completed_operations).toBe(1);
      expect(summary.failed_operations).toBe(1);
      expect(summary.success_rate).toBe(20);
      expect(summary.created_products).toBe(1);
      expect(summary.updated_products).toBe(1);
      expect(summary.stock_updates).toBe(1);
      expect(summary.images_uploaded).toBe(1);
      expect(summary.texts_updated).toBe(1);
    });

    it('returns a zero success rate for empty plans', () => {
      const service = makeService(makeFakes());
      const session = makeEmptySession(true);

      const summary = service.getSyncSummary(session);

      expect(summary.total_operations).toBe(0);
      expect(summary.success_rate).toBe(0);
    });
  });
});
