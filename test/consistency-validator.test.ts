import { ConsistencyValidator, normalizeValue, PRODUCT_LEVEL_FIELDS } from '../backend/src/modules/consistency-validator/consistency-validator';
import { PrestaShopClient } from '../backend/src/modules/prestashop-client/prestashop-client';
import { ProductData, RowResolution } from '../backend/src/types';

function makeRow(id: string, ean: string, overrides: Partial<ProductData> = {}): ProductData {
  return {
    id,
    status: 'pending',
    source_file: 'test.csv',
    validation_errors: [],
    warnings: [],
    name: 'Test Product',
    ean,
    ...overrides
  };
}

function makeFakeClient(overrides: Partial<PrestaShopClient> = {}): PrestaShopClient {
  return {
    fetchCombinationsByEan: jest.fn().mockResolvedValue([]),
    fetchProductsById: jest.fn().mockResolvedValue([]),
    fetchStockByIds: jest.fn().mockResolvedValue([]),
    ...overrides
  } as unknown as PrestaShopClient;
}

describe('normalizeValue', () => {
  it('trims strings and treats empty/undefined as empty', () => {
    expect(normalizeValue('  Hello  ')).toBe('Hello');
    expect(normalizeValue('')).toBe('');
    expect(normalizeValue(undefined)).toBe('');
    expect(normalizeValue(null)).toBe('');
    expect(normalizeValue(21)).toBe('21');
  });
});

describe('ConsistencyValidator', () => {
  it('exposes the product-level fields to check', () => {
    expect(PRODUCT_LEVEL_FIELDS).toEqual([
      'name',
      'description',
      'description_short',
      'brand',
      'category',
      'tax'
    ]);
  });

  describe('validate', () => {
    it('resolves rows, attaches product data and stock quantities', async () => {
      const client = makeFakeClient({
        fetchCombinationsByEan: jest.fn().mockResolvedValue([
          { id_product_attribute: '11', id_product: '5', ean13: '8412345678901', reference: 'REF-A', stock_available_id: '50', price: 10, wholesale_price: 8 },
          { id_product_attribute: '12', id_product: '5', ean13: '8412345678902', reference: 'REF-B', stock_available_id: '51', price: 12, wholesale_price: 9 }
        ]),
        fetchProductsById: jest.fn().mockResolvedValue([
          { id: '5', name: 'Producto', description: 'Desc', tax_rules_group_id: 1, manufacturer_id: '3', categories: [] }
        ]),
        fetchStockByIds: jest.fn().mockResolvedValue([{ id: '50', quantity: 7 }, { id: '51', quantity: 2 }])
      });
      const validator = new ConsistencyValidator(client, 1);

      const rows = [makeRow('r1', '8412345678901'), makeRow('r2', '8412345678902')];
      const result = await validator.validate(rows);

      expect(client.fetchCombinationsByEan).toHaveBeenCalledWith(['8412345678901', '8412345678902']);
      expect(client.fetchProductsById).toHaveBeenCalledWith(['5']);
      expect(client.fetchStockByIds).toHaveBeenCalledWith(['50', '51']);
      expect(result.checked).toBe(true);
      expect(result.not_found_count).toBe(0);
      expect(result.resolutions).toHaveLength(2);
      expect(result.resolutions[0].id_product).toBe('5');
      expect(result.resolutions[0].product?.name).toBe('Producto');
      expect(result.resolutions[0].combination?.quantity).toBe(7);
      expect(result.resolutions[1].combination?.quantity).toBe(2);
    });

    it('marks rows whose EAN does not exist in PrestaShop', async () => {
      const client = makeFakeClient({
        fetchCombinationsByEan: jest.fn().mockResolvedValue([
          { id_product_attribute: '11', id_product: '5', ean13: '8412345678901', reference: 'REF-A' }
        ])
      });
      const validator = new ConsistencyValidator(client, 1);

      const result = await validator.validate([makeRow('r1', '8412345678901'), makeRow('r2', '9999999999999')]);

      expect(result.not_found_count).toBe(1);
      const errored = result.resolutions.find((r) => r.row_id === 'r2');
      expect(errored?.error).toContain('not found');
      expect(errored?.id_product).toBeUndefined();
    });
  });

  describe('detectInconsistencies', () => {
    it('flags product-level fields with different filled values across combinations', () => {
      const validator = new ConsistencyValidator(makeFakeClient(), 1);
      const resolutions: RowResolution[] = [
        {
          row_id: 'r1',
          row: makeRow('r1', '8412345678901', { name: 'Nombre A', description: 'Desc A', brand: 'Marca', tax: '1' }),
          id_product: '5',
          combination: { id_product_attribute: '11', id_product: '5', ean13: '8412345678901' }
        },
        {
          row_id: 'r2',
          row: makeRow('r2', '8412345678902', { name: 'Nombre B', description: 'Desc A', brand: '', tax: '' }),
          id_product: '5',
          combination: { id_product_attribute: '12', id_product: '5', ean13: '8412345678902' }
        }
      ];

      const issues = validator.detectInconsistencies(resolutions);

      expect(issues).toHaveLength(1);
      expect(issues[0].field).toBe('name');
      expect(issues[0].id_product).toBe('5');
      expect(issues[0].values).toEqual([
        { row_id: 'r1', value: 'Nombre A' },
        { row_id: 'r2', value: 'Nombre B' }
      ]);
    });

    it('does not flag a filled value next to empty cells', () => {
      const validator = new ConsistencyValidator(makeFakeClient(), 1);
      const resolutions: RowResolution[] = [
        {
          row_id: 'r1',
          row: makeRow('r1', '8412345678901', { name: 'Nombre A', brand: 'Marca', category: 'Categoria' }),
          id_product: '5',
          combination: { id_product_attribute: '11', id_product: '5', ean13: '8412345678901' }
        },
        {
          row_id: 'r2',
          row: makeRow('r2', '8412345678902', { name: '', brand: '', category: 'Categoria' }),
          id_product: '5',
          combination: { id_product_attribute: '12', id_product: '5', ean13: '8412345678902' }
        }
      ];

      expect(validator.detectInconsistencies(resolutions)).toEqual([]);
    });

    it('skips rows that could not be resolved to a product', () => {
      const validator = new ConsistencyValidator(makeFakeClient(), 1);
      const resolutions: RowResolution[] = [
        {
          row_id: 'r1',
          row: makeRow('r1', '9999999999999', { name: 'A' }),
          error: "EAN '9999999999999' not found in PrestaShop"
        },
        {
          row_id: 'r2',
          row: makeRow('r2', '8412345678902', { name: 'B' }),
          id_product: '5',
          combination: { id_product_attribute: '12', id_product: '5', ean13: '8412345678902' }
        }
      ];

      const issues = validator.detectInconsistencies(resolutions);

      expect(issues).toEqual([]);
    });
  });
});
