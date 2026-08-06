import { ProductValidator, getDefaultProductRules } from '../backend/src/modules/validator/validator';
import { ProductData, ValidationRule } from '../backend/src/types';
import { makeProduct } from './helpers';

function makeValidator(
  rules: ValidationRule[] = [],
  requiredFields: string[] = [],
  duplicateCheckFields: string[] = []
): ProductValidator {
  return new ProductValidator(rules, requiredFields, duplicateCheckFields);
}

describe('ProductValidator', () => {
  describe('validateProduct - required fields', () => {
    it('accepts a product when all required fields are present', () => {
      const result = makeValidator([], ['name', 'reference']).validateProduct(makeProduct());

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('reports missing required fields', () => {
      const result = makeValidator([], ['name', 'price']).validateProduct(makeProduct());

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0]).toMatchObject({
        field: 'price',
        code: 'MISSING_REQUIRED_FIELD',
        severity: 'error'
      });
    });
  });

  describe('validateProduct - rules', () => {
    it('accepts a valid 13-digit EAN', () => {
      const result = makeValidator([{ field: 'ean', type: 'ean' }]).validateProduct(makeProduct());

      expect(result.valid).toBe(true);
    });

    it('rejects an EAN with the wrong number of digits', () => {
      const product = makeProduct({ ean: '12345' });
      const result = makeValidator([{ field: 'ean', type: 'ean' }]).validateProduct(product);

      expect(result.valid).toBe(false);
      expect(result.errors![0].message).toBe('ean must be 8 or 13 digits');
    });

    it('rejects an EAN that is not a string', () => {
      const product = makeProduct();
      const result = makeValidator([{ field: 'ean', type: 'ean' }]).validateProduct({
        ...product,
        ean: 123 as any
      });

      expect(result.valid).toBe(false);
      expect(result.errors![0].message).toBe('ean must be a string');
    });

    it('enforces min/max on numeric rules', () => {
      const rule: ValidationRule = { field: 'price', type: 'number', min: 0, max: 100 };
      const overMax = makeValidator([rule]).validateProduct(makeProduct({ price: 150 }));

      expect(overMax.valid).toBe(false);
      expect(overMax.errors![0].message).toBe('price must be at most 100');

      const underMin = makeValidator([rule]).validateProduct(makeProduct({ price: -5 }));
      expect(underMin.valid).toBe(false);
      expect(underMin.errors![0].message).toBe('price must be at least 0');
    });

    it('enforces min/max/pattern on string rules', () => {
      const rule: ValidationRule = { field: 'name', type: 'string', min: 5, max: 50, pattern: /^[A-Z]/ };
      const tooShort = makeValidator([rule]).validateProduct(makeProduct({ name: 'abc' }));
      expect(tooShort.valid).toBe(false);
      expect(tooShort.errors![0].message).toBe('name must be at least 5 characters');

      const badPattern = makeValidator([rule]).validateProduct(makeProduct({ name: 'lowercase name' }));
      expect(badPattern.valid).toBe(false);
      expect(badPattern.errors![0].message).toBe('name format is invalid');
    });

    it('runs custom validation rules', () => {
      const rule: ValidationRule = {
        field: 'name',
        type: 'string',
        custom: value => (value === 'blocked' ? { valid: false, error: 'name is blocked' } : { valid: true })
      };
      const blocked = makeValidator([rule]).validateProduct(makeProduct({ name: 'blocked' }));
      expect(blocked.valid).toBe(false);
      expect(blocked.errors![0].message).toBe('name is blocked');

      const allowed = makeValidator([rule]).validateProduct(makeProduct());
      expect(allowed.valid).toBe(true);
    });

    it('treats an empty value for a required rule field as an error', () => {
      const rule: ValidationRule = { field: 'ean', type: 'ean', required: true };
      const result = makeValidator([rule]).validateProduct(makeProduct({ ean: '' }));

      expect(result.valid).toBe(false);
      expect(result.errors![0].message).toBe('ean is required');
    });

    it('rejects a number with more decimals than allowed', () => {
      const rule: ValidationRule = { field: 'price', type: 'number', decimals: 2 };
      const result = makeValidator([rule]).validateProduct(makeProduct({ price: 19.999 }));

      expect(result.valid).toBe(false);
      expect(result.errors![0].message).toBe('price must have at most 2 decimal places');

      const ok = makeValidator([rule]).validateProduct(makeProduct({ price: 19.99 }));
      expect(ok.valid).toBe(true);
    });

    it('rejects a non-integer value for an integer rule', () => {
      const rule: ValidationRule = { field: 'quantity', type: 'integer', min: 0 };
      const result = makeValidator([rule]).validateProduct(makeProduct({ quantity: 10.7 }));

      expect(result.valid).toBe(false);
      expect(result.errors![0].message).toBe('quantity must be an integer');

      const ok = makeValidator([rule]).validateProduct(makeProduct({ quantity: 10 }));
      expect(ok.valid).toBe(true);
    });
  });

  describe('getDefaultProductRules', () => {
    it('rejects text fields longer than the PrestaShop limits', () => {
      const validator = makeValidator(getDefaultProductRules());

      const longName = validator.validateProduct(makeProduct({ name: 'x'.repeat(129) }));
      expect(longName.valid).toBe(false);
      expect(longName.errors![0].message).toBe('name must be at most 128 characters');

      const longReference = validator.validateProduct(makeProduct({ reference: 'x'.repeat(65) }));
      expect(longReference.valid).toBe(false);
      expect(longReference.errors![0].message).toBe('reference must be at most 64 characters');

      const ok = validator.validateProduct(makeProduct({ name: 'x'.repeat(128), reference: 'x'.repeat(64) }));
      expect(ok.valid).toBe(true);
    });

    it('accepts prices up to two decimals and integer quantities', () => {
      const validator = makeValidator(getDefaultProductRules());
      const ok = validator.validateProduct(makeProduct({ price: 19.99, wholesale_price: 15.5, quantity: 10 }));

      expect(ok.valid).toBe(true);
    });
  });

  describe('validateProduct - duplicates', () => {
    it('flags a product whose EAN already exists in context', () => {
      const first = makeProduct({ id: 'p1' });
      const second = makeProduct({ id: 'p2' });
      const result = makeValidator([], [], ['ean']).validateProduct(second, { products: [first, second] });

      expect(result.valid).toBe(false);
      expect(result.errors![0]).toMatchObject({
        code: 'DUPLICATE_VALUE',
        message: "ean '1234567890123' already exists"
      });
    });

    it('does not flag the product itself as a duplicate', () => {
      const product = makeProduct();
      const result = makeValidator([], [], ['ean']).validateProduct(product, { products: [product] });

      expect(result.valid).toBe(true);
    });
  });

  describe('validateProduct - missing data warnings', () => {
    it('warns about missing brand, category, descriptions and price', () => {
      const result = makeValidator().validateProduct(makeProduct());

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Product missing brand information');
      expect(result.warnings).toContain('Product missing category');
      expect(result.warnings).toContain('Product missing descriptions - AI suggestions will be needed');
      expect(result.warnings).toContain('Product missing price');
      expect(result.warnings).toHaveLength(4);
    });

    it('warns when both EAN and reference are missing', () => {
      const product = makeProduct({ ean: undefined, reference: undefined });
      const result = makeValidator().validateProduct(product);

      expect(result.warnings).toContain('Product missing EAN and reference - may affect image matching');
    });
  });

  describe('Standalone validators', () => {
    it('validateEAN accepts 8 and 13 digit values only', () => {
      const validator = makeValidator();

      expect(validator.validateEAN('12345678')).toBe(true);
      expect(validator.validateEAN('1234567890123')).toBe(true);
      expect(validator.validateEAN('12345')).toBe(false);
      expect(validator.validateEAN('')).toBe(false);
    });

    it('validatePrice accepts values within range', () => {
      const validator = makeValidator();

      expect(validator.validatePrice(0)).toBe(true);
      expect(validator.validatePrice(1000000)).toBe(true);
      expect(validator.validatePrice(-1)).toBe(false);
      expect(validator.validatePrice(1000001)).toBe(false);
    });

    it('validateStock accepts values within range', () => {
      const validator = makeValidator();

      expect(validator.validateStock(0)).toBe(true);
      expect(validator.validateStock(1000000)).toBe(true);
      expect(validator.validateStock(-1)).toBe(false);
    });

    it('validateTaxGroupId accepts positive integers', () => {
      const validator = makeValidator();

      expect(validator.validateTaxGroupId(1)).toBe(true);
      expect(validator.validateTaxGroupId(21)).toBe(true);
      expect(validator.validateTaxGroupId(0)).toBe(false);
      expect(validator.validateTaxGroupId(2.5)).toBe(false);
      expect(validator.validateTaxGroupId(-1)).toBe(false);
    });
  });

  describe('getValidationSummary', () => {
    it('computes counts and validation rate', () => {
      const products: ProductData[] = [
        makeProduct({ id: 'p1', status: 'valid' }),
        makeProduct({ id: 'p2', status: 'invalid' }),
        makeProduct({ id: 'p3', status: 'warning' }),
        makeProduct({ id: 'p4', status: 'valid' })
      ];

      const summary = makeValidator().getValidationSummary(products);

      expect(summary).toMatchObject({ total: 4, valid: 2, invalid: 1, warnings: 1 });
      expect(summary.validation_rate).toBe(50);
    });

    it('returns zero validation rate for empty input', () => {
      const summary = makeValidator().getValidationSummary([]);

      expect(summary).toMatchObject({ total: 0, valid: 0, validation_rate: 0 });
    });
  });
});
