// In-memory data store for the CatalogIA API.
// State is scoped to a single app instance so every createApp() call starts clean.

import { nanoid } from 'nanoid';
import { ReviewStateManager } from './modules/review-state/review-state';
import {
  AIConfig,
  AIResponse,
  ImageFile,
  ImageMatchResult,
  PrestaShopConfig,
  ProductData,
  ProductField,
  SyncSession
} from './types';

export interface ValidationConfig {
  required_fields: ProductField[];
  rules?: Record<string, any>;
}

export interface ImageMatcherConfig {
  strategy: string;
  threshold?: number;
  max_images_per_product?: number;
}

export interface UploadedFile {
  fileId: string;
  originalName: string;
  path: string;
  size: number;
  mimeType: string;
}

export interface DataSet {
  dataId: string;
  fileId: string;
  fileName: string;
  products: ProductData[];
  csvHeaders: string[];
  totalRows: number;
}

export interface CatalogConfig {
  prestashop: PrestaShopConfig;
  ai: AIConfig;
  validation: ValidationConfig;
  image_matcher: ImageMatcherConfig;
}

function defaultConfig(): CatalogConfig {
  return {
    prestashop: { base_url: '', api_key: '', version: '1.7', language_id: 1 },
    ai: { provider: 'mock', language: 'es', enabled_fields: ['name', 'description'] },
    validation: { required_fields: ['name'] },
    image_matcher: { strategy: 'ean', threshold: 0.7, max_images_per_product: 5 }
  };
}

export class DataStore {
  uploads = new Map<string, UploadedFile>();
  // One parsed dataset per uploaded CSV, keyed by fileId.
  datasets = new Map<string, DataSet>();
  validationResults = new Map<string, { products: ProductData[] }>();
  images: ImageFile[] = [];
  matchingResults = new Map<string, ImageMatchResult[]>();
  aiSuggestions = new Map<string, AIResponse[]>();
  syncSessions = new Map<string, SyncSession>();
  reviewManagers = new Map<string, ReviewStateManager>();
  config: CatalogConfig = defaultConfig();

  newId(prefix = 'data'): string {
    return `${prefix}_${nanoid(8)}`;
  }

  getDataset(fileId: string): DataSet | undefined {
    return this.datasets.get(fileId);
  }

  // Merges every parsed CSV into a single working dataset, in upload order.
  getActiveDataset(): DataSet | undefined {
    const datasets: DataSet[] = [];
    for (const fileId of this.uploads.keys()) {
      const dataset = this.datasets.get(fileId);
      if (dataset) datasets.push(dataset);
    }
    if (datasets.length === 0) return undefined;

    const last = datasets[datasets.length - 1];
    return {
      dataId: last.dataId,
      fileId: last.fileId,
      fileName: datasets.map((d) => d.fileName).join(', '),
      products: datasets.flatMap((d) => d.products),
      csvHeaders: last.csvHeaders,
      totalRows: datasets.reduce((sum, d) => sum + d.totalRows, 0)
    };
  }
}
