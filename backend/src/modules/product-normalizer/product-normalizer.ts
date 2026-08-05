// Product Normalizer Module
// Normalizes and standardizes product data from CSV parsing.

import { 
  ProductData, 
  ParsedRow,
  ValidationError
} from '../../types';

export class ProductNormalizer {
  private fieldMappings: Map<string, string>;
  private defaultValues: Partial<ProductData>;
  private transformations: Array<(data: Partial<ProductData>) => Partial<ProductData>>;

  constructor() {
    this.fieldMappings = new Map([
      ['ean', 'ean'],
      ['ean13', 'ean'],
      ['reference', 'reference'],
      ['sku', 'reference'],
      ['name', 'name'],
      ['description', 'description'],
      ['description_short', 'description_short'],
      ['price', 'price'],
      ['wholesale_price', 'wholesale_price'],
      ['quantity', 'quantity'],
      ['stock', 'quantity'],
      ['brand', 'brand'],
      ['manufacturer', 'manufacturer'],
      ['category', 'category'],
      ['tax', 'tax'],
      ['weight', 'weight'],
      ['image_hints', 'image_hints']
    ]);

    this.defaultValues = {
      status: 'pending',
      source_file: 'unknown',
      validation_errors: [],
      warnings: []
    };

    this.transformations = [
      this.normalizeTaxRate,
      this.normalizePrice,
      this.normalizeStock,
      this.validateRequiredFields,
      this.addSourceMetadata
    ];
  }

  normalizeProducts(rows: ParsedRow[]): ProductData[] {
    const products: ProductData[] = [];

    for (const row of rows) {
      if (row.errors.length > 0) {
        continue; // Skip rows with critical errors
      }

      const product = this.transformRowData(row.normalized);
      products.push(product);
    }

    return products;
  }

  normalizeSingleProduct(row: ParsedRow): ProductData | null {
    if (row.errors.length > 0) {
      return null;
    }

    return this.transformRowData(row.normalized);
  }

  private transformRowData(data: Partial<ProductData>): ProductData {
    const product = {
      id: this.generateProductId(data),
      ...this.defaultValues,
      ...data
    } as ProductData;

    // Apply transformations in sequence
    for (const transform of this.transformations) {
      const transformed = transform(product);
      Object.assign(product, transformed);
    }

    return product;
  }

  private generateProductId(data: Partial<ProductData>): string {
    const ean = data.ean;
    const reference = data.reference;
    
    if (ean) {
      return `ean_${ean}`;
    } else if (reference) {
      return `ref_${reference}`;
    } else {
      return `product_${Date.now()}`;
    }
  }

  private normalizeTaxRate(product: ProductData): ProductData {
    if (product.tax !== undefined && product.tax > 1) {
      product.tax = product.tax / 100;
    }
    return product;
  }

  private normalizePrice(product: ProductData): ProductData {
    if (product.price !== undefined) {
      product.price = Math.round(product.price * 100) / 100;
    }
    if (product.wholesale_price !== undefined) {
      product.wholesale_price = Math.round(product.wholesale_price * 100) / 100;
    }
    return product;
  }

  private normalizeStock(product: ProductData): ProductData {
    if (product.quantity !== undefined) {
      product.quantity = Math.floor(product.quantity);
    }
    return product;
  }

  private validateRequiredFields(product: ProductData): ProductData {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    if (!product.name) {
      errors.push({
        field: 'name',
        message: 'Product name is required',
        code: 'MISSING_REQUIRED_FIELD',
        severity: 'error',
        value: product.name
      });
    }

    if (!product.price) {
      warnings.push('Product missing price - using AI suggestions');
    }

    if (!product.quantity) {
      warnings.push('Product missing stock quantity');
    }

    if (!product.ean && !product.reference) {
      warnings.push('Product missing EAN and reference - manual matching required');
    }

    if (errors.length > 0) {
      product.status = 'invalid';
      product.validation_errors = [...(product.validation_errors || []), ...errors];
    }

    if (warnings.length > 0) {
      product.status = product.status === 'invalid' ? 'warning' : 'warning';
      product.warnings = [...(product.warnings || []), ...warnings];
    } else if (product.status === 'warning') {
      product.status = 'valid';
    }

    return product;
  }

  private addSourceMetadata(product: ProductData): ProductData {
    product.source_file = product.source_file || 'unknown';
    product.status = product.status || 'pending';
    
    // Set initial sync state
    product.is_new = true;
    product.is_updated = false;
    
    return product;
  }

  detectDuplicateProducts(products: ProductData[]): ProductData[] {
    const duplicates: ProductData[] = [];
    const seen: Map<string, ProductData[]> = new Map();

    for (const product of products) {
      const eanKey = product.ean;
      const referenceKey = product.reference;

      if (eanKey) {
        if (!seen.has(`ean_${eanKey}`)) {
          seen.set(`ean_${eanKey}`, []);
        }
        seen.get(`ean_${eanKey}`)?.push(product);
      }

      if (referenceKey) {
        if (!seen.has(`ref_${referenceKey}`)) {
          seen.set(`ref_${referenceKey}`, []);
        }
        seen.get(`ref_${referenceKey}`)?.push(product);
      }
    }

    for (const [, duplicateList] of seen.entries()) {
      if (duplicateList.length > 1) {
        duplicates.push(...duplicateList);
      }
    }

    // Mark duplicates
    duplicates.forEach(product => {
      product.status = 'duplicate';
    });

    return duplicates;
  }

  getNormalizationSummary(products: ProductData[]): any {
    const total = products.length;
    const withEan = products.filter(p => p.ean).length;
    const withReference = products.filter(p => p.reference).length;
    const withPrice = products.filter(p => p.price).length;
    const withStock = products.filter(p => p.quantity).length;
    const duplicates = products.filter(p => p.status === 'duplicate').length;

    return {
      total,
      with_ean: withEan,
      with_reference: withReference,
      with_price: withPrice,
      with_stock: withStock,
      duplicates,
      normalization_rate: total > 0 ? ((withEan + withReference) / total) * 100 : 0
    };
  }
}