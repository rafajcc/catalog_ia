// Combination Sync Module
// Uploads the validated CSV rows back to PrestaShop. Every field of the table
// that is filled in the CSV and differs from the current store value is updated:
// - product-level fields once per product: name, description, description_short,
//   tax, brand (mapped to the manufacturer, creating it if missing) and category
//   (mapped to the category, creating it if missing);
// - combination-level fields per row: reference, EAN, price, wholesale price and
//   stock quantity (via the combination's stock_available).
//
// Empty CSV cells never overwrite existing store values.

import { logger } from '../../utils/logger';
import {
  CombinationSyncResult,
  PrestaShopCombinationInfo,
  ProductData,
  RowResolution,
  UploadChangesResult
} from '../../types';
import { PrestaShopClient } from '../prestashop-client/prestashop-client';
import { PRODUCT_LEVEL_FIELDS, normalizeValue } from '../consistency-validator/consistency-validator';

const PRODUCT_TEXT_FIELDS = ['name', 'description', 'description_short'] as const;

export class CombinationSync {
  private client: PrestaShopClient;
  private languageId: number;
  private manufacturerCache = new Map<string, string | null>();
  private categoryCache = new Map<string, string | null>();

  constructor(client: PrestaShopClient, languageId = 1) {
    this.client = client;
    this.languageId = languageId;
  }

  async upload(resolutions: RowResolution[], editedRows: ProductData[]): Promise<UploadChangesResult> {
    const rowsById = new Map(editedRows.map((row) => [row.id, row]));

    const summary: UploadChangesResult = {
      products_updated: 0,
      combinations_updated: 0,
      stock_updated: 0,
      manufacturers_created: 0,
      categories_created: 0,
      results: []
    };

    // Group the resolved rows by id_product.
    const groups = new Map<string, RowResolution[]>();
    for (const resolution of resolutions) {
      if (!resolution.id_product) continue;
      const list = groups.get(resolution.id_product) ?? [];
      list.push(resolution);
      groups.set(resolution.id_product, list);
    }

    for (const [id_product, group] of groups) {
      const effective = group.map((resolution) => rowsById.get(resolution.row_id) ?? resolution.row);
      await this.updateProduct(id_product, group, effective, summary);
      for (const resolution of group) {
        const row = rowsById.get(resolution.row_id) ?? resolution.row;
        await this.updateCombinationRow(resolution, row, summary);
      }
    }

    logger.info('Combination sync finished', {
      products: summary.products_updated,
      combinations: summary.combinations_updated,
      stock: summary.stock_updated,
      manufacturersCreated: summary.manufacturers_created,
      categoriesCreated: summary.categories_created
    });

    return summary;
  }

  // Product-level fields are updated once per product, only when the CSV has a
  // single filled value for the group (empty cells are ignored, and a field with
  // several still-inconsistent values is skipped instead of guessing).
  private async updateProduct(
    id_product: string,
    _group: RowResolution[],
    effective: ProductData[],
    summary: UploadChangesResult
  ): Promise<void> {
    const current = _group[0]?.product;
    if (!current) return;

    const values: Record<string, string> = {};
    for (const field of PRODUCT_LEVEL_FIELDS) {
      const filled = Array.from(
        new Set(effective.map((row) => normalizeValue(row[field as keyof ProductData])).filter((value) => value !== ''))
      );
      if (filled.length === 0) continue; // nothing filled in the CSV: keep the store value
      if (filled.length > 1) continue; // still inconsistent: skip rather than guess
      values[field] = filled[0];
    }

    const productUpdate: Record<string, any> = { id: id_product };

    for (const field of PRODUCT_TEXT_FIELDS) {
      const csvValue = values[field];
      if (csvValue === undefined) continue;
      if (normalizeValue(current[field as keyof typeof current]) === csvValue) continue;
      productUpdate[field] = this.localizedField(csvValue);
    }

    if (values.tax !== undefined && Number(values.tax) !== current.tax_rules_group_id) {
      productUpdate.tax_rules_group_id = Number(values.tax);
    }

    if (values.brand !== undefined) {
      const manufacturerId = await this.resolveManufacturer(values.brand, summary);
      if (manufacturerId && manufacturerId !== current.manufacturer_id) {
        productUpdate.manufacturer = { _attributes: { id: manufacturerId } };
      }
    }

    if (values.category !== undefined) {
      const categoryId = await this.resolveCategory(values.category, summary);
      if (categoryId) {
        // Merge with the categories already assigned to the product.
        const merged = new Set(current.categories ?? []);
        merged.add(categoryId);
        productUpdate.associations = {
          categories: {
            category: [...merged].map((id) => ({ _attributes: { id } }))
          }
        };
      }
    }

    const fields = Object.keys(productUpdate).filter((key) => key !== 'id');
    if (fields.length === 0) {
      summary.results.push({
        row_id: _group[0].row_id,
        operation: 'update_product',
        status: 'skipped',
        error: 'No product changes'
      });
      return;
    }

    const result = await this.client.updateProductFields(id_product, productUpdate as any);
    if (result.success) {
      summary.products_updated++;
    }
    summary.results.push({
      row_id: _group[0].row_id,
      operation: 'update_product',
      status: result.success ? 'completed' : 'failed',
      error: result.success ? undefined : result.errors.join(', ')
    });
  }

  // Combination-level fields are updated per row (reference, EAN, price,
  // wholesale price) and the stock quantity via the stock_available.
  private async updateCombinationRow(
    resolution: RowResolution,
    row: ProductData,
    summary: UploadChangesResult
  ): Promise<void> {
    const combination = resolution.combination;
    if (!combination) {
      summary.results.push({
        row_id: resolution.row_id,
        operation: 'update_combination',
        status: 'skipped',
        error: 'Combination not resolved'
      });
      return;
    }

    const combinationUpdate: Partial<PrestaShopCombinationInfo> = {
      id_product_attribute: combination.id_product_attribute
    };

    const reference = normalizeValue(row.reference);
    if (reference !== '' && reference !== normalizeValue(combination.reference)) {
      combinationUpdate.reference = reference;
    }

    const ean = normalizeValue(row.ean);
    if (ean !== '' && ean.replace(/[^0-9]/g, '') !== normalizeValue(combination.ean13)) {
      combinationUpdate.ean13 = ean;
    }

    if (typeof row.price === 'number' && row.price !== combination.price) {
      combinationUpdate.price = row.price;
    }

    if (typeof row.wholesale_price === 'number' && row.wholesale_price !== combination.wholesale_price) {
      combinationUpdate.wholesale_price = row.wholesale_price;
    }

    const hasChanges = Object.keys(combinationUpdate).some((key) => key !== 'id_product_attribute');
    if (hasChanges) {
      const result = await this.client.updateCombination(combination.id_product_attribute, combinationUpdate);
      if (result.success) {
        summary.combinations_updated++;
      }
      summary.results.push({
        row_id: resolution.row_id,
        operation: 'update_combination',
        status: result.success ? 'completed' : 'failed',
        error: result.success ? undefined : result.errors.join(', ')
      });
    } else {
      summary.results.push({
        row_id: resolution.row_id,
        operation: 'update_combination',
        status: 'skipped',
        error: 'No combination changes'
      });
    }

    if (typeof row.quantity === 'number' && combination.stock_available_id && row.quantity !== combination.quantity) {
      const stockResult = await this.client.updateStock({
        id: combination.stock_available_id,
        quantity: row.quantity
      });
      if (stockResult.success) {
        summary.stock_updated++;
      }
      summary.results.push({
        row_id: resolution.row_id,
        operation: 'update_stock',
        status: stockResult.success ? 'completed' : 'failed',
        error: stockResult.success ? undefined : stockResult.errors.join(', ')
      });
    }
  }

  private async resolveManufacturer(name: string, summary: UploadChangesResult): Promise<string | null> {
    const key = name.trim().toLowerCase();
    if (this.manufacturerCache.has(key)) {
      return this.manufacturerCache.get(key) ?? null;
    }

    let id = await this.client.resolveManufacturer(name);
    if (!id) {
      id = await this.client.createManufacturer(name.trim());
      if (id) {
        summary.manufacturers_created++;
      }
    }

    this.manufacturerCache.set(key, id);
    return id;
  }

  private async resolveCategory(name: string, summary: UploadChangesResult): Promise<string | null> {
    const key = name.trim().toLowerCase();
    if (this.categoryCache.has(key)) {
      return this.categoryCache.get(key) ?? null;
    }

    let id = await this.client.resolveCategoryByName(name);
    if (!id) {
      id = await this.client.createCategory(name.trim());
      if (id) {
        summary.categories_created++;
      }
    }

    this.categoryCache.set(key, id);
    return id;
  }

  private localizedField(value: string): Record<string, any> {
    return {
      language: {
        _attributes: { id: this.languageId.toString() },
        _cdata: value
      }
    };
  }
}
