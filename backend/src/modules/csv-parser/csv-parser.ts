// CSV Parser Module
// Handles CSV file reading with encoding detection and field normalization.

import fs from 'fs-extra';
import { logger } from '../../utils/logger';
import {
  ParsedRow,
  CSVConfig,
  CSVResult,
  ProductField,
  ValidationError,
  ProductData
} from '../../types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { detect } = require('encoding-japanese') as { detect: (data: Uint8Array) => string };

export class CSVParser {
  private config: CSVConfig;

  constructor(config: Partial<CSVConfig> = {}) {
    this.config = {
      delimiter: config.delimiter || ',',
      encoding: config.encoding || 'utf8',
      skip_empty_rows: config.skip_empty_rows ?? true,
      headers_case_sensitive: config.headers_case_sensitive || false,
      field_mapping: config.field_mapping || this.getDefaultFieldMapping()
    };
  }

  private getDefaultFieldMapping(): Record<string, ProductField> {
    return {
      'ean': 'ean',
      'ean13': 'ean',
      'reference': 'reference',
      'sku': 'sku',
      'name': 'name',
      'description': 'description',
      'description_short': 'description_short',
      'price': 'price',
      'wholesale_price': 'wholesale_price',
      'quantity': 'quantity',
      'stock': 'quantity',
      'brand': 'brand',
      'manufacturer': 'manufacturer',
      'category': 'category',
      'tax': 'tax',
      'weight': 'weight',
      'image_hints': 'image_hints'
    };
  }

  async parseFile(filePath: string): Promise<CSVResult> {
    const startTime = Date.now();

    try {
      logger.info('Starting CSV file parsing', {
        filePath,
        delimiter: this.config.delimiter,
        skipEmptyRows: this.config.skip_empty_rows
      });

      const buffer = await fs.readFile(filePath);
      const detectedEncoding = await this.detectEncoding(buffer);
      const content = buffer.toString(detectedEncoding);

      const lines = this.parseContent(content, detectedEncoding);
      const headers = this.extractHeaders(lines[0]);
      const rows = this.parseRows(lines.slice(1), headers);

      const result: CSVResult = {
        rows,
        headers,
        total_rows: rows.length,
        valid_rows: rows.filter(row => row.errors.length === 0).length,
        invalid_rows: rows.filter(row => row.errors.length > 0).length,
        encoding_detected: detectedEncoding,
        parsing_time: Date.now() - startTime
      };

      logger.info('CSV parsing completed', {
        total_rows: result.total_rows,
        valid_rows: result.valid_rows,
        invalid_rows: result.invalid_rows,
        encoding: result.encoding_detected,
        parsing_time_ms: result.parsing_time
      });

      return result;
    } catch (error) {
      logger.error('CSV parsing failed', { filePath, error });
      throw new Error(`Failed to parse CSV file: ${(error as Error).message}`);
    }
  }

  private async detectEncoding(buffer: Buffer): Promise<BufferEncoding> {
    try {
      const detected = detect(buffer);
      const normalized = (detected || '').toLowerCase();

      // ASCII is a subset of UTF-8; treat it as the configured default
      if (normalized && normalized !== 'unknown' && normalized !== 'ascii') {
        return normalized as BufferEncoding;
      }
    } catch (error) {
      logger.warn('Encoding detection failed, using default', { error });
    }
    return this.config.encoding as BufferEncoding;
  }

  private parseContent(content: string, encoding: string): string[] {
    const lines = content.split(/\r?\n/);
    return lines
      .filter(line => line.trim())
      .filter(line => {
        if (!this.config.skip_empty_rows) return true;
        return line.split(this.config.delimiter).some(field => field.trim() !== '');
      });
  }

  private extractHeaders(firstLine: string): string[] {
    let headers = firstLine.split(this.config.delimiter);

    if (!this.config.headers_case_sensitive) {
      headers = headers.map(header => header.trim().toLowerCase());
    } else {
      headers = headers.map(header => header.trim());
    }

    return headers;
  }

  private parseRows(lines: string[], headers: string[]): ParsedRow[] {
    const rows: ParsedRow[] = [];

    for (let i = 1; i <= lines.length; i++) {
      const line = lines[i - 1];
      const rawValues = this.parseLine(line);
      const raw = this.mapToObject(headers, rawValues);
      const normalized = this.normalizeRow(rawValues, headers);
      const errors = this.validateRow(normalized, raw);

      rows.push({
        raw,
        normalized,
        errors,
        warnings: []
      });
    }

    this.markDuplicates(rows);

    return rows;
  }

  private parseLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote inside a quoted field ("")
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === this.config.delimiter && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values;
  }

  private normalizeRow(rawValues: string[], headers: string[]): Partial<ProductData> {
    const normalized: Partial<ProductData> = {};

    for (let i = 0; i < Math.min(rawValues.length, headers.length); i++) {
      const header = headers[i];
      const rawValue = rawValues[i];

      if (!rawValue) continue;

      const headerKey = this.config.headers_case_sensitive
        ? header
        : header.toLowerCase();

      const field = this.config.field_mapping[headerKey] || (headerKey as ProductField);

      const normalizedValue = this.normalizeFieldValue(field, rawValue);
      normalized[field] = normalizedValue;
    }

    return normalized;
  }

  private normalizeFieldValue(field: ProductField, value: string): any {
    switch (field) {
      case 'ean':
      case 'ean13':
        return this.normalizeEAN(value);
      case 'price':
      case 'wholesale_price':
        return this.parsePrice(value);
      case 'quantity':
      case 'stock':
        return this.parseQuantity(value);
      case 'tax':
        return this.parseTax(value);
      case 'weight':
        return this.parseWeight(value);
      default:
        return value.trim();
    }
  }

  private normalizeEAN(value: string): string | undefined {
    const cleaned = value.replace(/[^0-9]/g, '');
    if (cleaned.length === 13) return cleaned;
    if (cleaned.length === 8) return cleaned;
    return undefined;
  }

  private parsePrice(value: string): number | undefined {
    const cleaned = value.replace(/[^0-9.,]/g, '');
    const number = parseFloat(cleaned.replace(/,/g, ''));
    return isNaN(number) || number < 0 ? undefined : number;
  }

  private parseQuantity(value: string): number | undefined {
    const cleaned = value.replace(/[^0-9]/g, '');
    const number = parseInt(cleaned, 10);
    return isNaN(number) || number < 0 ? undefined : number;
  }

  private parseTax(value: string): number | undefined {
    const cleaned = value.replace(/[^0-9.,]/g, '');
    const number = parseFloat(cleaned);
    return isNaN(number) || number < 0 || number > 100 ? undefined : number / 100;
  }

  private parseWeight(value: string): number | undefined {
    const cleaned = value.replace(/[^0-9.,]/g, '');
    const number = parseFloat(cleaned);
    return isNaN(number) || number < 0 ? undefined : number;
  }

  private mapToObject(headers: string[], values: string[]): Record<string, string> {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length && i < values.length; i++) {
      obj[headers[i]] = values[i];
    }
    return obj;
  }

  private validateRow(row: Partial<ProductData>, raw: Record<string, string>): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!row.name) {
      errors.push({
        field: 'name',
        message: 'Product name is required',
        code: 'MISSING_REQUIRED_FIELD',
        severity: 'error',
        value: row.name
      });
    }

    const rawEan = (raw['ean'] || raw['ean13'] || '').trim();
    if (rawEan && !row.ean) {
      errors.push({
        field: 'ean',
        message: 'Invalid EAN format (must be 8 or 13 digits)',
        code: 'INVALID_EAN',
        severity: 'error',
        value: rawEan
      });
    }

    const rawPrice = (raw['price'] || '').trim();
    if (rawPrice && row.price === undefined) {
      errors.push({
        field: 'price',
        message: 'Price must be a non-negative number',
        code: 'INVALID_PRICE',
        severity: 'error',
        value: rawPrice
      });
    }

    const rawQuantity = (raw['quantity'] || raw['stock'] || '').trim();
    if (rawQuantity && row.quantity === undefined) {
      errors.push({
        field: 'quantity',
        message: 'Stock quantity must be a non-negative integer',
        code: 'INVALID_QUANTITY',
        severity: 'error',
        value: rawQuantity
      });
    }

    return errors;
  }

  private markDuplicates(rows: ParsedRow[]): void {
    const seen = new Map<string, number>();

    rows.forEach((row, index) => {
      const keys: Array<{ field: string; key: string }> = [];
      if (row.normalized.ean) keys.push({ field: 'ean', key: `ean:${row.normalized.ean}` });
      if (row.normalized.ean13) keys.push({ field: 'ean', key: `ean:${row.normalized.ean13}` });
      if (row.normalized.reference) keys.push({ field: 'reference', key: `ref:${row.normalized.reference}` });

      for (const entry of keys) {
        if (seen.has(entry.key)) {
          const label = entry.field === 'ean' ? 'EAN' : 'reference';
          const value = entry.key.split(':')[1];
          row.errors.push({
            field: entry.field,
            message: `Duplicate ${label} '${value}' already exists in this file`,
            code: 'DUPLICATE_VALUE',
            severity: 'error',
            value
          });
        } else {
          seen.set(entry.key, index);
        }
      }
    });
  }

  private validateEAN(ean: string): boolean {
    if (!ean) return false;
    const cleaned = ean.replace(/[^0-9]/g, '');
    return [8, 13].includes(cleaned.length);
  }
}
