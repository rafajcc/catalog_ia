// API routes for CatalogIA.
// Wires the frontend contract to the processing modules and an in-memory store.

import path from 'path';
import { NextFunction, Request, Response, Router } from 'express';
import fileUpload from 'express-fileupload';
import fs from 'fs-extra';
import { AppError } from './utils/error-handler';
import { DataStore, DataSet, UploadedFile } from './store';
import { CSVParser, CSV_TEMPLATE_HEADERS } from './modules/csv-parser/csv-parser';
import { ProductNormalizer } from './modules/product-normalizer/product-normalizer';
import { ProductValidator, getDefaultProductRules } from './modules/validator/validator';
import { ImageMatcher } from './modules/image-matcher/image-matcher';
import { ImageRanker } from './modules/image-ranker/image-ranker';
import { AITextSuggester } from './modules/ai-text-suggester/ai-text-suggester';
import { ReviewStateManager } from './modules/review-state/review-state';
import { ConsistencyValidator } from './modules/consistency-validator/consistency-validator';
import { CombinationSync } from './modules/combination-sync/combination-sync';
import { PrestaShopClient } from './modules/prestashop-client/prestashop-client';
import { PrestaShopFetcher, PRESTASHOP_FETCH_LIMIT } from './modules/prestashop-fetcher/prestashop-fetcher';
import { ConfigPersistence } from './modules/config-persistence/config-persistence';
import {
  AIConfig,
  AIResponse,
  BatchAction,
  ConsistencyResult,
  ImageFile,
  ImageMatchResult,
  PrestaShopConfig,
  ProductData
} from './types';

export interface RouteDependencies {
  store: DataStore;
  uploadsDir?: string;
  prestashopClientFactory?: (config: PrestaShopConfig) => PrestaShopClient;
  configPersistence?: ConfigPersistence;
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

function assertCsvFormat(file: fileUpload.UploadedFile): void {
  const content = file.data.toString('utf8');
  const firstLine = content.split(/\r?\n/)[0];
  if (!firstLine || !firstLine.trim()) {
    throw new AppError('The CSV file is empty', 400);
  }
  const headers = firstLine
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  if (headers.length !== CSV_TEMPLATE_HEADERS.length) {
    throw new AppError(
      `The file "${file.name}" has ${headers.length} column(s) but ${CSV_TEMPLATE_HEADERS.length} are expected. Download the template to see the expected format.`,
      400,
      { name: file.name, columns: headers.length, expected: CSV_TEMPLATE_HEADERS.length },
      'CSV_COLUMN_COUNT_MISMATCH'
    );
  }
  const missing = CSV_TEMPLATE_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    throw new AppError(
      `The file "${file.name}" does not follow the expected format. Missing columns: ${missing.join(', ')}.`,
      400,
      { name: file.name, missing },
      'CSV_MISSING_COLUMNS'
    );
  }
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
  // All downstream steps (validation, images, AI, sync, review) operate on the
  // merged dataset built from every parsed CSV, in upload order. The dataId of
  // the most recently processed file is used as the handle for the merged set.
  const active = store.getActiveDataset();
  if (active && (active.dataId === dataId || store.getDataset(dataId))) {
    return active;
  }
  const dataset = store.getDataset(dataId);
  if (!dataset) {
    throw new AppError(`Data ${dataId} not found`, 404);
  }
  return dataset;
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

function hasPrestashopConfig(config: PrestaShopConfig): boolean {
  return Boolean(config.base_url && config.api_key);
}

async function clearCsvUploads(store: DataStore, uploadsDir: string): Promise<void> {
  for (const upload of store.uploads.values()) {
    await fs.remove(upload.path);
  }
  store.uploads.clear();
  store.datasets.clear();
  store.validationResults.clear();
  store.consistencyResults.clear();
  store.matchingResults.clear();
  store.aiSuggestions.clear();
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
  const uploadsDir = deps.uploadsDir || path.join(__dirname, '..', 'uploads');
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
    deps.configPersistence?.save(next);
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
      assertCsvFormat(file);

      if ([...store.uploads.values()].some((upload) => upload.originalName === file.name)) {
        throw new AppError(`The file "${file.name}" has already been uploaded`, 400);
      }

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

      // A CSV upload replaces any PrestaShop-fetched dataset: the two sources
      // are mutually exclusive (the UI warns before this happens).
      store.prestashopDataset = undefined;
      store.validationResults.clear();
      store.consistencyResults.clear();

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

      const duplicate = files.find((file) => store.images.some((image) => image.filename === file.name));
      if (duplicate) {
        throw new AppError(`The image "${duplicate.name}" has already been uploaded`, 400);
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
      const existing = new Set(store.images.map((image) => image.filename));
      const fresh = scanned.filter((image) => !existing.has(image.filename));
      store.images.push(...fresh);

      res.json({
        success: true,
        message: `Image folder selected (${fresh.length} image(s) found)`,
        count: fresh.length
      });
    })
  );

  router.get('/template/csv', (_req, res) => {
    const headerLine = CSV_TEMPLATE_HEADERS.join(',');
    const emptyRow = CSV_TEMPLATE_HEADERS.map(() => '').join(',');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=catalog_template.csv');
    res.send(`${headerLine}\n${emptyRow}\n`);
  });

  router.get('/uploads', (_req, res) => {
    const ps = store.prestashopDataset;
    res.json({
      success: true,
      data: {
        csvs: [...store.uploads.values()].map((upload) => ({
          id: upload.fileId,
          name: upload.originalName
        })),
        images: store.images.map((image) => ({ id: image.filename, name: image.filename })),
        prestashop: ps
          ? { present: true, dataId: ps.dataId, count: ps.products.length }
          : { present: false }
      }
    });
  });

  router.delete(
    '/upload/csv/:fileId',
    wrap(async (req, res) => {
      const uploaded = store.uploads.get(req.params.fileId);
      if (!uploaded) throw new AppError('Uploaded file not found', 404);

      store.uploads.delete(req.params.fileId);
      store.datasets.delete(req.params.fileId);
      store.validationResults.clear();
      store.consistencyResults.clear();
      await fs.remove(uploaded.path);
      res.json({ success: true, message: 'CSV file removed' });
    })
  );

  router.delete(
    '/upload/images/:name',
    wrap(async (req, res) => {
      const index = store.images.findIndex((image) => image.filename === req.params.name);
      if (index === -1) throw new AppError('Image not found', 404);

      const [removed] = store.images.splice(index, 1);
      if (removed.path.startsWith(path.resolve(uploadsDir))) {
        await fs.remove(removed.path);
      }
      res.json({ success: true, message: 'Image removed' });
    })
  );

  router.delete(
    '/uploads/csv',
    wrap(async (req, res) => {
      for (const upload of store.uploads.values()) {
        await fs.remove(upload.path);
      }
      store.uploads.clear();
      store.datasets.clear();
      store.validationResults.clear();
      store.consistencyResults.clear();
      store.matchingResults.clear();
      store.aiSuggestions.clear();
      res.json({ success: true, message: 'All CSV files removed' });
    })
  );

  router.delete(
    '/uploads/images',
    wrap(async (req, res) => {
      for (const image of store.images) {
        if (image.path.startsWith(path.resolve(uploadsDir))) {
          await fs.remove(image.path);
        }
      }
      store.images = [];
      res.json({ success: true, message: 'All images removed' });
    })
  );

  // PrestaShop Webservice fetch
  // Builds a working dataset straight from PrestaShop (by EAN and/or reference,
  // with optional filters) as an alternative data source to uploading a CSV.
  // Fetching replaces any uploaded CSVs, which are discarded.
  router.post(
    '/fetch/prestashop',
    wrap(async (req, res) => {
      const prestashop = store.config.prestashop;
      if (!hasPrestashopConfig(prestashop)) {
        throw new AppError('PrestaShop must be configured to fetch products', 400);
      }

      const body = req.body ?? {};
      const eans = Array.isArray(body.eans) ? (body.eans as string[]) : [];
      const references = Array.isArray(body.references) ? (body.references as string[]) : [];
      const normalizedEans = eans
        .map((ean) => String(ean).replace(/[^0-9]/g, ''))
        .filter(Boolean);
      const normalizedReferences = references.map((reference) => String(reference).trim()).filter(Boolean);

      if (normalizedEans.length === 0 && normalizedReferences.length === 0) {
        throw new AppError('Provide at least one EAN or one reference', 400);
      }

      const client = buildPrestashopClient(deps, prestashop);
      const fetcher = new PrestaShopFetcher(client);
      const products = await fetcher.fetch({
        eans: normalizedEans,
        references: normalizedReferences,
        description: body.description === 'with' || body.description === 'without' ? body.description : 'all',
        images: body.images === 'with' || body.images === 'without' ? body.images : 'all',
        limit: PRESTASHOP_FETCH_LIMIT
      });

      if (products.length === 0) {
        throw new AppError('No products matched the given criteria', 404);
      }

      const dataId = store.newId('ps');
      store.prestashopDataset = {
        dataId,
        fileId: dataId,
        fileName: 'PrestaShop',
        products,
        csvHeaders: [],
        totalRows: products.length
      };
      await clearCsvUploads(store, uploadsDir);

      res.json({
        success: true,
        message: `${products.length} product(s) fetched from PrestaShop`,
        data: {
          data_id: dataId,
          products,
          summary: { total: products.length }
        }
      });
    })
  );

  router.delete('/fetch/prestashop', (req, res) => {
    store.prestashopDataset = undefined;
    store.validationResults.clear();
    store.consistencyResults.clear();
    res.json({ success: true, message: 'PrestaShop data discarded' });
  });

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

      const dataId = fileId;
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
        data: {
          data_id: dataId,
          products,
          summary: { total: products.length }
        }
      });
    })
  );

  router.get('/process/csv/:fileId', (req, res) => {
    const uploaded = requireUploadedFile(store, req.params.fileId);
    const dataset = store.getDataset(req.params.fileId);
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
      const baseRequired = ['name', 'ean', 'reference'];
      const configured = store.config.validation.required_fields || [];
      const requiredFields = Array.from(new Set([...baseRequired, ...configured]));
      // Local data validation (required fields, formats, duplicates) runs over the
      // merged dataset from every uploaded CSV, so duplicates are detected across
      // files, not just within a single file.
      const validator = new ProductValidator(getDefaultProductRules(), requiredFields, ['ean', 'reference']);

      const products = dataset.products.map((product) => {
        const result = validator.validateProduct(product, { products: dataset.products });
        product.validation_errors = result.errors || [];
        product.warnings = result.warnings || [];
        product.status = result.valid ? 'valid' : 'invalid';
        return product;
      });

      // Consistency check against PrestaShop: resolve each row's EAN to its
      // combination/product (batched requests) and detect inconsistent
      // product-level fields across combinations of the same id_product.
      const prestashop = store.config.prestashop;
      let consistency: ConsistencyResult = {
        resolutions: [],
        issues: [],
        not_found_count: 0,
        checked: false,
        message: 'PrestaShop is not configured. Consistency check skipped.'
      };

      if (hasPrestashopConfig(prestashop)) {
        const client = buildPrestashopClient(deps, prestashop);
        const consistencyValidator = new ConsistencyValidator(client, prestashop.language_id ?? 1);
        consistency = await consistencyValidator.validate(dataset.products);

        for (const issue of consistency.issues) {
          for (const value of issue.values) {
            const product = products.find((p) => p.id === value.row_id);
            if (!product) continue;
            product.validation_errors.push({
              field: issue.field,
              message: issue.message,
              code: 'PRODUCT_LEVEL_INCONSISTENCY',
              severity: 'error',
              value: value.value
            });
            product.status = 'invalid';
          }
        }

        for (const resolution of consistency.resolutions) {
          if (!resolution.error) continue;
          const product = products.find((p) => p.id === resolution.row_id);
          if (!product) continue;
          product.validation_errors.push({
            field: 'ean',
            message: resolution.error,
            code: 'EAN_NOT_FOUND',
            severity: 'error',
            value: resolution.row.ean
          });
          product.status = 'invalid';
        }
      }

      store.validationResults.set(req.params.dataId, { products });
      store.consistencyResults.set(req.params.dataId, consistency);
      res.json({
        success: true,
        message: 'Products validated',
        data: { products, summary: { total: products.length }, consistency }
      });
    })
  );

  // Uploads the (edited) validated rows back to PrestaShop. Only fields that are
  // filled in the CSV and differ from the current store value are updated; empty
  // cells never overwrite existing values.
  router.post(
    '/validate/upload/:dataId',
    wrap(async (req, res) => {
      const dataset = requireDataset(store, req.params.dataId);
      const prestashop = store.config.prestashop;
      if (!hasPrestashopConfig(prestashop)) {
        throw new AppError('PrestaShop must be configured to upload changes', 400);
      }

      const consistency = store.consistencyResults.get(req.params.dataId);
      if (!consistency || !consistency.checked) {
        throw new AppError('Run "Validate products" first so the data can be matched to PrestaShop', 400);
      }

      const body = req.body ?? {};
      const editedRows = Array.isArray(body.rows) ? body.rows : dataset.products;

      const client = buildPrestashopClient(deps, prestashop);
      const sync = new CombinationSync(client, prestashop.language_id ?? 1);
      const result = await sync.upload(consistency.resolutions, editedRows);

      res.json({ success: true, message: 'Changes uploaded to PrestaShop', data: result });
    })
  );

  router.get('/validate/results/:dataId', (req, res) => {
    const stored = store.validationResults.get(req.params.dataId);
    if (!stored) throw new AppError('Validation results not found', 404);
    res.json({
      success: true,
      data: { products: stored.products, consistency: store.consistencyResults.get(req.params.dataId) ?? null }
    });
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
