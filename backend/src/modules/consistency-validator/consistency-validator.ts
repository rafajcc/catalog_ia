// Consistency Validator Module
// Each CSV row is one product combination in PrestaShop. Because the CSV does
// not carry the id_product, combinations that belong to the same product can
// only be found by resolving every row's EAN against PrestaShop.
//
// This module resolves the rows (in a few batched requests), groups the
// resolutions by id_product and detects inconsistencies in product-level fields
// (name, description, description_short, brand, category, tax): two combinations
// of the same product with different filled values are inconsistent, while a
// filled value next to an empty one is fine (the empty one can be filled from
// the other).

import {
  ConsistencyIssue,
  ConsistencyResult,
  PrestaShopCombinationInfo,
  ProductData,
  RowResolution
} from '../../types';
import { PrestaShopClient } from '../prestashop-client/prestashop-client';

// Fields that belong to the product, not to a single combination. Different
// filled values across combinations of the same id_product are inconsistent.
export const PRODUCT_LEVEL_FIELDS = [
  'name',
  'description',
  'description_short',
  'brand',
  'category',
  'tax'
] as const;

export type ProductLevelField = (typeof PRODUCT_LEVEL_FIELDS)[number];

export function normalizeValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function describeIssue(field: string, values: Array<{ row_id: string; value: string }>): string {
  const quoted = values.map((entry) => `'${entry.value}'`).join(' vs ');
  return `${field} differs across combinations of product: ${quoted}`;
}

export class ConsistencyValidator {
  private client: PrestaShopClient;
  private languageId: number;

  constructor(client: PrestaShopClient, languageId = 1) {
    this.client = client;
    this.languageId = languageId;
  }

  async validate(rows: ProductData[]): Promise<ConsistencyResult> {
    const resolutions = await this.resolve(rows);
    const issues = this.detectInconsistencies(resolutions);

    return {
      resolutions,
      issues,
      not_found_count: resolutions.filter((resolution) => !!resolution.error).length,
      checked: true
    };
  }

  private async resolve(rows: ProductData[]): Promise<RowResolution[]> {
    const eans = rows.map((row) => row.ean ?? '').filter(Boolean);
    const combinations = await this.client.fetchCombinationsByEan(eans);

    const byEan = new Map<string, PrestaShopCombinationInfo>();
    for (const combination of combinations) {
      if (combination.ean13) {
        byEan.set(combination.ean13, combination);
      }
    }

    const resolutions: RowResolution[] = [];
    const productIds = new Set<string>();

    for (const row of rows) {
      const ean = (row.ean ?? '').replace(/[^0-9]/g, '');
      const combination = ean ? byEan.get(ean) : undefined;

      if (!combination) {
        resolutions.push({
          row_id: row.id,
          row,
          error: `EAN '${row.ean ?? ''}' not found in PrestaShop`
        });
        continue;
      }

      resolutions.push({
        row_id: row.id,
        row,
        id_product: combination.id_product,
        combination
      });
      if (combination.id_product) {
        productIds.add(combination.id_product);
      }
    }

    // Product-level data (shared by every combination of the same product).
    const products = await this.client.fetchProductsById([...productIds]);
    const productsById = new Map(products.map((product) => [product.id, product]));

    // Stock lives in the stock_available associated with each combination.
    const stockIds = resolutions
      .map((resolution) => resolution.combination?.stock_available_id)
      .filter((id): id is string => !!id);
    const stock = await this.client.fetchStockByIds(stockIds);
    const stockById = new Map(stock.map((entry) => [entry.id, entry.quantity]));

    for (const resolution of resolutions) {
      if (!resolution.id_product) continue;
      resolution.product = productsById.get(resolution.id_product);
      const stockId = resolution.combination?.stock_available_id;
      if (stockId) {
        resolution.combination!.quantity = stockById.get(stockId);
      }
    }

    return resolutions;
  }

  detectInconsistencies(resolutions: RowResolution[]): ConsistencyIssue[] {
    const groups = new Map<string, RowResolution[]>();
    for (const resolution of resolutions) {
      if (!resolution.id_product) continue;
      const list = groups.get(resolution.id_product) ?? [];
      list.push(resolution);
      groups.set(resolution.id_product, list);
    }

    const issues: ConsistencyIssue[] = [];

    for (const [id_product, group] of groups) {
      for (const field of PRODUCT_LEVEL_FIELDS) {
        const filled = group
          .map((resolution) => ({
            row_id: resolution.row_id,
            value: normalizeValue(resolution.row[field as keyof ProductData])
          }))
          .filter((entry) => entry.value !== '');

        const distinct = new Set(filled.map((entry) => entry.value));
        if (distinct.size <= 1) continue;

        issues.push({
          field,
          id_product,
          values: filled,
          message: describeIssue(field, filled)
        });
      }
    }

    return issues;
  }
}
