import path from 'path';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { CSVParser } from '../backend/src/modules/csv-parser/csv-parser';

const EXAMPLE_CSV = path.join(__dirname, '..', 'examples', 'example-products.csv');

function createParser(): CSVParser {
  return new CSVParser({
    delimiter: ',',
    encoding: 'utf8',
    skip_empty_rows: true,
    headers_case_sensitive: false
  });
}

function parseLines(lines: string[]) {
  const tempFile = path.join(__dirname, 'temp-test.csv');
  writeFileSync(tempFile, lines.join('\n'));

  try {
    return createParser().parseFile(tempFile);
  } finally {
    if (existsSync(tempFile)) {
      unlinkSync(tempFile);
    }
  }
}

describe('CSVParser', () => {
  describe('Basic CSV parsing', () => {
    it('parses the example CSV with all fields', async () => {
      const result = await createParser().parseFile(EXAMPLE_CSV);

      expect(result.total_rows).toBe(10);
      expect(result.valid_rows).toBe(10);
      expect(result.invalid_rows).toBe(0);
      expect(result.encoding_detected).toBe('utf8');
    });
  });

  describe('Field normalization', () => {
    it('normalizes EAN values (8 or 13 digits) and flags invalid ones', async () => {
      const result = await parseLines([
        'ean,reference,name,price,quantity',
        '1234567890123,REF-001,Test Product A,29.99,100',
        '8901234567890,REF-002,Test Product B,19.50,50',
        'INVALID-EAN,REF-003,Test Product C,15.00,25'
      ]);

      expect(result.total_rows).toBe(3);
      expect(result.valid_rows).toBe(2);
      expect(result.invalid_rows).toBe(1);
    });

    it('normalizes prices with currency symbols', async () => {
      const result = await parseLines([
        'name,price,description',
        'Product A,$29.99,Description A',
        'Product B,€19.50,Description B',
        'Product C,¥15.00,Description C'
      ]);

      expect(result.total_rows).toBe(3);
      expect(result.valid_rows).toBe(3);
      expect(result.invalid_rows).toBe(0);
    });

    it('maps the stock column to quantity', async () => {
      const result = await parseLines([
        'name,stock,qty',
        'Product A,100,100',
        'Product B,50,50',
        'Product C,abc,0'
      ]);

      expect(result.total_rows).toBe(3);
      expect(result.valid_rows).toBe(2);
      expect(result.invalid_rows).toBe(1);
    });
  });

  describe('Duplicate detection', () => {
    it('flags rows that repeat the same EAN', async () => {
      const result = await parseLines([
        'ean,name,reference',
        '1234567890123,Product A,REF-001',
        '1234567890123,Product B,REF-002'
      ]);

      expect(result.total_rows).toBe(2);
      expect(result.valid_rows).toBe(1);
      expect(result.invalid_rows).toBe(1);
    });
  });
});
