// Shared type definitions for CatalogIA frontend

export type ProductField =
  | 'ean' | 'ean13' | 'reference' | 'sku' | 'name' | 'description'
  | 'description_short' | 'price' | 'wholesale_price' | 'quantity'
  | 'brand' | 'manufacturer' | 'category' | 'tax'
  | 'image_hints';

export type Severity = 'error' | 'warning';

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  severity: Severity;
  value?: any;
}

export interface ProductData {
  id: string;
  status: string;
  source_file: string;
  validation_errors: ValidationError[];
  warnings: string[];
  name: string;
  reference?: string;
  sku?: string;
  ean?: string;
  ean13?: string;
  description?: string;
  description_short?: string;
  meta_title?: string;
  meta_description?: string;
  link_rewrite?: string;
  price?: number;
  wholesale_price?: number;
  quantity?: number;
  brand?: string;
  category?: string;
  tax?: string;
  specifications?: string;
  use_case?: string;
  selected_images?: ImageFile[];
  prestashop_id?: string;
  is_new?: boolean;
  is_updated?: boolean;
}

export type ImageMatchStrategy = 'ean' | 'reference' | 'filename_pattern' | 'manual';

export interface ImageFile {
  filename: string;
  path: string;
  format: string;
  size_in_bytes?: number;
  width?: number;
  height?: number;
  matched_ean?: string;
  matched_reference?: string;
  description?: string;
  match_score?: number;
  match_strategy?: ImageMatchStrategy;
}

export interface ImageMatchResult {
  product_id: string;
  matched_files: ImageFile[];
  match_score: number;
  match_strategy: ImageMatchStrategy;
  confidence: number;
  reasons: Array<{ type: string; score: number; description: string }>;
}

export type AIContentField =
  | 'name' | 'description_short' | 'description'
  | 'meta_title' | 'meta_description' | 'link_rewrite';

export type AIProviderName = 'openai' | 'anthropic' | 'openrouter' | 'mock';

export interface AIConfig {
  provider: AIProviderName;
  model?: string;
  api_key?: string;
  language?: string;
  enabled_fields: AIContentField[];
  max_requests_per_minute?: number;
  temperature?: number;
}

export interface AIResponse {
  original_field: AIContentField;
  suggested_value: string;
  confidence: number;
  improvements: string[];
  seo_notes?: any;
  warnings?: string[];
}

export type SyncOperation =
  | 'create_product' | 'update_product' | 'update_stock'
  | 'upload_image' | 'sync_single_product';

export type SyncStatus = 'in_progress' | 'completed' | 'failed';

export interface SyncConfig {
  batch_size: number;
}

export interface SyncPlan {
  products_to_create: ProductData[];
  products_to_update: ProductData[];
  stock_updates: StockUpdate[];
  images_to_upload: ImageUpload[];
  texts_to_update: TextUpdate[];
}

export interface StockUpdate {
  product_id: string;
  stock_available_id: string;
  new_quantity: number;
  reference?: string;
}

export interface ImageUpload {
  product_id: string;
  image_file: ImageFile;
}

export interface TextUpdate {
  product_id: string;
  field: string;
  new_value: string;
  original_value: string;
}

export interface SyncResult {
  operation: SyncOperation;
  status: SyncStatus;
  product_id: string;
  reference?: string;
  prestashop_id?: string;
  error?: string;
  retry_count: number;
  executed_at?: Date;
  response_data?: any;
}

export interface SyncSession {
  id: string;
  config: SyncConfig;
  plan: SyncPlan;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  started_at: Date;
  completed_at?: Date;
  dry_run: boolean;
  results?: SyncResult[];
}

export interface PrestaShopConfig {
  base_url: string;
  api_key: string;
  version: string;
  language_id: number;
  timeout?: number;
}

export interface ValidationConfig {
  required_fields: ProductField[];
  rules?: Record<string, any>;
}

export interface ImageMatcherConfig {
  strategy: ImageMatchStrategy;
  threshold?: number;
  max_images_per_product?: number;
}

export interface ImageSelectionConfig {
  max_images_per_product: number;
}

export interface ReviewState {
  products: any[];
  total_products: number;
  valid_count: number;
  invalid_count: number;
  warning_count: number;
  suggested_count: number;
  images_selected_count: number;
}

// API response envelopes
export interface ApiResponse {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
}

export interface UploadItem {
  id: string;
  name: string;
}

export interface PaginatedResponse<T = any> extends ApiResponse {
  items: T[];
  total: number;
  page?: number;
  page_size?: number;
}

export interface FileUploadResponse extends ApiResponse {
  file_id?: string;
  file_name?: string;
  rows?: number;
}

export interface SyncResponse extends ApiResponse {
  session?: SyncSession;
  session_id?: string;
}

export interface ConfigurationResponse extends ApiResponse {
  prestashop?: PrestaShopConfig;
  ai?: AIConfig;
  validation?: ValidationConfig;
  image_matcher?: ImageMatcherConfig;
}
