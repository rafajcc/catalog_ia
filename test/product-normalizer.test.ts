import { ProductNormalizer } from '../backend/src/modules/product-normalizer/product-normalizer';
import { ParsedRow, ProductData } from '../backend/src/types';
import { makeProduct, makeRow } from './helpers';

function normalizer(): ProductNormalizer {
  return new ProductNormalizer();
}

describe('ProductNormalizer', () => {
  describe('normalizeProducts', () => {
    it('skips rows that contain critical errors', () => {
      const rows: ParsedRow[] = [
        makeRow({ name: 'Good Product', ean: '1234567890123' }),
        makeRow({ name: 'Broken Product' }, [{ field: 'name', message: 'invalid', code: 'X', severity: 'error' }])
      ];

      const products = normalizer().normalizeProducts(rows);

      expect(products).toHaveLength(1);
      expect(products[0].name).toBe('Good Product');
    });

    it('normalizes multiple valid rows', () => {
      const rows: ParsedRow[] = [
        makeRow({ name: 'A', ean: '1111111111111' }),
        makeRow({ name: 'B', ean: '2222222222222' })
      ];

      expect(normalizer().normalizeProducts(rows)).toHaveLength(2);
    });
  });

  describe('normalizeSingleProduct', () => {
    it('returns null when the row has critical errors', () => {
      const row = makeRow({ name: 'Broken' }, [{ field: 'name', message: 'invalid', code: 'X', severity: 'error' }]);

      expect(normalizer().normalizeSingleProduct(row)).toBeNull();
    });

    it('returns a normalized product for a valid row', () => {
      const row = makeRow({ name: 'A', ean: '1111111111111' });

      const product = normalizer().normalizeSingleProduct(row);
      expect(product).not.toBeNull();
      expect(product!.id).toBe('ean_1111111111111');
    });
  });

  describe('Field normalization', () => {
    it('generates ids from EAN or reference', () => {
      const norm = normalizer();

      expect(norm.normalizeSingleProduct(makeRow({ name: 'A', ean: '1234567890123' }))!.id).toBe('ean_1234567890123');
      expect(norm.normalizeSingleProduct(makeRow({ name: 'B', reference: 'REF-01' }))!.id).toBe('ref_REF-01');
    });

    it('keeps the tax rules group id unchanged', () => {
      const product = normalizer().normalizeSingleProduct(makeRow({ name: 'A', ean: '1', tax: '21' }))!;

      expect(product.tax).toBe('21');
    });

    it('keeps prices unchanged instead of rounding them', () => {
      const product = normalizer().normalizeSingleProduct(makeRow({ name: 'A', ean: '1', price: 19.995 }))!;

      expect(product.price).toBe(19.995);
    });

    it('keeps stock quantities unchanged instead of truncating them', () => {
      const product = normalizer().normalizeSingleProduct(makeRow({ name: 'A', ean: '1', quantity: 10.7 }))!;

      expect(product.quantity).toBe(10.7);
    });
  });

  describe('Default values and source metadata', () => {
    it('applies default values', () => {
      const product = normalizer().normalizeSingleProduct(
        makeRow({ name: 'A', ean: '1234567890123', reference: 'REF-1', price: 10, quantity: 5 })
      )!;

      expect(product.source_file).toBe('unknown');
      expect(product.validation_errors).toEqual([]);
      expect(product.warnings).toEqual([]);
    });

    it('marks products as new and not updated', () => {
      const product = normalizer().normalizeSingleProduct(makeRow({ name: 'A', ean: '1' }))!;

      expect(product.is_new).toBe(true);
      expect(product.is_updated).toBe(false);
    });
  });

  describe('Required field validation', () => {
    it('marks a product missing its name as invalid', () => {
      const product = normalizer().normalizeSingleProduct(
        makeRow({ ean: '1234567890123', price: 10, quantity: 5 })
      )!;

      expect(product.status).toBe('invalid');
      expect(product.validation_errors).toContainEqual(expect.objectContaining({ field: 'name', code: 'MISSING_REQUIRED_FIELD' }));
    });

    it('sets a warning status when a product has errors and warnings', () => {
      const product = normalizer().normalizeSingleProduct(makeRow({ ean: '1234567890123' }))!;

      expect(product.status).toBe('warning');
      expect(product.validation_errors.some(e => e.field === 'name')).toBe(true);
      expect(product.warnings).toContain('Product missing price - will keep the existing store price');
    });

    it('adds warnings for missing price, stock, and identifiers', () => {
      const product = normalizer().normalizeSingleProduct(makeRow({ name: 'A' }))!;

      expect(product.warnings).toContain('Product missing price - will keep the existing store price');
      expect(product.warnings).toContain('Product missing stock quantity - will keep the existing store stock');
      expect(product.warnings).toContain('Product missing EAN and reference - manual matching required');
    });

    it('leaves a fully populated product as pending', () => {
      const product = normalizer().normalizeSingleProduct(
        makeRow({ name: 'A', ean: '1234567890123', price: 10, quantity: 5 })
      )!;

      expect(product.status).toBe('pending');
      expect(product.validation_errors).toEqual([]);
    });
  });

  describe('detectDuplicateProducts', () => {
    it('flags products sharing an EAN', () => {
      const products: ProductData[] = [
        makeProduct({ id: 'p1', reference: 'REF-001' }),
        makeProduct({ id: 'p2', reference: 'REF-002' }),
        makeProduct({ id: 'p3', ean: '9999999999999', reference: 'REF-003' })
      ];

      const duplicates = normalizer().detectDuplicateProducts(products);

      expect(duplicates).toHaveLength(2);
      expect(duplicates.every(p => p.status === 'duplicate')).toBe(true);
      expect(duplicates.map(p => p.id).sort()).toEqual(['p1', 'p2']);
    });

    it('returns an empty list when there are no duplicates', () => {
      const products: ProductData[] = [
        makeProduct({ id: 'p1', reference: 'REF-001' }),
        makeProduct({ id: 'p3', ean: '9999999999999', reference: 'REF-002' })
      ];

      expect(normalizer().detectDuplicateProducts(products)).toEqual([]);
    });
  });

  describe('getNormalizationSummary', () => {
    it('computes summary statistics', () => {
      const products: ProductData[] = [
        makeProduct({ id: 'p1', reference: 'REF-001' }),
        makeProduct({ id: 'p2', ean: '9999999999999', reference: undefined }),
        makeProduct({ id: 'p3', price: 10, quantity: 5, ean: undefined, reference: undefined })
      ];

      const summary = normalizer().getNormalizationSummary(products);

      expect(summary).toMatchObject({
        total: 3,
        with_ean: 2,
        with_reference: 1,
        with_price: 1,
        with_stock: 1,
        duplicates: 0
      });
      expect(summary.normalization_rate).toBe(100);
    });
  });
});
