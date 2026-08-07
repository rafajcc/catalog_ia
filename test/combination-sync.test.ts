import { CombinationSync } from '../backend/src/modules/combination-sync/combination-sync';
import { PrestaShopClient } from '../backend/src/modules/prestashop-client/prestashop-client';
import { PrestaShopCombinationInfo, PrestaShopProductInfo, ProductData, RowResolution } from '../backend/src/types';

const successResult = { success: true, errors: [], warnings: [], timestamp: new Date() };

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

function makeCombination(overrides: Partial<PrestaShopCombinationInfo> = {}): PrestaShopCombinationInfo {
  return {
    id_product_attribute: '11',
    id_product: '5',
    ean13: '8412345678901',
    reference: 'REF-A',
    price: 10,
    wholesale_price: 8,
    stock_available_id: '50',
    quantity: 5,
    ...overrides
  };
}

function makeProductInfo(overrides: Partial<PrestaShopProductInfo> = {}): PrestaShopProductInfo {
  return {
    id: '5',
    name: 'Viejo Nombre',
    description: 'Vieja Desc',
    description_short: 'Vieja Desc Corta',
    tax_rules_group_id: 3,
    manufacturer_id: '',
    categories: [],
    ...overrides
  };
}

function makeResolution(row: ProductData, overrides: Partial<RowResolution> = {}): RowResolution {
  return {
    row_id: row.id,
    row,
    id_product: '5',
    combination: makeCombination(),
    product: makeProductInfo(),
    ...overrides
  };
}

function makeFakeClient(overrides: Partial<PrestaShopClient> = {}): PrestaShopClient {
  return {
    updateProductFields: jest.fn().mockResolvedValue(successResult),
    updateCombination: jest.fn().mockResolvedValue(successResult),
    updateStock: jest.fn().mockResolvedValue(successResult),
    resolveManufacturer: jest.fn().mockResolvedValue(null),
    createManufacturer: jest.fn().mockResolvedValue(null),
    resolveCategoryByName: jest.fn().mockResolvedValue(null),
    createCategory: jest.fn().mockResolvedValue(null),
    ...overrides
  } as unknown as PrestaShopClient;
}

describe('CombinationSync', () => {
  it('updates product-level fields once when the CSV has a single filled value', async () => {
    const updateProductFields = jest.fn().mockResolvedValue(successResult);
    const resolveManufacturer = jest.fn().mockResolvedValue('9');
    const resolveCategoryByName = jest.fn().mockResolvedValue('8');
    const client = makeFakeClient({ updateProductFields, resolveManufacturer, resolveCategoryByName });
    const sync = new CombinationSync(client, 1);

    const row = makeRow('r1', '8412345678901', { name: 'Nombre', description: 'Desc', brand: 'Marca', category: 'Categoria', tax: '1' });
    const result = await sync.upload([makeResolution(row)], [row]);

    expect(resolveManufacturer).toHaveBeenCalledWith('Marca');
    expect(resolveCategoryByName).toHaveBeenCalledWith('Categoria');
    expect(updateProductFields).toHaveBeenCalledTimes(1);
    const payload = updateProductFields.mock.calls[0][1];
    expect(payload.id).toBe('5');
    expect(payload.name).toEqual({ language: { _attributes: { id: '1' }, _cdata: 'Nombre' } });
    expect(payload.description).toEqual({ language: { _attributes: { id: '1' }, _cdata: 'Desc' } });
    expect(payload.tax_rules_group_id).toBe(1);
    expect(payload.manufacturer).toEqual({ _attributes: { id: '9' } });
    expect(payload.associations.categories.category).toEqual([{ _attributes: { id: '8' } }]);
    expect(result.products_updated).toBe(1);
  });

  it('does not call the API when nothing differs from the store', async () => {
    const updateProductFields = jest.fn().mockResolvedValue(successResult);
    const client = makeFakeClient({ updateProductFields });
    const sync = new CombinationSync(client, 1);

    const row = makeRow('r1', '8412345678901', { name: 'Viejo Nombre', tax: '3' });
    const result = await sync.upload([makeResolution(row)], [row]);

    expect(updateProductFields).not.toHaveBeenCalled();
    const entry = result.results.find((r) => r.operation === 'update_product');
    expect(entry?.status).toBe('skipped');
    expect(entry?.error).toBe('No product changes');
  });

  it('skips product-level fields that are still inconsistent (several filled values)', async () => {
    const updateProductFields = jest.fn().mockResolvedValue(successResult);
    const client = makeFakeClient({ updateProductFields });
    const sync = new CombinationSync(client, 1);

    const rowA = makeRow('r1', '8412345678901', { name: 'Nombre A', brand: 'Marca A', tax: '1' });
    const rowB = makeRow('r2', '8412345678902', { name: 'Nombre B', brand: 'Marca B', tax: '1' });
    const resolutions = [
      makeResolution(rowA, { combination: makeCombination({ id_product_attribute: '11' }) }),
      makeResolution(rowB, { combination: makeCombination({ id_product_attribute: '12', ean13: '8412345678902' }) })
    ];

    await sync.upload(resolutions, [rowA, rowB]);

    const payload = updateProductFields.mock.calls[0][1];
    expect(payload.name).toBeUndefined();
    expect(payload.brand).toBeUndefined();
    expect(payload.tax_rules_group_id).toBe(1);
  });

  it('creates the manufacturer and category when they do not exist yet', async () => {
    const createManufacturer = jest.fn().mockResolvedValue('77');
    const createCategory = jest.fn().mockResolvedValue('88');
    const client = makeFakeClient({
      resolveManufacturer: jest.fn().mockResolvedValue(null),
      createManufacturer,
      resolveCategoryByName: jest.fn().mockResolvedValue(null),
      createCategory
    });
    const sync = new CombinationSync(client, 1);

    const row = makeRow('r1', '8412345678901', { brand: 'Marca Nueva', category: 'Categoria Nueva' });
    const result = await sync.upload([makeResolution(row)], [row]);

    expect(createManufacturer).toHaveBeenCalledWith('Marca Nueva');
    expect(createCategory).toHaveBeenCalledWith('Categoria Nueva');
    expect(result.manufacturers_created).toBe(1);
    expect(result.categories_created).toBe(1);
    expect(result.products_updated).toBe(1);
  });

  it('updates combination fields and stock per row, skipping empty cells', async () => {
    const updateCombination = jest.fn().mockResolvedValue(successResult);
    const updateStock = jest.fn().mockResolvedValue(successResult);
    const client = makeFakeClient({ updateCombination, updateStock });
    const sync = new CombinationSync(client, 1);

    const row = makeRow('r1', '8412345678901', { reference: 'REF-NUEVO', price: 15.5, wholesale_price: 11.25, quantity: 3 });
    const result = await sync.upload([makeResolution(row)], [row]);

    expect(updateCombination).toHaveBeenCalledTimes(1);
    const payload = updateCombination.mock.calls[0][1];
    expect(payload.id_product_attribute).toBe('11');
    expect(payload.reference).toBe('REF-NUEVO');
    expect(payload.price).toBe(15.5);
    expect(payload.wholesale_price).toBe(11.25);
    expect(payload.ean13).toBeUndefined();

    expect(updateStock).toHaveBeenCalledWith({ id: '50', quantity: 3 });
    expect(result.combinations_updated).toBe(1);
    expect(result.stock_updated).toBe(1);
  });

  it('skips a combination that has no changes', async () => {
    const updateCombination = jest.fn();
    const updateStock = jest.fn();
    const client = makeFakeClient({ updateCombination, updateStock });
    const sync = new CombinationSync(client, 1);

    const row = makeRow('r1', '8412345678901', { reference: 'REF-A', price: 10, wholesale_price: 8, quantity: 5 });
    await sync.upload([makeResolution(row)], [row]);

    expect(updateCombination).not.toHaveBeenCalled();
    expect(updateStock).not.toHaveBeenCalled();
  });

  it('uses the edited rows when they are provided', async () => {
    const updateProductFields = jest.fn().mockResolvedValue(successResult);
    const client = makeFakeClient({ updateProductFields });
    const sync = new CombinationSync(client, 1);

    const original = makeRow('r1', '8412345678901', { name: 'Nombre Original' });
    const edited = makeRow('r1', '8412345678901', { name: 'Nombre Editado' });
    await sync.upload([makeResolution(original)], [edited]);

    expect(updateProductFields.mock.calls[0][1].name).toEqual({
      language: { _attributes: { id: '1' }, _cdata: 'Nombre Editado' }
    });
  });

  it('records failed updates without counting them as updated', async () => {
    const updateCombination = jest.fn().mockResolvedValue({
      success: false,
      errors: ['timeout'],
      warnings: [],
      timestamp: new Date()
    });
    const client = makeFakeClient({ updateCombination });
    const sync = new CombinationSync(client, 1);

    const row = makeRow('r1', '8412345678901', { reference: 'REF-NUEVO' });
    const result = await sync.upload([makeResolution(row)], [row]);

    expect(result.combinations_updated).toBe(0);
    const entry = result.results.find((r) => r.operation === 'update_combination');
    expect(entry?.status).toBe('failed');
    expect(entry?.error).toBe('timeout');
  });
});
