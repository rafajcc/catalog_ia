// PrestaShop Client Module
// Handles all Webservice API interactions with PrestaShop (XML and multipart).
// Supports PrestaShop 1.7+ with proper error handling and authentication.

import axios, { AxiosInstance } from 'axios';
import { xml2json, json2xml } from 'xml-js';
import { FormData, Blob } from 'formdata-node';
import { readFileSync } from 'fs';
import path from 'path';
import { logger } from '../../utils/logger';
import {
  PrestaShopConfig,
  PrestaShopProduct,
  PrestaShopStockAvailable,
  PrestaShopImageUpload,
  PrestaShopSyncResult,
  PrestaShopAPIEndpoints,
  PrestaShopCombinationInfo,
  PrestaShopProductInfo,
  ProductData,
  ProductId,
  Reference
} from '../../types';

export class PrestaShopClient {
  private client: AxiosInstance;
  private config: PrestaShopConfig;
  private endpoints: PrestaShopAPIEndpoints;

  constructor(config: PrestaShopConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: this.normalizeBaseUrl(config.base_url),
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/xml'
      }
    });

    this.endpoints = this.buildEndpoints(config.version);

    this.setupInterceptors();
  }

  private normalizeBaseUrl(url: string): string {
    // The store root works without the trailing "/api": all endpoints are
    // built relative to it (see buildEndpoints), so strip it when present.
    return url.trim().replace(/\/api\/?$/, '');
  }

  private buildEndpoints(_version: string): PrestaShopAPIEndpoints {
    const base = '/api';
    return {
      root: base,
      products: `${base}/products`,
      product: (id: ProductId) => `${base}/products/${id}`,
      combinations: `${base}/combinations`,
      combination: (id: string) => `${base}/combinations/${id}`,
      stock_availables: `${base}/stock_availables`,
      stock_available: (id: string) => `${base}/stock_availables/${id}`,
      manufacturers: `${base}/manufacturers`,
      categories: `${base}/categories`,
      images: `${base}/images`,
      product_images: (productId: ProductId) => `${base}/images/products/${productId}`,
      images_upload: (productId: ProductId) => `${base}/images/products/${productId}`
    };
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        // PrestaShop's webservice authenticates with HTTP Basic auth: the API
        // key is the username and the password is empty ("KEY:"). It does not
        // accept a Bearer token.
        const credentials = Buffer.from(`${this.config.api_key}:`).toString('base64');
        config.headers['Authorization'] = `Basic ${credentials}`;
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const { response } = error;

        if (response?.status === 401) {
          logger.error('PrestaShop API authentication failed', {
            baseUrl: this.config.base_url,
            error: error.message
          });
          throw new Error('Invalid PrestaShop API key or insufficient permissions');
        }

        if (response?.status === 404) {
          logger.warn('PrestaShop resource not found', {
            url: error.config?.url,
            method: error.config?.method
          });
        }

        if (response?.status >= 500) {
          logger.error('PrestaShop server error', {
            status: response.status,
            url: error.config?.url,
            error: error.message
          });
        }

        return Promise.reject(error);
      }
    );
  }

  async resolveProduct(filters: Partial<PrestaShopProduct>): Promise<PrestaShopProduct | null> {
    try {
      const params = this.buildQueryParams(filters);
      const response = await this.client.get(this.endpoints.products, { params });
      const products = this.toArray(this.parseXmlResponse(response.data)?.prestashop?.products?.product);

      if (products.length > 0) {
        return this.extractProduct(products[0]);
      }

      return null;
    } catch (error) {
      logger.error('Failed to resolve product', { filters, error });
      throw new Error(`Product resolution failed: ${(error as Error).message}`);
    }
  }

  async resolveStockAvailable(productId: ProductId, reference?: Reference): Promise<PrestaShopStockAvailable | null> {
    try {
      const params = reference 
        ? { id_product: 0, reference }
        : { id_product: parseInt(productId) };

      const response = await this.client.get(this.endpoints.stock_availables, { params });
      const stockData = this.toArray(this.parseXmlResponse(response.data)?.prestashop?.stock_availables?.stock_available);

      if (stockData.length > 0) {
        return this.extractStockAvailable(stockData[0]);
      }

      return null;
    } catch (error) {
      logger.error('Failed to resolve stock available', { productId, reference, error });
      return null; // Don't fail the whole process for stock lookup failures
    }
  }

  // -------------------------------------------------------------------------
  // Batch resolution
  // -------------------------------------------------------------------------
  // The Webservice supports OR filters (`[value1|value2|...]`) and `display=full`,
  // so many combinations/products can be fetched in a few requests instead of one
  // per EAN. Values are chunked to keep the request URL within safe limits.

  private readonly BATCH_SIZE = 100;

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  private async getResourceList(path: string, params: Record<string, any>): Promise<any> {
    const response = await this.client.get(path, { params });
    return this.parseXmlResponse(response.data)?.prestashop;
  }

  // Fetches the combinations matching any of the given EANs, resolving the
  // mapping EAN -> id_product_attribute -> id_product in a few batch requests.
  async fetchCombinationsByEan(eans: string[]): Promise<PrestaShopCombinationInfo[]> {
    const unique = Array.from(new Set(eans.map((ean) => ean.replace(/[^0-9]/g, '')).filter(Boolean)));
    const results: PrestaShopCombinationInfo[] = [];

    for (const batch of this.chunk(unique, this.BATCH_SIZE)) {
      const root = await this.getResourceList(this.endpoints.combinations, {
        'filter[ean13]': `[${batch.join('|')}]`,
        display: 'full',
        limit: 1000
      });
      const nodes = this.toArray(root?.combinations?.combination);
      results.push(...nodes.map((node) => this.extractCombination(node)));
    }

    return results;
  }

  // Fetches product-level data for the given product ids.
  async fetchProductsById(ids: string[]): Promise<PrestaShopProductInfo[]> {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    const results: PrestaShopProductInfo[] = [];

    for (const batch of this.chunk(unique, this.BATCH_SIZE)) {
      const root = await this.getResourceList(this.endpoints.products, {
        'filter[id]': `[${batch.join('|')}]`,
        display: 'full',
        limit: 1000
      });
      const nodes = this.toArray(root?.products?.product);
      results.push(...nodes.map((node) => this.extractProductInfo(node)));
    }

    return results;
  }

  // Fetches stock quantities for the given stock_available ids.
  async fetchStockByIds(ids: string[]): Promise<Array<{ id: string; quantity?: number }>> {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    const results: Array<{ id: string; quantity?: number }> = [];

    for (const batch of this.chunk(unique, this.BATCH_SIZE)) {
      const root = await this.getResourceList(this.endpoints.stock_availables, {
        'filter[id]': `[${batch.join('|')}]`,
        display: 'full',
        limit: 1000
      });
      const nodes = this.toArray(root?.stock_availables?.stock_available);
      const entries: Array<{ id?: string; quantity?: number }> = nodes.map((node) => {
        const stock = this.extractStockAvailable(node);
        return { id: stock.id, quantity: stock.quantity };
      });
      results.push(...entries.filter((entry) => !!entry.id).map((entry) => ({ id: entry.id as string, quantity: entry.quantity })));
    }

    return results;
  }

  async updateCombination(id: string, update: Partial<PrestaShopCombinationInfo>): Promise<PrestaShopSyncResult> {
    try {
      const xmlData = this.toUpdateXml('combination', this.combinationToXml(update));
      await this.client.patch(this.endpoints.combination(id), xmlData);

      logger.info('Combination updated successfully', { combinationId: id });

      return {
        success: true,
        operation: 'update_combination',
        errors: [],
        warnings: [],
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to update combination', { combinationId: id, error });
      return {
        success: false,
        operation: 'update_combination',
        errors: [(error as Error).message],
        warnings: [],
        timestamp: new Date()
      };
    }
  }

  // Updates product-level fields (name, descriptions, tax, manufacturer,
  // categories). Uses the `<prestashop><product>...</product></prestashop>`
  // envelope required by the Webservice.
  async updateProductFields(id: string, update: Partial<PrestaShopProduct>): Promise<PrestaShopSyncResult> {
    try {
      const xmlData = this.toUpdateXml('product', update);
      await this.client.patch(this.endpoints.product(id), xmlData);

      logger.info('Product fields updated successfully', {
        productId: id,
        fields: Object.keys(update)
      });

      return {
        success: true,
        operation: 'update_product',
        product_id: id,
        errors: [],
        warnings: [],
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to update product fields', { productId: id, error });
      return {
        success: false,
        operation: 'update_product',
        product_id: id,
        errors: [(error as Error).message],
        warnings: [],
        timestamp: new Date()
      };
    }
  }

  // Resolves a brand name to its manufacturer id (matching any language,
  // case-insensitively), or null when it does not exist.
  async resolveManufacturer(name: string): Promise<string | null> {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return null;

    const root = await this.getResourceList(this.endpoints.manufacturers, {
      display: 'full',
      limit: 1000
    });
    const nodes = this.toArray(root?.manufacturers?.manufacturer);

    for (const node of nodes) {
      const nodeName = this.extractLocalized(node?.name, this.config.language_id);
      if (nodeName && nodeName.trim().toLowerCase() === normalized) {
        return node?._attributes?.id as string | undefined ?? null;
      }
    }

    return null;
  }

  async createManufacturer(name: string): Promise<string | null> {
    try {
      const xmlData = this.toEnvelopeXml('manufacturer', {
        name: { _cdata: name },
        active: 1
      });
      const response = await this.client.post(this.endpoints.manufacturers, xmlData);
      const created = this.parseXmlResponse(response.data)?.prestashop?.manufacturer;
      const id = created?._attributes?.id as string | undefined;
      logger.info('Manufacturer created', { name, manufacturerId: id });
      return id ?? null;
    } catch (error) {
      logger.error('Failed to create manufacturer', { name, error });
      return null;
    }
  }

  // Resolves a category name to its category id (matching any language,
  // case-insensitively), or null when it does not exist.
  async resolveCategoryByName(name: string): Promise<string | null> {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return null;

    const root = await this.getResourceList(this.endpoints.categories, {
      'filter[name]': `[${name.trim()}]`,
      display: 'full',
      limit: 1000
    });
    const nodes = this.toArray(root?.categories?.category);

    for (const node of nodes) {
      const nodeName = this.extractLocalized(node?.name, this.config.language_id);
      if (nodeName && nodeName.trim().toLowerCase() === normalized) {
        return node?._attributes?.id as string | undefined ?? null;
      }
    }

    return null;
  }

  // Creates a category under a default parent (the Home/root category is id 2
  // in a default PrestaShop install).
  async createCategory(name: string, parentId = 2): Promise<string | null> {
    try {
      const xmlData = this.toEnvelopeXml('category', {
        id_parent: parentId,
        active: 1,
        name: this.localizedField(name)
      });
      const response = await this.client.post(this.endpoints.categories, xmlData);
      const created = this.parseXmlResponse(response.data)?.prestashop?.category;
      const id = created?._attributes?.id as string | undefined;
      logger.info('Category created', { name, categoryId: id });
      return id ?? null;
    } catch (error) {
      logger.error('Failed to create category', { name, error });
      return null;
    }
  }

  async updateStock(stockUpdate: Partial<PrestaShopStockAvailable>): Promise<PrestaShopSyncResult> {
    try {
      const xmlData = this.jsonToXml(stockUpdate);
      await this.client.put(
        this.endpoints.stock_available(stockUpdate.id || ''),
        xmlData
      );

      logger.info('Stock updated successfully', {
        stockId: stockUpdate.id,
        productId: stockUpdate.id_product
      });

      return {
        success: true,
        operation: 'update_stock',
        errors: [],
        warnings: [],
        stock_updated: true,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to update stock', { stockUpdate, error });
      return {
        success: false,
        operation: 'update_stock',
        errors: [(error as Error).message],
        warnings: [],
        stock_updated: false,
        timestamp: new Date()
      };
    }
  }

  async updateProduct(productUpdate: Partial<PrestaShopProduct>): Promise<PrestaShopSyncResult> {
    try {
      const xmlData = this.jsonToXml(productUpdate);
      const response = await this.client.patch(
        this.endpoints.product(productUpdate.id!),
        xmlData
      );

      this.parseXmlResponse(response.data);

      logger.info('Product updated successfully', {
        productId: productUpdate.id,
        fields: Object.keys(productUpdate)
      });

      return {
        success: true,
        operation: 'update_product',
        product_id: productUpdate.id,
        errors: [],
        warnings: [],
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to update product', { productId: productUpdate.id, error });
      return {
        success: false,
        product_id: productUpdate.id,
        operation: 'update_product',
        errors: [(error as Error).message],
        warnings: [],
        stock_updated: false,
        timestamp: new Date()
      };
    }
  }

  async createProduct(productData: PrestaShopProduct): Promise<PrestaShopSyncResult> {
    try {
      const xmlData = this.jsonToXml(productData);
      const response = await this.client.post(this.endpoints.products, xmlData);
      const createdProduct = this.parseXmlResponse(response.data)?.prestashop?.product ?? {};

      const createdId = createdProduct._attributes?.id;
      const createdReference = createdProduct.reference?._cdata ?? createdProduct.reference?._text;

      logger.info('Product created successfully', {
        productId: createdId,
        reference: createdReference
      });

      return {
        success: true,
        product_id: createdId,
        operation: 'create_product',
        errors: [],
        warnings: [],
        stock_updated: false,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to create product', { productData, error });
      return {
        success: false,
        operation: 'create_product',
        errors: [(error as Error).message],
        warnings: [],
        stock_updated: false,
        timestamp: new Date()
      };
    }
  }

  async uploadProductImage(imageData: PrestaShopImageUpload): Promise<PrestaShopSyncResult> {
    try {
      const formData = new FormData();

      // Add image file
      const fileBuffer = readFileSync(imageData.file);
      formData.append('image', new Blob([fileBuffer]), path.basename(imageData.file));

      // Add image metadata
      formData.append('position', imageData.position?.toString() || '0');
      formData.append('legend', '');

      await this.client.post(
        this.endpoints.images_upload(imageData.id_product),
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      logger.info('Product image uploaded successfully', {
        productId: imageData.id_product,
        filename: path.basename(imageData.file)
      });

      return {
        success: true,
        product_id: imageData.id_product,
        operation: 'upload_image',
        errors: [],
        warnings: [],
        images_uploaded: 1,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to upload product image', { imageData, error });
      return {
        success: false,
        product_id: imageData.id_product,
        operation: 'upload_image',
        errors: [(error as Error).message],
        warnings: [],
        images_uploaded: 0,
        timestamp: new Date()
      };
    }
  }

  async syncSingleProduct(product: ProductData): Promise<PrestaShopSyncResult> {
    try {
      // Check if product already exists
      const existingProduct = await this.resolveProduct({
        reference: product.reference
      });

      let result: PrestaShopSyncResult;

      if (existingProduct && existingProduct.id) {
        // Update existing product
        const productUpdate: Partial<PrestaShopProduct> = {
          id: existingProduct.id,
          name: { [this.config.language_id.toString()]: product.name || '' },
          description: { [this.config.language_id.toString()]: product.description || '' },
          description_short: { [this.config.language_id.toString()]: product.description_short || '' },
          active: true,
          reference: product.reference
        };

        // Only overwrite fields that were provided, so empty cells keep the store values
        if (product.price !== undefined) {
          productUpdate.price = product.price;
        }
        if (product.wholesale_price !== undefined) {
          productUpdate.wholesale_price = product.wholesale_price;
        }
        if (product.quantity !== undefined) {
          productUpdate.quantity = product.quantity;
        }
        if (product.tax !== undefined) {
          productUpdate.tax_rules_group_id = Number(product.tax);
        }

        result = await this.updateProduct(productUpdate);
      } else {
        // Create new product
        const newProduct: PrestaShopProduct = {
          name: { [this.config.language_id.toString()]: product.name || '' },
          description: { [this.config.language_id.toString()]: product.description || '' },
          description_short: { [this.config.language_id.toString()]: product.description_short || '' },
          active: true,
          reference: product.reference,
          ean13: product.ean,
          link_rewrite: this.generateSlug(product.name || '')
        };

        if (product.price !== undefined) {
          newProduct.price = product.price;
        }
        if (product.wholesale_price !== undefined) {
          newProduct.wholesale_price = product.wholesale_price;
        }
        if (product.tax !== undefined) {
          newProduct.tax_rules_group_id = Number(product.tax);
        }

        result = await this.createProduct(newProduct);
      }

      // Update stock if quantity is provided
      if (product.quantity !== undefined && result.success && result.product_id) {
        const stockResult = await this.resolveStockAvailable(result.product_id);
        if (stockResult) {
          const stockUpdate: Partial<PrestaShopStockAvailable> = {
            id: stockResult.id,
            id_product: result.product_id,
            quantity: product.quantity
          };
          await this.updateStock(stockUpdate);
          result.stock_updated = true;
        }
      }

      // Upload images if any are selected
      if (product.selected_images && product.selected_images.length > 0 && result.success) {
        let totalImagesUploaded = 0;
        for (let i = 0; i < product.selected_images.length && i < 5; i++) {
          const imageUpload: PrestaShopImageUpload = {
            id_product: result.product_id!,
            position: i + 1,
            file: product.selected_images[i].path
          };

          const imageResult = await this.uploadProductImage(imageUpload);
          if (imageResult.success) {
            totalImagesUploaded += imageResult.images_uploaded || 0;
          }
        }
        result.images_uploaded = totalImagesUploaded;
      }

      return result;
    } catch (error) {
      logger.error('Failed to sync single product', { product, error });
      return {
        success: false,
        operation: 'sync_single_product',
        errors: [(error as Error).message],
        warnings: [],
        stock_updated: false,
        images_uploaded: 0,
        timestamp: new Date()
      };
    }
  }

  private buildQueryParams(filters: Partial<PrestaShopProduct>): Record<string, any> {
    const params: Record<string, any> = {};

    if (filters.id) params.id = filters.id;
    if (filters.reference) params.reference = filters.reference;
    if (filters.ean13) params.ean13 = filters.ean13;
    if (filters.active !== undefined) params.active = filters.active;

    return params;
  }

  private parseXmlResponse(xml: string): any {
    try {
      return JSON.parse(xml2json(xml, { compact: true, spaces: 2 }));
    } catch (error) {
      logger.error('XML parsing failed', { xml, error });
      throw new Error('Invalid XML response from PrestaShop');
    }
  }

  private toArray<T>(value: T | T[] | null | undefined): T[] {
    if (value === undefined || value === null) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  }

  private extractText(value: any): string | undefined {
    return value?._cdata ?? value?._text;
  }

  private toNumber(value: string | undefined): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const number = parseFloat(value);
    return isNaN(number) ? undefined : number;
  }

  // PrestaShop keeps localized fields as `<name><language id="N">...</language></name>`.
  // Picks the configured language, falling back to the first available one.
  private extractLocalized(node: any, languageId: number): string | undefined {
    if (!node) return undefined;
    const languages = this.toArray(node.language);
    const found = languages.find((language) => Number(language?._attributes?.id) === languageId);
    return this.extractText(found ?? languages[0]);
  }

  private extractCombination(node: any): PrestaShopCombinationInfo {
    const stockNodes = this.toArray(node?.associations?.stock_availables?.stock_available);
    return {
      id_product_attribute: node?._attributes?.id,
      id_product: this.extractText(node?.id_product) ?? '',
      reference: this.extractText(node?.reference),
      ean13: this.extractText(node?.ean13),
      price: this.toNumber(this.extractText(node?.price)),
      wholesale_price: this.toNumber(this.extractText(node?.wholesale_price)),
      stock_available_id: stockNodes[0]?._attributes?.id
    };
  }

  private extractProductInfo(node: any): PrestaShopProductInfo {
    const categoryNodes = this.toArray(node?.associations?.categories?.category);
    return {
      id: node?._attributes?.id,
      reference: this.extractText(node?.reference),
      ean13: this.extractText(node?.ean13),
      name: this.extractLocalized(node?.name, this.config.language_id),
      description: this.extractLocalized(node?.description, this.config.language_id),
      description_short: this.extractLocalized(node?.description_short, this.config.language_id),
      tax_rules_group_id: this.toNumber(this.extractText(node?.tax_rules_group_id)),
      price: this.toNumber(this.extractText(node?.price)),
      wholesale_price: this.toNumber(this.extractText(node?.wholesale_price)),
      manufacturer_id: node?.manufacturer?._attributes?.id as string | undefined,
      categories: categoryNodes.map((category) => category?._attributes?.id).filter(Boolean)
    };
  }

  private extractProduct(node: any): PrestaShopProduct {
    return {
      id: node?._attributes?.id,
      reference: this.extractText(node?.reference),
      ean13: this.extractText(node?.ean13)
    };
  }

  // Localized field builder for update payloads:
  // { language: { _attributes: { id }, _cdata: value } } -> <language id="N"><![CDATA[...]]></language>
  private localizedField(value: string): Record<string, any> {
    return {
      language: {
        _attributes: { id: this.config.language_id.toString() },
        _cdata: value
      }
    };
  }

  private combinationToXml(update: Partial<PrestaShopCombinationInfo>): Record<string, any> {
    const xml: Record<string, any> = {};
    if (update.id_product_attribute) xml.id = update.id_product_attribute;
    if (update.reference !== undefined) xml.reference = { _cdata: update.reference };
    if (update.ean13 !== undefined) xml.ean13 = { _cdata: update.ean13 };
    if (update.price !== undefined) xml.price = update.price;
    if (update.wholesale_price !== undefined) xml.wholesale_price = update.wholesale_price;
    return xml;
  }

  // `<prestashop><resource>...</resource></prestashop>` envelope for writes.
  private toEnvelopeXml(resource: string, data: Record<string, any>): string {
    return this.jsonToXml({ prestashop: { [resource]: data } });
  }

  private toUpdateXml(resource: string, data: Record<string, any>): string {
    return this.toEnvelopeXml(resource, data);
  }

  private extractStockAvailable(node: any): PrestaShopStockAvailable {
    const quantity = this.extractText(node?.quantity);
    return {
      id: node?._attributes?.id,
      id_product: this.extractText(node?.id_product),
      quantity: quantity !== undefined ? parseInt(quantity, 10) : undefined,
      reference: this.extractText(node?.reference)
    };
  }

  private jsonToXml(data: any): string {
    try {
      const xml = json2xml(data, { compact: true, spaces: 2 });
      return xml;
    } catch (error) {
      logger.error('XML generation failed', { data, error });
      throw new Error('Failed to generate XML for PrestaShop');
    }
  }

  private generateSlug(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get(this.endpoints.root);
      return response.status === 200;
    } catch (error) {
      logger.error('PrestaShop connection test failed', { error });
      return false;
    }
  }
}