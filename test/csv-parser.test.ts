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
    it('normalizes EAN values (8 or 13 digits) and keeps invalid ones for later validation', async () => {
      const result = await parseLines([
        'ean,reference,name,price,quantity',
        '1234567890123,REF-001,Test Product A,29.99,100',
        '8901234567890,REF-002,Test Product B,19.50,50',
        'INVALID-EAN,REF-003,Test Product C,15.00,25'
      ]);

      expect(result.total_rows).toBe(3);
      expect(result.valid_rows).toBe(3);
      expect(result.invalid_rows).toBe(0);
      expect(result.rows[0].normalized.ean).toBe('1234567890123');
      expect(result.rows[1].normalized.ean).toBe('8901234567890');
      expect(result.rows[2].normalized.ean).toBe('INVALID-EAN');
    });

    it('normalizes prices with currency symbols', async () => {
      const result = await parseLines([
        'ean,reference,name,price,description',
        '1234567890123,REF-001,Product A,$29.99,Description A',
        '1234567890124,REF-002,Product B,€19.50,Description B',
        '1234567890125,REF-003,Product C,¥15.00,Description C'
      ]);

      expect(result.total_rows).toBe(3);
      expect(result.valid_rows).toBe(3);
      expect(result.invalid_rows).toBe(0);
    });

    it('keeps raw values for prices with more than two decimals so validation can flag them', async () => {
      const result = await parseLines([
        'ean,reference,name,price,wholesale_price,quantity',
        '1234567890123,REF-001,Product A,19.999,15.00,10',
        '1234567890124,REF-002,Product B,20.00,14.555,10',
        '1234567890125,REF-003,Product C,20.00,14.55,10'
      ]);

      expect(result.valid_rows).toBe(3);
      expect(result.invalid_rows).toBe(0);
      expect(result.rows[0].normalized.price).toBe('19.999');
      expect(result.rows[1].normalized.wholesale_price).toBe('14.555');
      expect(result.rows[2].normalized.price).toBe(20);
    });

    it('keeps raw values for non-integer quantities so validation can flag them', async () => {
      const result = await parseLines([
        'ean,reference,name,quantity',
        '1234567890123,REF-001,Product A,10.7',
        '1234567890124,REF-002,Product B,abc',
        '1234567890125,REF-003,Product C,10'
      ]);

      expect(result.valid_rows).toBe(3);
      expect(result.invalid_rows).toBe(0);
      expect(result.rows[0].normalized.quantity).toBe('10.7');
      expect(result.rows[1].normalized.quantity).toBe('abc');
      expect(result.rows[2].normalized.quantity).toBe(10);
    });

    it('does not reject rows during parsing: data validation happens on the validation screen', async () => {
      const result = await parseLines([
        'ean,reference,name,price',
        ',REF-001,Product A,10.00',
        '1234567890123,REF-002,Product B,10.00',
        `1234567890124,${'R'.repeat(65)},Product C,10.00`
      ]);

      expect(result.total_rows).toBe(3);
      expect(result.valid_rows).toBe(3);
      expect(result.invalid_rows).toBe(0);
      expect(result.rows.every(row => row.errors.length === 0)).toBe(true);
    });
  });
});
