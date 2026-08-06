// API routes for CatalogIA.
// Wires the frontend contract to the processing modules and an in-memory store.

import path from 'path';
import { NextFunction, Request, Response, Router } from 'express';
import fileUpload from 'express-fileupload';
import fs from 'fs-extra';
import { AppError } from './utils/error-handler';
import { DataStore, DataSet, UploadedFile } from './store';
import { CSVParser } from './modules/csv-parser/csv-parser';
import { ProductNormalizer } from './modules/product-normalizer/product-normalizer';
import { ProductValidator } from './modules/validator/validator';
import { ImageMatcher } from './modules/image-matcher/image-matcher';
import { ImageRanker } from './modules/image-ranker/image-ranker';
import { AITextSuggester } from './modules/ai-text-suggester/ai-text-suggester';
import { ReviewStateManager } from './modules/review-state/review-state';
import { SyncService } from './modules/sync-service/sync-service';
import { PrestaShopClient } from './modules/prestashop-client/prestashop-client';
import {
  AIConfig,
  AIResponse,
  BatchAction,
  ImageFile,
  ImageMatchResult,
  PrestaShopConfig,
  ProductData,
  SyncSession
} from './types';

export interface RouteDependencies {
  store: DataStore;
  uploadsDir?: string;
  prestashopClientFactory?: (config: PrestaShopConfig) => PrestaShopClient;
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const wrap = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction): void => {
  fn(req, res, next).catch(next);
};

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg']);

const CSV_EXTENSION = '.csv';
const BINARY_SNIFF_LENGTH = 8192;

function getUploadedFile(value: fileUpload.UploadedFile | fileUpload.UploadedFile[] | undefined): fileUpload.UploadedFile {
  const files = Array.isArray(value) ? value : value ? [value] : [];
  const file = files[0];
  if (!file) {
    throw new AppError('Missing multipart file field', 400);
  }
  return file;
}

function assertCsvFile(file: fileUpload.UploadedFile): void {
  const ext = path.extname(file.name || '').toLowerCase();
  if (ext !== CSV_EXTENSION) {
    throw new AppError(`Only .csv files are allowed (received "${file.name}")`, 400);
  }
  if (!file.size || file.size <= 0) {
    throw new AppError('The CSV file is empty', 400);
  }
  if (isBinaryContent(file.data)) {
    throw new AppError(`The file "${file.name}" does not look like a CSV (binary content detected)`, 400);
  }
}

function isBinaryContent(data: Buffer): boolean {
  const sample = data.subarray(0, BINARY_SNIFF_LENGTH);
  return sample.includes(0);
}

function assertImageFile(file: fileUpload.UploadedFile): void {
  const ext = path.extname(file.name || '').slice(1).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) {
    throw new AppError(`Only .jpg and .jpeg images are allowed (received "${file.name}")`, 400);
  }
}

function requireUploadedFile(store: DataStore, fileId: string): UploadedFile {
  const uploaded = store.uploads.get(fileId);
  if (!uploaded) {
    throw new AppError(`Uploaded file ${fileId} not found`, 404);
  }
  return uploaded;
}

function requireDataset(store: DataStore, dataId: string): DataSet {
  const dataset = store.getDataset(dataId);
  if (!dataset) {
    throw new AppError(`Data ${dataId} not found`, 404);
  }
  return dataset;
}

function requireSession(store: DataStore, sessionId: string): SyncSession {
  const session = store.syncSessions.get(sessionId);
  if (!session) {
    throw new AppError(`Sync session ${sessionId} not found`, 404);
  }
  return session;
}

function requireReviewManager(store: DataStore, dataId: string): ReviewStateManager {
  const dataset = requireDataset(store, dataId);
  let manager = store.reviewManagers.get(dataId);
  if (!manager) {
    manager = new ReviewStateManager();
    manager.initializeReview(dataset.products);
    store.reviewManagers.set(dataId, manager);
  }
  return manager;
}

function buildAIConfig(store: DataStore, body: any): AIConfig {
  return {
    ...store.config.ai,
    ...body,
    enabled_fields: Array.isArray(body?.enabled_fields) ? body.enabled_fields : store.config.ai.enabled_fields
  };
}

function buildPrestashopClient(deps: RouteDependencies, config: PrestaShopConfig): PrestaShopClient {
  return deps.prestashopClientFactory ? deps.prestashopClientFactory(config) : new PrestaShopClient(config);
}

function createSyncService(config: DataStore['config'], batchSize: number): SyncService {
  const prestashopClient = new PrestaShopClient(config.prestashop);
  const aiSuggester = new AITextSuggester(config.ai);
  const imageMatcher = new ImageMatcher({ strategies: ['ean', 'reference', 'filename_pattern'] });
  const imageRanker = new ImageRanker({
    max_images_per_product: config.image_matcher.max_images_per_product ?? 5
  });
  return new SyncService(prestashopClient, aiSuggester, imageMatcher, imageRanker, { batch_size: batchSize });
}

async function scanImageFolder(folderPath: string): Promise<ImageFile[]> {
  const files: ImageFile[] = [];
  const entries = await fs.readdir(folderPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await scanImageFolder(fullPath)));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        const stat = await fs.stat(fullPath);
        files.push({ filename: entry.name, path: fullPath, format: ext, size_in_bytes: stat.size });
      }
    }
  }

  return files;
}

export function createApiRouter(deps: RouteDependencies): Router {
  const { store } = deps;
  const uploadsDir = deps.uploadsDir || path.resolve(process.cwd(), 'uploads');
  const router = Router();

  // Health and status
  router.get('/health', (_req, res) => {
    res.json({ success: true, status: 'ok' });
  });

  router.get('/logs', (_req, res) => {
    res.json({ success: true, data: [] });
  });

  // Configuration
  router.get('/config', (_req, res) => {
    res.json({ success: true, ...store.config });
  });

  router.put('/config', (req, res) => {
    const body = req.body ?? {};
    const next = { ...store.config };

    if (body.prestashop) next.prestashop = { ...next.prestashop, ...body.prestashop };
    if (body.ai) next.ai = { ...next.ai, ...body.ai };
    if (body.validation) next.validation = { ...next.validation, ...body.validation };
    if (body.image_matcher) next.image_matcher = { ...next.image_matcher, ...body.image_matcher };

    store.config = next;
    res.json({ success: true, message: 'Configuration saved', ...store.config });
  });

  router.post(
    '/config/test/prestashop',
    wrap(async (req, res) => {
      const body = req.body ?? {};
      const config: PrestaShopConfig = { ...store.config.prestashop, ...body };

      if (!config.base_url) throw new AppError('PrestaShop base URL is required', 400);
      if (!config.api_key) throw new AppError('PrestaShop API key is required', 400);

      const client = buildPrestashopClient(deps, config);
      const ok = await client.testConnection();
      if (!ok) throw new AppError('PrestaShop connection failed - check the URL and API key', 400);

      res.json({ success: true, message: 'PrestaShop connection successful' });
    })
  );

  router.post(
    '/config/test/ai',
    wrap(async (req, res) => {
      const config = buildAIConfig(store, req.body ?? {});
      const suggester = new AITextSuggester(config);
      const testProduct = {
        id: 'test',
        status: 'pending',
        source_file: 'test',
        validation_errors: [],
        warnings: [],
        name: '',
        category: 'test',
        brand: 'test'
      } as ProductData;

      const suggestions = await suggester.generateSuggestions(testProduct);
      if (!Array.isArray(suggestions)) throw new AppError('AI connection test failed', 400);

      res.json({ success: true, message: 'AI connection successful' });
    })
  );

  // File uploads
  router.post(
    '/upload/csv',
    wrap(async (req, res) => {
      const file = getUploadedFile(req.files?.file);
      assertCsvFile(file);

      const fileId = store.newId('file');
      const dir = path.join(uploadsDir, 'csv');
      await fs.ensureDir(dir);

      const dest = path.join(dir, `${fileId}-${path.basename(file.name)}`);
      await file.mv(dest);

      store.uploads.set(fileId, {
        fileId,
        originalName: file.name,
        path: dest,
        size: file.size,
        mimeType: file.mimetype
      });

      res.json({
        success: true,
        message: 'CSV file uploaded',
        file_id: fileId,
        file_name: file.name,
        rows: 0
      });
    })
  );

  router.post(
    '/upload/images',
    wrap(async (req, res) => {
      const value = req.files?.files;
      const files = Array.isArray(value) ? value : value ? [value] : [];
      if (files.length === 0) throw new AppError('Missing multipart file field: files', 400);

      for (const file of files) {
        assertImageFile(file);
      }

      const dir = path.join(uploadsDir, 'images');
      await fs.ensureDir(dir);

      for (const file of files) {
        const fileId = store.newId('img');
        const dest = path.join(dir, `${fileId}-${path.basename(file.name)}`);
        await file.mv(dest);
        store.images.push({
          filename: file.name,
          path: dest,
          format: path.extname(file.name).slice(1).toLowerCase() || 'png',
          size_in_bytes: file.size
        });
      }

      res.json({ success: true, message: `${files.length} image(s) uploaded` });
    })
  );

  router.post(
    '/upload/folder',
    wrap(async (req, res) => {
      const folderPath = (req.body ?? {}).folderPath as string | undefined;
      if (!folderPath) throw new AppError('Missing folderPath', 400);

      if (!(await fs.pathExists(folderPath))) {
        throw new AppError(`Folder not found: ${folderPath}`, 404);
      }
      if (!(await fs.stat(folderPath)).isDirectory()) {
        throw new AppError(`Path is not a folder: ${folderPath}`, 400);
      }

      const scanned = await scanImageFolder(folderPath);
      store.images.push(...scanned);

      res.json({ success: true, message: `Image folder selected (${scanned.length} image(s) found)` });
    })
  );

  // Data processing
  router.post(
    '/process/csv',
    wrap(async (req, res) => {
      const fileId = (req.body ?? {}).fileId as string | undefined;
      if (!fileId) throw new AppError('Missing fileId', 400);

      const uploaded = requireUploadedFile(store, fileId);
      const parser = new CSVParser();
      const csvResult = await parser.parseFile(uploaded.path);

      const supported = new Set(parser.getSupportedFields());
      const recognized = csvResult.headers.filter((header) => supported.has(header.toLowerCase()));
      if (recognized.length === 0) {
        throw new AppError(
          `The file "${uploaded.originalName}" does not look like a product CSV: no recognized columns (found: ${csvResult.headers.join(', ') || 'none'})`,
          400
        );
      }
      if (csvResult.rows.length === 0) {
        throw new AppError(`The file "${uploaded.originalName}" contains no data rows`, 400);
      }

      const normalizer = new ProductNormalizer();
      const products = normalizer.normalizeProducts(csvResult.rows);
      if (products.length === 0) {
        throw new AppError(
          `No products could be extracted from "${uploaded.originalName}": ${csvResult.invalid_rows} of ${csvResult.total_rows} row(s) had errors. Check that the file has the required columns.`,
          400
        );
      }

      const dataId = store.newId('data');
      store.datasets.set(dataId, {
        dataId,
        fileId,
        fileName: uploaded.originalName,
        products,
        csvHeaders: csvResult.headers,
        totalRows: csvResult.total_rows
      });

      res.json({
        success: true,
        message: 'CSV parsed successfully',
        data: { data_id: dataId, products, summary: { total: products.length } }
      });
    })
  );

  router.get('/process/csv/:fileId', (req, res) => {
    const uploaded = requireUploadedFile(store, req.params.fileId);
    const dataset = [...store.datasets.values()].find((d) => d.fileId === req.params.fileId);
    res.json({
      success: true,
      data: { products: dataset?.products ?? [], file_name: uploaded.originalName }
    });
  });

  // Validation
  router.post(
    '/validate/products/:dataId',
    wrap(async (req, res) => {
      const dataset = requireDataset(store, req.params.dataId);
      const requiredFields = store.config.validation.required_fields || ['name'];
      const validator = new ProductValidator([], requiredFields);

      const products = dataset.products.map((product) => {
        const result = validator.validateProduct(product, { products: dataset.products });
        product.validation_errors = result.errors || [];
        product.warnings = result.warnings || [];
        product.status = result.valid ? 'valid' : 'invalid';
        return product;
      });

      store.validationResults.set(req.params.dataId, { products });
      res.json({
        success: true,
        message: 'Products validated',
        data: { products, summary: { total: products.length } }
      });
    })
  );

  router.get('/validate/results/:dataId', (req, res) => {
    const stored = store.validationResults.get(req.params.dataId);
    if (!stored) throw new AppError('Validation results not found', 404);
    res.json({ success: true, data: { products: stored.products } });
  });

  // Image matching
  router.post(
    '/images/match/:dataId',
    wrap(async (req, res) => {
      const dataset = requireDataset(store, req.params.dataId);
      const body = req.body ?? {};
      const strategy = (body.strategy as string) || 'ean';
      const maxImages = Math.max(1, Number(body.max_images_per_product) || 5);

      const matcher = new ImageMatcher({ strategies: [strategy as any] });
      const ranker = new ImageRanker({ max_images_per_product: maxImages });

      const results: ImageMatchResult[] = [];

      for (const product of dataset.products) {
        const match = matcher.matchProductImages(product, store.images);
        const candidates = match.matched_files.map((img) => ({ ...img, score: img.match_score || 0 }));
        const ranked = ranker.rankProductImages(product, candidates, store.images);
        match.matched_files = ranked;
        product.selected_images = ranked;
        results.push(match);
      }

      store.matchingResults.set(req.params.dataId, results);
      res.json({ success: true, message: 'Image matching finished', data: results });
    })
  );

  router.get('/images/results/:dataId', (req, res) => {
    const stored = store.matchingResults.get(req.params.dataId);
    res.json({ success: true, data: stored ?? [] });
  });

  // AI text suggestions
  router.post(
    '/ai/suggest/:dataId',
    wrap(async (req, res) => {
      const dataset = requireDataset(store, req.params.dataId);
      const config = buildAIConfig(store, req.body ?? {});
      const suggester = new AITextSuggester(config);

      const suggestions: AIResponse[] = [];
      for (const product of dataset.products) {
        const generated = await suggester.generateSuggestions(product);
        suggestions.push(...generated);
      }

      store.aiSuggestions.set(req.params.dataId, suggestions);
      res.json({ success: true, message: 'Text suggestions generated', data: suggestions });
    })
  );

  router.get('/ai/suggestions/:dataId', (req, res) => {
    const stored = store.aiSuggestions.get(req.params.dataId);
    res.json({ success: true, data: stored ?? [] });
  });

  // Synchronization
  router.post(
    '/sync/session/:dataId',
    wrap(async (req, res) => {
      const dataset = requireDataset(store, req.params.dataId);
      const batchSize = Math.max(1, Number(req.body?.batch_size) || 10);

      const syncService = createSyncService(store.config, batchSize);
      const session = await syncService.createSyncSession(dataset.products, true);
      store.syncSessions.set(session.id, session);

      res.json({ success: true, message: 'Sync session created', session, session_id: session.id });
    })
  );

  router.get('/sync/session/:sessionId', (req, res) => {
    const session = requireSession(store, req.params.sessionId);
    res.json({ success: true, session, session_id: session.id });
  });

  router.post(
    '/sync/start/:sessionId',
    wrap(async (req, res) => {
      const session = requireSession(store, req.params.sessionId);
      const syncService = createSyncService(store.config, session.config.batch_size);
      await syncService.executeSyncSession(session);
      store.syncSessions.set(session.id, session);
      res.json({ success: true, message: 'Sync started', data: session.results ?? [] });
    })
  );

  router.post('/sync/cancel/:sessionId', (req, res) => {
    const session = requireSession(store, req.params.sessionId);
    session.status = 'failed';
    res.json({ success: true, message: 'Sync session cancelled', data: [] });
  });

  router.get('/sync/results/:sessionId', (req, res) => {
    const session = requireSession(store, req.params.sessionId);
    res.json({ success: true, data: session.results ?? [] });
  });

  router.get('/sync/export/:sessionId/:format', (req, res) => {
    const session = requireSession(store, req.params.sessionId);
    const format = req.params.format || 'json';

    if (format === 'csv') {
      const header = 'operation,status,product_id,reference,error\n';
      const rows = (session.results ?? [])
        .map((r) => `${r.operation},${r.status},${r.product_id},${r.reference || ''},"${r.error || ''}"`)
        .join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=sync_${session.id}.csv`);
      res.send(header + rows);
      return;
    }

    res.json({ success: true, session_id: session.id, results: session.results ?? [] });
  });

  // Review
  router.get('/review/state/:dataId', (req, res) => {
    const manager = requireReviewManager(store, req.params.dataId);
    res.json({ success: true, data: manager.getState() });
  });

  router.put('/review/state/:dataId', (req, res) => {
    const manager = requireReviewManager(store, req.params.dataId);
    const body = req.body ?? {};

    if (Array.isArray(body.products)) {
      for (const edit of body.products) {
        if (edit && edit.product_id && Array.isArray(edit.edits)) {
          manager.updateProductEdit(edit.product_id, { edits: edit.edits });
        }
      }
    }

    res.json({ success: true, message: 'Review state updated', data: manager.getState() });
  });

  router.post('/review/apply/:dataId', (req, res) => {
    const manager = requireReviewManager(store, req.params.dataId);
    const changes = Array.isArray(req.body) ? req.body : req.body ? [req.body] : [];

    for (const change of changes) {
      if (!change || !change.product_id || !change.field) continue;

      if (change.field === 'image_selection') {
        manager.applyImageSelection(
          change.product_id,
          Array.isArray(change.value) ? change.value : [],
          Number(change.order) || 0
        );
      } else {
        manager.applyFieldEdit(change.product_id, change.field, change.value);
      }
    }

    res.json({ success: true, message: 'Review changes applied', data: manager.getState() });
  });

  router.post('/review/batch/:dataId', (req, res) => {
    const manager = requireReviewManager(store, req.params.dataId);
    const body = req.body ?? {};
    const action = body.action as BatchAction;

    if (!action) throw new AppError('Missing batch action', 400);

    const targetIds = Array.isArray(body.targetIds) ? body.targetIds : undefined;
    const result = manager.applyBatchAction(action, targetIds);
    res.json({ success: true, message: 'Batch action applied', data: result });
  });

  router.get('/review/export/:dataId', (req, res) => {
    const manager = requireReviewManager(store, req.params.dataId);
    const exportData = manager.exportReview();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=review_${req.params.dataId}.json`);
    res.send(JSON.stringify(exportData, null, 2));
  });

  // Download
  router.get(
    '/download/:filePath(*)',
    wrap(async (req, res) => {
      const resolved = path.resolve(uploadsDir, req.params.filePath);
      if (!resolved.startsWith(path.resolve(uploadsDir))) {
        throw new AppError('Invalid file path', 400);
      }

      if (!(await fs.pathExists(resolved)) || !(await fs.stat(resolved)).isFile()) {
        throw new AppError('File not found', 404);
      }

      res.sendFile(resolved);
    })
  );

  return router;
}
