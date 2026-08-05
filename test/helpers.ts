import { ProductData, ParsedRow } from '../backend/src/types';

export function makeProduct(overrides: Partial<ProductData> = {}): ProductData {
  return {
    id: 'ean_1234567890123',
    status: 'pending',
    source_file: 'test.csv',
    validation_errors: [],
    warnings: [],
    name: 'Test Product',
    ean: '1234567890123',
    reference: 'REF-001',
    ...overrides
  };
}

export function makeRow(
  normalized: Partial<ProductData>,
  errors: Array<{ field: string; message: string; code: string; severity: 'error' | 'warning' }> = []
): ParsedRow {
  return {
    raw: {},
    normalized,
    errors,
    warnings: []
  };
}
