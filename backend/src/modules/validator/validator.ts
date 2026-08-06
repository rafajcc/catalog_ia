// Validator Module
// Validates products for required fields, data integrity, and business rules.

import { 
  ProductData, 
  ValidationError, 
  ValidationResult,
  ValidationContext,
  ValidationRule
} from '../../types';

// Default rules aligned with what PrestaShop supports:
// - ps_product_lang.name is varchar(128)
// - ps_product.reference is varchar(64)
// - ps_manufacturer.name / ps_manufacturer_lang.name are varchar(64)
// - prices are stored with up to 2 decimal places
// - stock quantity is an integer
export function getDefaultProductRules(): ValidationRule[] {
  return [
    { field: 'name', type: 'string', max: 128 },
    { field: 'reference', type: 'string', max: 64 },
    { field: 'brand', type: 'string', max: 64 },
    { field: 'manufacturer', type: 'string', max: 64 },
    { field: 'price', type: 'number', min: 0, decimals: 2 },
    { field: 'wholesale_price', type: 'number', min: 0, decimals: 2 },
    { field: 'quantity', type: 'integer', min: 0 }
  ];
}

export class ProductValidator {
  private rules: ValidationRule[];
  private requiredFields: Set<string>;
  private duplicateCheckFields: string[];

  constructor(rules: ValidationRule[] = [], requiredFields: string[] = [], duplicateCheckFields: string[] = []) {
    this.rules = rules;
    this.requiredFields = new Set(requiredFields);
    this.duplicateCheckFields = duplicateCheckFields;
  }

  validateProduct(product: ProductData, context: ValidationContext = {}): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    for (const field of this.requiredFields) {
      if (!product[field as keyof ProductData]) {
        errors.push({
          field: field as any,
          message: `${field} is required`,
          code: 'MISSING_REQUIRED_FIELD',
          severity: 'error',
          value: product[field as keyof ProductData]
        });
      }
    }

    for (const rule of this.rules) {
      const fieldValue = product[rule.field as keyof ProductData];
      const result = this.validateField(fieldValue, rule);
      if (!result.valid) {
        errors.push({
          field: rule.field,
          message: result.error,
          code: 'VALIDATION_ERROR',
          severity: 'error',
          value: fieldValue
        });
      } else if (result.warning) {
        warnings.push(result.warning);
      }
    }

    const duplicateErrors = this.checkDuplicates(product, context);
    errors.push(...duplicateErrors);

    const missingDataWarnings = this.checkMissingData(product);
    warnings.push(...missingDataWarnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private validateField(value: any, rule: ValidationRule): ValidationResult {
    if (value === undefined || value === null || value === '') {
      if (rule.required) {
        return { valid: false, error: `${rule.field} is required` };
      }
      return { valid: true };
    }

    switch (rule.type) {
      case 'number':
      case 'integer': {
        if (typeof value !== 'number' || isNaN(value)) {
          return { valid: false, error: `${rule.field} must be a number` };
        }
        if (rule.type === 'integer' && !Number.isInteger(value)) {
          return { valid: false, error: `${rule.field} must be an integer` };
        }
        if (rule.min !== undefined && value < rule.min) {
          return { valid: false, error: `${rule.field} must be at least ${rule.min}` };
        }
        if (rule.max !== undefined && value > rule.max) {
          return { valid: false, error: `${rule.field} must be at most ${rule.max}` };
        }
        if (rule.decimals !== undefined && rule.type === 'number') {
          const decimals = (String(value).split('.')[1] || '').length;
          if (decimals > rule.decimals) {
            return { valid: false, error: `${rule.field} must have at most ${rule.decimals} decimal places` };
          }
        }
        break;
      }
      case 'ean': {
        if (typeof value !== 'string') {
          return { valid: false, error: `${rule.field} must be a string` };
        }
        const cleaned = value.replace(/[^0-9]/g, '');
        if (![8, 13].includes(cleaned.length)) {
          return { valid: false, error: `${rule.field} must be 8 or 13 digits` };
        }
        break;
      }
      case 'string': {
        if (typeof value !== 'string') {
          return { valid: false, error: `${rule.field} must be a string` };
        }
        if (rule.min !== undefined && value.length < rule.min) {
          return { valid: false, error: `${rule.field} must be at least ${rule.min} characters` };
        }
        if (rule.max !== undefined && value.length > rule.max) {
          return { valid: false, error: `${rule.field} must be at most ${rule.max} characters` };
        }
        if (rule.pattern && !rule.pattern.test(value)) {
          return { valid: false, error: `${rule.field} format is invalid` };
        }
        break;
      }
      default:
        break;
    }

    if (rule.custom) {
      return rule.custom(value);
    }

    return { valid: true };
  }

  private checkDuplicates(product: ProductData, context: ValidationContext): ValidationError[] {
    const errors: ValidationError[] = [];
    if (!context.products) return errors;

    for (const checkField of this.duplicateCheckFields) {
      const productValue = product[checkField as keyof ProductData];
      if (!productValue) continue;

      const duplicates = context.products.filter(p => {
        if (p.id === product.id) return false;
        return p[checkField as keyof ProductData] === productValue;
      });

      if (duplicates.length > 0) {
        errors.push({
          field: checkField as any,
          message: `${checkField} '${productValue}' already exists`,
          code: 'DUPLICATE_VALUE',
          severity: 'error',
          value: productValue
        });
      }
    }

    return errors;
  }

  private checkMissingData(product: ProductData): string[] {
    const warnings: string[] = [];
    if (!product.ean && !product.reference) {
      warnings.push('Product missing EAN and reference - may affect image matching');
    }
    if (!product.brand) {
      warnings.push('Product missing brand information');
    }
    if (!product.category) {
      warnings.push('Product missing category');
    }
    if (!product.description && !product.description_short) {
      warnings.push('Product missing descriptions - AI suggestions will be needed');
    }
    if (!product.price) {
      warnings.push('Product missing price');
    }
    return warnings;
  }

  validateEAN(ean: string): boolean {
    if (!ean) return false;
    const cleaned = ean.replace(/[^0-9]/g, '');
    return [8, 13].includes(cleaned.length);
  }

  validatePrice(price: number): boolean {
    return typeof price === 'number' && price >= 0 && price <= 1000000;
  }

  validateStock(stock: number): boolean {
    return typeof stock === 'number' && stock >= 0 && stock <= 1000000;
  }

  validateTaxGroupId(tax: number): boolean {
    return typeof tax === 'number' && Number.isInteger(tax) && tax > 0;
  }

  getValidationSummary(products: ProductData[]): any {
    const total = products.length;
    const valid = products.filter(p => p.status === 'valid').length;
    const invalid = products.filter(p => p.status === 'invalid').length;
    const warnings = products.filter(p => p.status === 'warning').length;

    return {
      total,
      valid,
      invalid,
      warnings,
      validation_rate: total > 0 ? (valid / total) * 100 : 0
    };
  }
}