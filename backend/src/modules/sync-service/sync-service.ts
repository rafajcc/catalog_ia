"""
Sync Service Module
Main synchronization service coordinating all sync operations with dry-run support.
"""

import { ProductData, SyncPlan, SyncOperation, SyncResult, SyncConfig, SyncSession } from '../types';
import { PrestaShopClient } from './prestashop-client';
import { AITextSuggester } from './ai-text-suggester';
import { ImageMatcher } from './image-matcher';
import { ImageRanker } from './image-ranker';
import { logger } from '../utils/logger';

export class SyncService {
  private prestashopClient: PrestaShopClient;
  private aiSuggester: AITextSuggester;
  private imageMatcher: ImageMatcher;
  private imageRanker: ImageRanker;
  private config: SyncConfig;

  constructor(
    prestashopClient: PrestaShopClient,
    aiSuggester: AITextSuggester,
    imageMatcher: ImageMatcher,
    imageRanker: ImageRanker,
    config: SyncConfig
  ) {
    this.prestashopClient = prestashopClient;
    this.aiSuggester = aiSuggester;
    this.imageMatcher = imageMatcher;
    this.imageRanker = imageRanker;
    this.config = config;
  }

  async createSyncSession(products: ProductData[], dryRun: boolean = true): Promise<SyncSession> {
    logger.info('Creating sync session', {
      productCount: products.length,
      dryRun,
      batchSize: this.config.batch_size
    });

    const plan = await this.createSyncPlan(products, dryRun);

    const session: SyncSession = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      config: this.config,
      plan,
      status: 'pending',
      started_at: new Date(),
      dry_run: dryRun
    };

    logger.info('Sync session created', {
      sessionId: session.id,
      operations: {
        create: plan.products_to_create.length,
        update: plan.products_to_update.length,
        stock: plan.stock_updates.length,
        images: plan.images_to_upload.length,
        texts: plan.texts_to_update.length
      }
    });

    return session;
  }

  async executeSyncSession(session: SyncSession): Promise<SyncSession> {
    logger.info('Starting sync session execution', {
      sessionId: session.id,
      dryRun: session.dry_run
    });

    session.status = 'in_progress';

    try {
      const results: SyncResult[] = [];

      for (const product of session.plan.products_to_create) {
        const result = await this.processProduct(product, session.dry_run);
        results.push(result);
      }

      for (const product of session.plan.products_to_update) {
        const result = await this.processProduct(product, session.dry_run);
        results.push(result);
      }

      session.results = results;
      session.status = 'completed';
      session.completed_at = new Date();

      logger.info('Sync session completed', {
        sessionId: session.id,
        totalOperations: results.length,
        successfulOperations: results.filter(r => r.success).length,
        failedOperations: results.filter(r => !r.success).length
      });

    } catch (error) {
      logger.error('Sync session failed', {
        sessionId: session.id,
        error: (error as Error).message
      });

      session.status = 'failed';
      session.completed_at = new Date();
      throw error;
    }

    return session;
  }

  private async createSyncPlan(products: ProductData[], dryRun: boolean): Promise<SyncPlan> {
    const plan: SyncPlan = {
      products_to_create: [],
      products_to_update: [],
      stock_updates: [],
      images_to_upload: [],
      texts_to_update: []
    };

    for (const product of products) {
      await this.assessProductChanges(product, plan, dryRun);
    }

    return plan;
  }

  private async assessProductChanges(product: ProductData, plan: SyncPlan, dryRun: boolean): Promise<void> {
    if (dryRun) {
      plan.products_to_create.push(product);
      return;
    }

    try {
      const existingProduct = await this.prestashopClient.resolveProduct({
        reference: product.reference || product.sku,
        ean13: product.ean
      });

      if (!existingProduct) {
        plan.products_to_create.push(product);
      } else {
        plan.products_to_update.push(product);
      }

      if (product.quantity !== undefined) {
        plan.stock_updates.push({
          product_id: existingProduct?.id || this.generateTempId(),
          stock_available_id: '',
          new_quantity: product.quantity,
          reference: product.reference || product.sku
        });
      }

      if (product.selected_images && product.selected_images.length > 0) {
        plan.images_to_upload.push(...product.selected_images.map(img => ({
          product_id: existingProduct?.id || this.generateTempId(),
          image_file: img
        })));
      }

      const aiSuggestions = await this.aiSuggester.generateSuggestions(product);
      const validSuggestions = aiSuggestions.filter(suggestion => 
        suggestion.improvements.length > 0 && 
        suggestion.confidence > 0.7
      );

      plan.texts_to_update.push(...validSuggestions.map(suggestion => ({
        product_id: existingProduct?.id || this.generateTempId(),
        field: suggestion.original_field,
        new_value: suggestion.suggested_value,
        original_value: product[suggestion.original_field as keyof ProductData] as string || ''
      })));

    } catch (error) {
      logger.warn('Failed to assess product changes', {
        productId: product.id,
        error: (error as Error).message
      });

      plan.products_to_update.push(product);
    }
  }

  private async processProduct(product: ProductData, dryRun: boolean): Promise<SyncResult> {
    const startTime = Date.now();

    try {
      const result: SyncResult = {
        operation: this.determineOperation(product),
        status: 'in_progress',
        product_id: product.id,
        reference: product.reference || product.sku,
        prestashop_id: undefined,
        error: undefined,
        retry_count: 0,
        executed_at: undefined,
        response_data: undefined
      };

      if (dryRun) {
        result.status = 'completed';
        result.prestashop_id = `temp_${Date.now()}`;
        result.executed_at = new Date();
      } else {
        const syncResult = await this.prestashopClient.syncSingleProduct(product);
        result.status = syncResult.success ? 'completed' : 'failed';
        result.error = syncResult.errors?.join(', ') || undefined;
        result.prestashop_id = syncResult.product_id;
        result.executed_at = new Date();
        result.response_data = syncResult;
      }

      result.response_data = { ...result.response_data, processing_time_ms: Date.now() - startTime };

      return result;
    } catch (error) {
      logger.error('Product processing failed', {
        productId: product.id,
        error: (error as Error).message
      });

      return {
        operation: this.determineOperation(product),
        status: 'failed',
        product_id: product.id,
        reference: product.reference || product.sku,
        prestashop_id: undefined,
        error: (error as Error).message,
        retry_count: 0,
        executed_at: new Date(),
        response_data: { processing_time_ms: Date.now() - startTime }
      };
    }
  }

  private determineOperation(product: ProductData): SyncOperation {
    if (!product.prestashop_id) {
      return 'create_product';
    }
    return 'update_product';
  }

  private generateTempId(): string {
    return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getSyncSummary(session: SyncSession): any {
    const totalOperations = session.plan.products_to_create.length + 
      session.plan.products_to_update.length + 
      session.plan.stock_updates.length + 
      session.plan.images_to_upload.length + 
      session.plan.texts_to_update.length;

    const completedOperations = session.results?.filter(r => r.status === 'completed').length || 0;
    const failedOperations = session.results?.filter(r => r.status === 'failed').length || 0;

    return {
      session_id: session.id,
      status: session.status,
      dry_run: session.dry_run,
      total_operations: totalOperations,
      completed_operations: completedOperations,
      failed_operations: failedOperations,
      success_rate: totalOperations > 0 ? (completedOperations / totalOperations) * 100 : 0,
      created_products: session.plan.products_to_create.length,
      updated_products: session.plan.products_to_update.length,
      stock_updates: session.plan.stock_updates.length,
      images_uploaded: session.plan.images_to_upload.length,
      texts_updated: session.plan.texts_to_update.length
    };
  }
}