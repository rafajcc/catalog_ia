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

let tempFileCounter = 0;

async function parseLines(lines: string[]) {
  const tempFile = path.join(__dirname, `temp-test-${process.pid}-${tempFileCounter++}.csv`);
  writeFileSync(tempFile, lines.join('\n'));

  try {
    // Windows AV can briefly lock a freshly written file (EPERM/ENOENT); retry.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await createParser().parseFile(tempFile);
      } catch (error) {
        const message = (error as Error).message;
        const transient = message.includes('EPERM') || message.includes('ENOENT');
        if (!transient || attempt === 4) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
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

    it('rejects prices with more than two decimals instead of rounding them', async () => {
      const result = await parseLines([
        'ean,name,price,wholesale_price,quantity',
        '1234567890123,Product A,19.999,15.00,10',
        '1234567890124,Product B,20.00,14.555,10',
        '1234567890125,Product C,20.00,14.55,10'
      ]);

      expect(result.valid_rows).toBe(1);
      expect(result.invalid_rows).toBe(2);
    });

    it('rejects non-integer quantities instead of truncating them', async () => {
      const result = await parseLines([
        'ean,name,quantity',
        '1234567890123,Product A,10.7',
        '1234567890124,Product B,abc',
        '1234567890125,Product C,10'
      ]);

      expect(result.valid_rows).toBe(1);
      expect(result.invalid_rows).toBe(2);
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
