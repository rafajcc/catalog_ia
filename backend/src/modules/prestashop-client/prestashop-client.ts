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
      baseURL: config.base_url,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/xml'
      }
    });

    this.endpoints = this.buildEndpoints(config.version);

    this.setupInterceptors();
  }

  private buildEndpoints(_version: string): PrestaShopAPIEndpoints {
    const base = '/api';
    return {
      products: `${base}/products`,
      product: (id: ProductId) => `${base}/products/${id}`,
      stock_availables: `${base}/stock_availables`,
      stock_available: (id: string) => `${base}/stock_availables/${id}`,
      images: `${base}/images`,
      product_images: (productId: ProductId) => `${base}/images/products/${productId}`,
      images_upload: (productId: ProductId) => `${base}/images/products/${productId}`
    };
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        config.headers['Authorization'] = `Bearer ${this.config.api_key}`;
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
        reference: product.reference || product.sku
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
          reference: product.reference || product.sku
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
          reference: product.reference || product.sku,
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

  private extractProduct(node: any): PrestaShopProduct {
    return {
      id: node?._attributes?.id,
      reference: this.extractText(node?.reference),
      ean13: this.extractText(node?.ean13)
    };
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
      const response = await this.client.get(this.endpoints.products, {
        params: { limit: 1 }
      });
      return response.status === 200;
    } catch (error) {
      logger.error('PrestaShop connection test failed', { error });
      return false;
    }
  }
}