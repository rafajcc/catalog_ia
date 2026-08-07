// CSV Parser Module
// Handles CSV file reading with encoding detection and field normalization.

import fs from 'fs-extra';
import { detect } from 'encoding-japanese';
import { logger } from '../../utils/logger';
import {
  ParsedRow,
  CSVConfig,
  CSVResult,
  ProductField,
  ProductData
} from '../../types';

export const CSV_TEMPLATE_HEADERS = [
  'ean',
  'reference',
  'name',
  'price',
  'wholesale_price',
  'quantity',
  'brand',
  'category',
  'tax',
  'description_short',
  'description',
  'image_hints'
];

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
      'name': 'name',
      'description': 'description',
      'description_short': 'description_short',
      'price': 'price',
      'wholesale_price': 'wholesale_price',
      'quantity': 'quantity',
      'brand': 'brand',
      'category': 'category',
      'tax': 'tax',
      'image_hints': 'image_hints'
    };
  }

  getSupportedFields(): string[] {
    return Object.keys(this.getDefaultFieldMapping());
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

      const lines = this.parseContent(content);
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

  private parseContent(content: string): string[] {
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

      rows.push({
        raw,
        normalized,
        errors: [],
        warnings: []
      });
    }

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
        return this.parseQuantity(value);
      default:
        return value.trim();
    }
  }

  private normalizeEAN(value: string): string | undefined {
    const cleaned = value.replace(/[^0-9]/g, '');
    if (cleaned.length === 13) return cleaned;
    if (cleaned.length === 8) return cleaned;
    // Keep the raw value so the validation screen can flag the format error.
    return value.trim() || undefined;
  }

  private parsePrice(value: string): number | string | undefined {
    const cleaned = value.replace(/[^0-9.,]/g, '');
    if (!cleaned) return value.trim() || undefined;

    // Resolve comma/dot ambiguity: with both separators the last one is the
    // decimal separator and the other one a thousands separator.
    let normalized: string;
    if (cleaned.includes(',') && cleaned.includes('.')) {
      const decimalSep = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.') ? ',' : '.';
      const thousandsSep = decimalSep === ',' ? '.' : ',';
      normalized = cleaned.split(thousandsSep).join('').replace(decimalSep, '.');
    } else {
      normalized = cleaned.replace(/,/g, '.');
    }

    // Prices are not rounded: more than 2 decimal places is an error.
    const [, fraction = ''] = normalized.split('.');
    if (fraction.length > 2) return value.trim();

    const number = parseFloat(normalized);
    if (isNaN(number) || number < 0) return value.trim();
    return number;
  }

  private parseQuantity(value: string): number | string | undefined {
    // Quantities are not truncated: only non-negative integers are accepted.
    if (!/^\d+$/.test(value.trim())) return value.trim() || undefined;
    const number = parseInt(value.trim(), 10);
    if (isNaN(number) || number < 0) return value.trim();
    return number;
  }

  private mapToObject(headers: string[], values: string[]): Record<string, string> {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length && i < values.length; i++) {
      obj[headers[i]] = values[i];
    }
    return obj;
  }
}
