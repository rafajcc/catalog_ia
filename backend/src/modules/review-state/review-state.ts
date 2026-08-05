// Review State Module
// Manages editable review state for products before synchronization.

import { ProductData, ProductEditState, EditField, ReviewState, ReviewFilters, BatchAction, ReviewDiff } from '../../types';
import { logger } from '../../utils/logger';

export class ReviewStateManager {
  private products: ProductEditState[];
  private filters: ReviewFilters;
  private batchActions: BatchAction[];

  constructor() {
    this.products = [];
    this.filters = {};
    this.batchActions = ['accept_all', 'reject_all', 'exclude_selected', 'reset_edits', 'export_selected'];
  }

  initializeReview(products: ProductData[]): ReviewState {
    logger.info('Initializing product review', { productCount: products.length });

    const productEdits: ProductEditState[] = products.map(product => this.createProductEditState(product));

    const reviewState: ReviewState = {
      products: productEdits,
      filters: this.filters,
      batch_actions: this.batchActions,
      total_products: products.length,
      valid_count: 0,
      invalid_count: 0,
      warning_count: 0,
      suggested_count: 0,
      images_selected_count: 0
    };

    this.updateReviewStatistics(reviewState);

    return reviewState;
  }

  private createProductEditState(product: ProductData): ProductEditState {
    const edits: EditField[] = this.createEditFields(product);

    return {
      product_id: product.id,
      reference: product.reference,
      ean: product.ean,
      edits,
      is_modified: false,
      validation_errors: product.validation_errors || [],
      can_exclude: true,
      image_selection: this.createImageSelectionEdit(product)
    };
  }

  private createEditFields(product: ProductData): EditField[] {
    const fields: EditField[] = [];

    // Text fields
    const textFields = [
      { key: 'name', label: 'Product Name', type: 'text' as const, required: true },
      { key: 'description_short', label: 'Short Description', type: 'textarea' as const, required: false },
      { key: 'description', label: 'Full Description', type: 'textarea' as const, required: false },
      { key: 'meta_title', label: 'Meta Title', type: 'text' as const, required: false },
      { key: 'meta_description', label: 'Meta Description', type: 'textarea' as const, required: false },
      { key: 'link_rewrite', label: 'Slug/URL', type: 'text' as const, required: false }
    ];

    for (const field of textFields) {
      fields.push({
        field: field.key as any,
        label: field.label,
        type: field.type,
        value: product[field.key as keyof ProductData] || '',
        original_value: product[field.key as keyof ProductData] || '',
        required: field.required,
        validation: this.getFieldValidation(field.key),
        help_text: this.getFieldHelpText(field.key)
      });
    }

    // Numeric fields
    const numericFields = [
      { key: 'price', label: 'Price', type: 'number' as const, required: true },
      { key: 'quantity', label: 'Stock Quantity', type: 'number' as const, required: true },
      { key: 'wholesale_price', label: 'Wholesale Price', type: 'number' as const, required: false }
    ];

    for (const field of numericFields) {
      fields.push({
        field: field.key as any,
        label: field.label,
        type: field.type,
        value: product[field.key as keyof ProductData] || 0,
        original_value: product[field.key as keyof ProductData] || 0,
        required: field.required,
        validation: { type: 'number', min: 0, max: 1000000 },
        help_text: field.key === 'price' ? 'Retail price in currency units' :
                  field.key === 'quantity' ? 'Available stock quantity' :
                  field.key === 'wholesale_price' ? 'Wholesale price (optional)' : ''
      });
    }

    // Image selection field
    fields.push({
      field: 'image_selection',
      label: 'Product Images',
      type: 'image_selection' as const,
      value: product.selected_images || [],
      original_value: product.selected_images || [],
      required: false,
      help_text: 'Select up to 5 most relevant images'
    });

    return fields;
  }

  private createImageSelectionEdit(product: ProductData): any {
    return {
      selected_images: product.selected_images || [],
      order: product.selected_images?.length || 0,
      primary_image: product.selected_images?.[0] || null
    };
  }

  private getFieldValidation(fieldKey: string): any {
    const validations = {
      name: { type: 'string', min: 1, max: 200, pattern: /^[a-zA-Z0-9\s\-.,!?]+$/ },
      description_short: { type: 'string', max: 500 },
      description: { type: 'string', max: 5000 },
      meta_title: { type: 'string', max: 60 },
      meta_description: { type: 'string', max: 160 },
      link_rewrite: { type: 'string', pattern: /^[a-z0-9-]+/ },
      price: { type: 'number', min: 0, max: 1000000 },
      quantity: { type: 'integer', min: 0, max: 1000000 },
      wholesale_price: { type: 'number', min: 0, max: 1000000 }
    };
    return validations[fieldKey] || null;
  }

  private getFieldHelpText(fieldKey: string): string {
    const helpTexts = {
      name: 'Product name should be descriptive and SEO-friendly',
      description_short: 'Brief summary of the product (max 500 characters)',
      description: 'Detailed product description with features and specifications',
      meta_title: 'SEO title (recommended: 50-60 characters)',
      meta_description: 'Meta description for search results (recommended: 150-160 characters)',
      link_rewrite: 'URL-friendly slug (lowercase, hyphens only)',
      price: 'Selling price in currency units',
      quantity: 'Available stock quantity',
      wholesale_price: 'Optional price for wholesale customers'
    };
    return helpTexts[fieldKey] || '';
  }

  updateProductEdit(productId: string, updates: Partial<ProductEditState>): void {
    const index = this.products.findIndex(p => p.product_id === productId);
    if (index === -1) {
      throw new Error(`Product ${productId} not found in review`);
    }

    this.products[index] = { ...this.products[index], ...updates };

    if (updates.edits) {
      this.products[index].is_modified = true;
    }

    logger.info('Product edit updated', {
      productId,
      isModified: this.products[index].is_modified
    });
  }

  applyFieldEdit(productId: string, field: string, value: any): void {
    const productEdit = this.products.find(p => p.product_id === productId);
    if (!productEdit) {
      throw new Error(`Product ${productId} not found`);
    }

    const editField = productEdit.edits.find(e => e.field === field);
    if (!editField) {
      throw new Error(`Field ${field} not found in product edits`);
    }

    editField.value = value;
    productEdit.is_modified = true;

    logger.info('Field edited', {
      productId,
      field,
      value
    });
  }

  applyImageSelection(productId: string, selectedImages: any[], order: number, primaryImage?: any): void {
    const productEdit = this.products.find(p => p.product_id === productId);
    if (!productEdit) {
      throw new Error(`Product ${productId} not found`);
    }

    if (productEdit.image_selection) {
      productEdit.image_selection.selected_images = selectedImages;
      productEdit.image_selection.order = order;
      productEdit.image_selection.primary_image = primaryImage || selectedImages[0];
      productEdit.is_modified = true;
    }

    logger.info('Image selection updated', {
      productId,
      selectedCount: selectedImages.length,
      order,
      primary: primaryImage?.filename || 'none'
    });
  }

  applyBatchAction(action: BatchAction, productIds?: string[]): any {
    logger.info('Applying batch action', {
      action,
      productIds: productIds?.length || 'all'
    });

    switch (action) {
      case 'accept_all':
        return this.acceptAllEdits(productIds);
      case 'reject_all':
        return this.rejectAllEdits(productIds);
      case 'exclude_selected':
        return this.excludeSelectedProducts(productIds);
      case 'reset_edits':
        return this.resetAllEdits(productIds);
      case 'export_selected':
        return this.exportSelectedEdits(productIds);
      default:
        throw new Error(`Unknown batch action: ${action}`);
    }
  }

  private acceptAllEdits(productIds?: string[]): any {
    const targetProducts = this.getTargetProducts(productIds);
    let acceptedCount = 0;

    for (const product of targetProducts) {
      product.edits.forEach(edit => {
        if (edit.field !== 'image_selection') {
          edit.original_value = edit.value;
        }
      });
      product.is_modified = false;
      acceptedCount++;
    }

    return { accepted_count: acceptedCount };
  }

  private rejectAllEdits(productIds?: string[]): any {
    const targetProducts = this.getTargetProducts(productIds);
    let rejectedCount = 0;

    for (const product of targetProducts) {
      product.edits.forEach(edit => {
        edit.value = edit.original_value;
      });
      product.is_modified = false;
      rejectedCount++;
    }

    return { rejected_count: rejectedCount };
  }

  private excludeSelectedProducts(productIds?: string[]): any {
    const targetProducts = this.getTargetProducts(productIds);
    let excludedCount = 0;

    for (const product of targetProducts) {
      product.can_exclude = false;
      excludedCount++;
    }

    return { excluded_count: excludedCount };
  }

  private resetAllEdits(productIds?: string[]): any {
    const targetProducts = this.getTargetProducts(productIds);
    let resetCount = 0;

    for (const product of targetProducts) {
      product.edits.forEach(edit => {
        edit.value = edit.original_value;
      });
      if (product.image_selection) {
        product.image_selection.selected_images = [...product.image_selection.selected_images];
      }
      product.is_modified = false;
      resetCount++;
    }

    return { reset_count: resetCount };
  }

  private exportSelectedEdits(productIds?: string[]): any {
    const targetProducts = this.getTargetProducts(productIds);

    return {
      export_data: targetProducts.map(p => ({
        product_id: p.product_id,
        edits: p.edits.map(edit => ({
          field: edit.field,
          original_value: edit.original_value,
          modified_value: edit.value,
          is_modified: edit.field !== 'image_selection' ? edit.value !== edit.original_value : 
            JSON.stringify(edit.value) !== JSON.stringify(edit.original_value)
        })),
        image_selection_modified: p.image_selection ? 
          JSON.stringify(p.image_selection) !== JSON.stringify(p.image_selection) : false,
        can_exclude: p.can_exclude
      })),
      total_products: targetProducts.length
    };
  }

  private getTargetProducts(productIds?: string[]): ProductEditState[] {
    if (!productIds || productIds.length === 0) {
      return this.products;
    }
    return this.products.filter(p => productIds.includes(p.product_id));
  }

  filterProducts(filters: ReviewFilters): ProductEditState[] {
    this.filters = { ...this.filters, ...filters };

    return this.products.filter(product => {
      if (filters.status && !filters.status.includes(product.validation_errors.length > 0 ? 'invalid' : 'valid')) {
        return false;
      }

      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        if (!product.reference?.toLowerCase().includes(searchTerm) &&
            !product.ean?.toLowerCase().includes(searchTerm)) {
          return false;
        }
      }

      if (filters.fields && filters.fields.length > 0) {
        const hasMatchingField = product.edits.some(edit => 
          filters.fields?.includes(edit.field as any)
        );
        if (!hasMatchingField) return false;
      }

      return true;
    });
  }

  getReviewDiffs(productId: string): ReviewDiff[] {
    const product = this.products.find(p => p.product_id === productId);
    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }

    const diffs: ReviewDiff[] = [];

    product.edits.forEach(edit => {
      if (edit.field !== 'image_selection' && edit.value !== edit.original_value) {
        diffs.push({
          field: edit.field,
          original: edit.original_value,
          modified: edit.value,
          type: this.getDiffType(edit.original_value, edit.value)
        });
      }
    });

    if (product.image_selection) {
      const originalImages = product.image_selection.selected_images || [];
      const modifiedImages = product.image_selection.selected_images || [];
      
      if (JSON.stringify(originalImages) !== JSON.stringify(modifiedImages)) {
        diffs.push({
          field: 'image_selection',
          original: originalImages,
          modified: modifiedImages,
          type: 'modified'
        });
      }
    }

    return diffs;
  }

  private getDiffType(original: any, modified: any): 'added' | 'removed' | 'modified' {
    if (original === undefined && modified !== undefined) return 'added';
    if (original !== undefined && modified === undefined) return 'removed';
    return 'modified';
  }

  private updateReviewStatistics(reviewState: ReviewState): void {
    let valid = 0;
    let invalid = 0;
    let warning = 0;
    let suggested = 0;
    let imagesSelected = 0;

    for (const product of reviewState.products) {
      if (product.validation_errors.length === 0) {
        valid++;
      } else if (product.validation_errors.some(e => e.severity === 'error')) {
        invalid++;
      } else {
        warning++;
      }

      const hasSuggestions = product.edits.some(edit => 
        edit.field !== 'image_selection' && edit.value !== edit.original_value
      );
      if (hasSuggestions) suggested++;

      if (product.image_selection?.selected_images?.length > 0) imagesSelected++;
    }

    reviewState.valid_count = valid;
    reviewState.invalid_count = invalid;
    reviewState.warning_count = warning;
    reviewState.suggested_count = suggested;
    reviewState.images_selected_count = imagesSelected;
  }

  getReviewSummary(): any {
    const total = this.products.length;
    const valid = this.products.filter(p => p.validation_errors.length === 0).length;
    const invalid = this.products.filter(p => p.validation_errors.some(e => e.severity === 'error')).length;
    const warning = this.products.filter(p => p.validation_errors.some(e => e.severity === 'warning')).length;
    const modified = this.products.filter(p => p.is_modified).length;

    return {
      total_products: total,
      valid_products: valid,
      invalid_products: invalid,
      warning_products: warning,
      modified_products: modified,
      modified_percentage: total > 0 ? (modified / total) * 100 : 0,
      validation_rate: total > 0 ? (valid / total) * 100 : 0
    };
  }

  exportReview(): any {
    return {
      products: this.products.map(p => ({
        product_id: p.product_id,
        reference: p.reference,
        ean: p.ean,
        edits: p.edits.map(edit => ({
          field: edit.field,
          original_value: edit.original_value,
          modified_value: edit.value,
          is_modified: edit.field !== 'image_selection' ? edit.value !== edit.original_value : 
            JSON.stringify(edit.value) !== JSON.stringify(edit.original_value)
        })),
        image_selection: p.image_selection,
        can_exclude: p.can_exclude,
        is_modified: p.is_modified,
        validation_errors: p.validation_errors
      })),
      summary: this.getReviewSummary(),
      exported_at: new Date().toISOString()
    };
  }
}