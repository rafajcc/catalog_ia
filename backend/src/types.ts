// Shared type definitions for CatalogIA

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

export interface ParsedRow {
  raw: Record<string, string>;
  normalized: Partial<ProductData>;
  errors: ValidationError[];
  warnings: string[];
}

export interface CSVConfig {
  delimiter: string;
  encoding: string;
  skip_empty_rows: boolean;
  headers_case_sensitive: boolean;
  field_mapping: Record<string, ProductField>;
}

export interface CSVResult {
  rows: ParsedRow[];
  headers: string[];
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  encoding_detected: string;
  parsing_time: number;
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

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
  warnings?: string[];
  error?: string;
  warning?: string;
}

export interface ValidationContext {
  products?: ProductData[];
}

export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'integer' | 'ean';
  required?: boolean;
  min?: number;
  max?: number;
  decimals?: number;
  pattern?: RegExp;
  custom?: (value: any) => ValidationResult;
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

export interface ImageCandidate extends ImageFile {
  score: number;
}

export interface ImageSelectionConfig {
  max_images_per_product: number;
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

export interface AIRequest {
  field: AIContentField;
  product: ProductData;
  context: string;
  language: string;
  max_length: number;
  style: {
    tone: string;
    audience: string;
    seo_friendly: boolean;
    include_features: boolean;
  };
}

export interface AIResponse {
  original_field: AIContentField;
  suggested_value: string;
  confidence: number;
  improvements: string[];
  seo_notes: any;
  warnings: string[];
}

export type SyncOperation =
  | 'create_product' | 'update_product' | 'update_stock'
  | 'upload_image' | 'sync_single_product';

export type SyncStatus = 'in_progress' | 'completed' | 'failed';

export interface SyncConfig {
  batch_size: number;
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

export interface SyncPlan {
  products_to_create: ProductData[];
  products_to_update: ProductData[];
  stock_updates: StockUpdate[];
  images_to_upload: ImageUpload[];
  texts_to_update: TextUpdate[];
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

export type ProductId = string;
export type EAN = string;
export type Reference = string;

export interface PrestaShopConfig {
  base_url: string;
  api_key: string;
  version: string;
  language_id: number;
  timeout?: number;
}

export interface PrestaShopProduct {
  id?: ProductId;
  reference?: Reference;
  ean13?: EAN;
  name?: Record<string, string>;
  description?: Record<string, string>;
  description_short?: Record<string, string>;
  price?: number;
  wholesale_price?: number;
  quantity?: number;
  tax_rules_group_id?: number;
  active?: boolean;
  link_rewrite?: string;
}

export interface PrestaShopStockAvailable {
  id?: string;
  id_product?: ProductId;
  quantity?: number;
  reference?: Reference;
}

export interface PrestaShopImageUpload {
  id_product: ProductId;
  position?: number;
  file: string;
  legend?: string;
}

export interface PrestaShopSyncResult {
  success: boolean;
  product_id?: ProductId;
  operation: string;
  errors: string[];
  warnings: string[];
  stock_updated?: boolean;
  images_uploaded?: number;
  timestamp: Date;
}

export interface PrestaShopAPIEndpoints {
  root: string;
  products: string;
  product: (id: ProductId) => string;
  stock_availables: string;
  stock_available: (id: string) => string;
  images: string;
  product_images: (productId: ProductId) => string;
  images_upload: (productId: ProductId) => string;
}

export interface AuditChange {
  field: string;
  type: 'added' | 'removed' | 'modified';
  old_value?: any;
  new_value?: any;
}

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  action: string;
  entity_type: 'product' | 'image' | 'sync' | 'ai_suggestion';
  entity_id: string;
  changes?: AuditChange[];
  metadata?: Record<string, any>;
  error?: string;
  user_id?: string;
  session_id?: string;
  ip_address?: string;
  user_agent?: string;
}

export type EditFieldType = 'text' | 'textarea' | 'number' | 'image_selection';

export interface EditField {
  field: string;
  label: string;
  type: EditFieldType;
  value: any;
  original_value: any;
  required: boolean;
  validation?: any;
  help_text?: string;
}

export interface ProductEditState {
  product_id: string;
  reference?: string;
  ean?: string;
  edits: EditField[];
  is_modified: boolean;
  validation_errors: ValidationError[];
  can_exclude: boolean;
  image_selection?: any;
}

export type BatchAction = 'accept_all' | 'reject_all' | 'exclude_selected' | 'reset_edits' | 'export_selected';

export interface ReviewFilters {
  status?: string[];
  search?: string;
  fields?: string[];
}

export interface ReviewState {
  products: ProductEditState[];
  filters: ReviewFilters;
  batch_actions: BatchAction[];
  total_products: number;
  valid_count: number;
  invalid_count: number;
  warning_count: number;
  suggested_count: number;
  images_selected_count: number;
}

export interface ReviewDiff {
  field: string;
  original: any;
  modified: any;
  type: 'added' | 'removed' | 'modified';
}
