// Shared type definitions for CatalogIA frontend

export type ProductField =
  | 'ean' | 'ean13' | 'reference' | 'name' | 'description'
  | 'description_short' | 'price' | 'wholesale_price' | 'quantity'
  | 'brand' | 'category' | 'tax'
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

// Consistency check against PrestaShop: every CSV row is one combination
// (id_product_attribute) of a product (id_product) found by its EAN.
export interface PrestaShopCombinationInfo {
  id_product_attribute: string;
  id_product: string;
  reference?: string;
  ean13?: string;
  price?: number;
  wholesale_price?: number;
  stock_available_id?: string;
  quantity?: number;
}

export interface PrestaShopProductInfo {
  id: string;
  reference?: string;
  ean13?: string;
  name?: string;
  description?: string;
  description_short?: string;
  tax_rules_group_id?: number;
  price?: number;
  wholesale_price?: number;
  manufacturer_id?: string;
  categories?: string[];
}

export interface RowResolution {
  row_id: string;
  row: ProductData;
  id_product?: string;
  combination?: PrestaShopCombinationInfo;
  product?: PrestaShopProductInfo;
  error?: string;
}

export interface ConsistencyIssueValue {
  row_id: string;
  value: string;
}

export interface ConsistencyIssue {
  field: string;
  id_product: string;
  values: ConsistencyIssueValue[];
  message: string;
}

export interface ConsistencyResult {
  resolutions: RowResolution[];
  issues: ConsistencyIssue[];
  not_found_count: number;
  checked: boolean;
  message?: string;
}

export interface CombinationSyncResult {
  row_id: string;
  operation: string;
  status: 'completed' | 'failed' | 'skipped';
  error?: string;
}

export interface UploadChangesResult {
  products_updated: number;
  combinations_updated: number;
  stock_updated: number;
  manufacturers_created: number;
  categories_created: number;
  results: CombinationSyncResult[];
}

export interface ConfigurationResponse extends ApiResponse {
  prestashop?: PrestaShopConfig;
  ai?: AIConfig;
  validation?: ValidationConfig;
  image_matcher?: ImageMatcherConfig;
}
