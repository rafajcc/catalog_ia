import { ReviewStateManager } from '../backend/src/modules/review-state/review-state';
import { logger } from '../backend/src/utils/logger';
import { ProductData, ProductEditState } from '../backend/src/types';
import { makeProduct } from './helpers';

beforeAll(() => {
  logger.setLevel('error');
});

function invalidProduct(): ProductData {
  return makeProduct({
    id: 'p2',
    reference: 'REF-002',
    validation_errors: [{ field: 'name', message: 'invalid name', code: 'X', severity: 'error' }]
  });
}

function productById(manager: ReviewStateManager, id: string): ProductEditState {
  return manager.filterProducts({}).find(p => p.product_id === id)!;
}

function nameEdit(manager: ReviewStateManager, id: string) {
  return productById(manager, id).edits.find(e => e.field === 'name')!;
}

function managerWithProducts(): { manager: ReviewStateManager; products: ProductData[] } {
  const products = [makeProduct({ id: 'p1' }), invalidProduct()];
  const manager = new ReviewStateManager();
  manager.initializeReview(products);
  return { manager, products };
}

describe('ReviewStateManager', () => {
  describe('initializeReview', () => {
    it('creates edit fields for each product', () => {
      const state = new ReviewStateManager().initializeReview([makeProduct({ id: 'p1' })]);

      expect(state.total_products).toBe(1);
      expect(state.products[0].edits.some(e => e.field === 'name')).toBe(true);
      expect(state.products[0].edits.find(e => e.field === 'name')!.value).toBe('Test Product');
      expect(state.products[0].edits.find(e => e.field === 'price')!.value).toBe(0);
    });

    it('computes valid/invalid counts from validation errors', () => {
      const state = new ReviewStateManager().initializeReview([makeProduct({ id: 'p1' }), invalidProduct()]);

      expect(state).toMatchObject({ total_products: 2, valid_count: 1, invalid_count: 1, warning_count: 0 });
    });

    it('offers the expected batch actions', () => {
      const state = new ReviewStateManager().initializeReview([makeProduct({ id: 'p1' })]);

      expect(state.batch_actions).toEqual([
        'accept_all',
        'reject_all',
        'exclude_selected',
        'reset_edits',
        'export_selected'
      ]);
    });
  });

  describe('applyFieldEdit', () => {
    it('updates a field value and marks the product as modified', () => {
      const { manager } = managerWithProducts();

      manager.applyFieldEdit('p1', 'name', 'New Name');

      expect(nameEdit(manager, 'p1').value).toBe('New Name');
      expect(productById(manager, 'p1').is_modified).toBe(true);
      expect(manager.getReviewDiffs('p1')).toContainEqual({
        field: 'name',
        original: 'Test Product',
        modified: 'New Name',
        type: 'modified'
      });
    });

    it('throws when the product is not found', () => {
      const { manager } = managerWithProducts();

      expect(() => manager.applyFieldEdit('missing', 'name', 'x')).toThrow('Product missing not found');
    });

    it('throws when the field is not found', () => {
      const { manager } = managerWithProducts();

      expect(() => manager.applyFieldEdit('p1', 'nonexistent_field', 'x')).toThrow('Field nonexistent_field not found');
    });
  });

  describe('updateProductEdit', () => {
    it('applies partial updates to a product edit state', () => {
      const { manager } = managerWithProducts();

      manager.updateProductEdit('p1', { can_exclude: false });

      expect(productById(manager, 'p1').can_exclude).toBe(false);
    });

    it('throws when the product is not found', () => {
      const { manager } = managerWithProducts();

      expect(() => manager.updateProductEdit('missing', {})).toThrow('Product missing not found in review');
    });
  });

  describe('applyImageSelection', () => {
    it('stores the selected images and marks the product as modified', () => {
      const { manager } = managerWithProducts();
      const image = { filename: 'front.jpg' };

      manager.applyImageSelection('p1', [image], 1, image);

      const product = productById(manager, 'p1');
      expect(product.image_selection.selected_images).toEqual([image]);
      expect(product.image_selection.order).toBe(1);
      expect(product.is_modified).toBe(true);
    });

    it('throws when the product is not found', () => {
      const { manager } = managerWithProducts();

      expect(() => manager.applyImageSelection('missing', [], 0)).toThrow('Product missing not found');
    });
  });

  describe('applyBatchAction', () => {
    it('accept_all makes current values the original values', () => {
      const { manager } = managerWithProducts();

      manager.applyFieldEdit('p1', 'name', 'New Name');
      const result = manager.applyBatchAction('accept_all', ['p1']);

      expect(result).toEqual({ accepted_count: 1 });
      expect(nameEdit(manager, 'p1').original_value).toBe('New Name');
      expect(productById(manager, 'p1').is_modified).toBe(false);
    });

    it('reject_all resets values to their originals', () => {
      const { manager } = managerWithProducts();

      manager.applyFieldEdit('p1', 'name', 'New Name');
      const result = manager.applyBatchAction('reject_all', ['p1']);

      expect(result).toEqual({ rejected_count: 1 });
      expect(nameEdit(manager, 'p1').value).toBe('Test Product');
    });

    it('exclude_selected marks products as excluded', () => {
      const { manager } = managerWithProducts();

      const result = manager.applyBatchAction('exclude_selected', ['p1']);

      expect(result).toEqual({ excluded_count: 1 });
      expect(productById(manager, 'p1').can_exclude).toBe(false);
    });

    it('reset_edits restores original values', () => {
      const { manager } = managerWithProducts();

      manager.applyFieldEdit('p1', 'name', 'New Name');
      const result = manager.applyBatchAction('reset_edits', ['p1']);

      expect(result).toEqual({ reset_count: 1 });
      expect(nameEdit(manager, 'p1').value).toBe('Test Product');
      expect(productById(manager, 'p1').is_modified).toBe(false);
    });

    it('export_selected returns the selected products', () => {
      const { manager } = managerWithProducts();

      const result = manager.applyBatchAction('export_selected', ['p1']);

      expect(result.total_products).toBe(1);
      expect(result.export_data[0].product_id).toBe('p1');
    });

    it('throws for unknown batch actions', () => {
      const { manager } = managerWithProducts();

      expect(() => manager.applyBatchAction('delete_all' as any, ['p1'])).toThrow('Unknown batch action');
    });
  });

  describe('filterProducts', () => {
    it('filters by validation status', () => {
      const { manager } = managerWithProducts();

      expect(manager.filterProducts({ status: ['valid'] }).map(p => p.product_id)).toEqual(['p1']);
      expect(manager.filterProducts({ status: ['invalid'] }).map(p => p.product_id)).toEqual(['p2']);
    });

    it('filters by search term on reference or EAN', () => {
      const { manager } = managerWithProducts();

      expect(manager.filterProducts({ search: 'REF-001' }).map(p => p.product_id)).toEqual(['p1']);
      expect(manager.filterProducts({ search: 'nope' })).toEqual([]);
    });

    it('filters by edited fields', () => {
      const { manager } = managerWithProducts();

      expect(manager.filterProducts({ fields: ['name'] }).map(p => p.product_id)).toEqual(['p1', 'p2']);
      expect(manager.filterProducts({ fields: ['unknown_field'] })).toEqual([]);
    });
  });

  describe('getReviewDiffs', () => {
    it('returns diffs for modified fields', () => {
      const { manager } = managerWithProducts();

      manager.applyFieldEdit('p1', 'name', 'New Name');
      const diffs = manager.getReviewDiffs('p1');

      expect(diffs).toEqual([
        { field: 'name', original: 'Test Product', modified: 'New Name', type: 'modified' }
      ]);
    });

    it('throws when the product is not found', () => {
      const { manager } = managerWithProducts();

      expect(() => manager.getReviewDiffs('missing')).toThrow('Product missing not found');
    });
  });

  describe('getReviewSummary and exportReview', () => {
    it('summarizes valid, invalid and modified products', () => {
      const { manager } = managerWithProducts();

      manager.applyFieldEdit('p1', 'name', 'New Name');
      const summary = manager.getReviewSummary();

      expect(summary).toMatchObject({ total_products: 2, valid_products: 1, invalid_products: 1, modified_products: 1 });
      expect(summary.modified_percentage).toBe(50);
    });

    it('exports products with their edits', () => {
      const { manager } = managerWithProducts();

      manager.applyFieldEdit('p1', 'name', 'New Name');
      const exportData = manager.exportReview();

      expect(exportData.products).toHaveLength(2);
      expect(exportData.products[0].edits.find(e => e.field === 'name')!.is_modified).toBe(true);
      expect(exportData.summary.total_products).toBe(2);
      expect(exportData.exported_at).toBeDefined();
    });
  });
});
