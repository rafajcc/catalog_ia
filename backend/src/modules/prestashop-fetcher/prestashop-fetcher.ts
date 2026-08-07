// PrestaShop Fetcher Module
// Builds a working dataset (ProductData[]) directly from PrestaShop's
// Webservice as an alternative data source to uploading a CSV. Each fetched row
// is one combination (id_product_attribute):
// - EANs resolve to combinations through the combinations resource;
// - references resolve to products whose combinations are then fetched by id
//   (a product without combinations produces no row);
// - without EANs or references, the first products of the store are imported.
// Product-level values (name, descriptions, brand, category, tax) come from the
// parent product; price and stock come from the combination.

import {
  PrestaShopCombinationInfo,
  PrestaShopProductInfo,
  ProductData
} from '../../types';
import { PrestaShopClient } from '../prestashop-client/prestashop-client';

export type PrestaShopPresenceFilter = 'with' | 'without' | 'all';

export interface PrestaShopFetchOptions {
  eans?: string[];
  references?: string[];
  description?: PrestaShopPresenceFilter;
  images?: PrestaShopPresenceFilter;
  limit?: number;
}

export const PRESTASHOP_FETCH_LIMIT = 50;

// Product pool fetched when no EAN or reference is provided: it bounds the
// request while leaving headroom for the description/images filters to discard
// products before their combinations are resolved.
const PRESTASHOP_FETCH_POOL = 200;

// The Home root category id in a default PrestaShop install. It is assigned to
// every product, so it is never a meaningful "category" for the user.
const ROOT_CATEGORY_ID = '2';

export class PrestaShopFetcher {
  private client: PrestaShopClient;

  constructor(client: PrestaShopClient) {
    this.client = client;
  }

  async fetch(options: PrestaShopFetchOptions = {}): Promise<ProductData[]> {
    const eans = Array.from(
      new Set((options.eans ?? []).map((ean) => ean.replace(/[^0-9]/g, '')).filter(Boolean))
    );
    const references = Array.from(
      new Set((options.references ?? []).map((reference) => reference.trim()).filter(Boolean))
    );

    // 1. Gather every combination of interest.
    const combinations = new Map<string, PrestaShopCombinationInfo>();
    if (eans.length === 0 && references.length === 0) {
      const products = await this.client.fetchAllProducts(PRESTASHOP_FETCH_POOL);
      const matchingProducts = products.filter((product) => this.matches(product, options));
      const combinationIds = Array.from(
        new Set(matchingProducts.flatMap((product) => product.combination_ids ?? []))
      );
      for (const combination of await this.client.fetchCombinationsByIds(combinationIds)) {
        combinations.set(combination.id_product_attribute, combination);
      }
    } else {
      for (const combination of await this.client.fetchCombinationsByEan(eans)) {
        combinations.set(combination.id_product_attribute, combination);
      }
      if (references.length > 0) {
        const products = await this.client.fetchProductsByReference(references);
        const combinationIds = Array.from(new Set(products.flatMap((product) => product.combination_ids ?? [])));
        for (const combination of await this.client.fetchCombinationsByIds(combinationIds)) {
          combinations.set(combination.id_product_attribute, combination);
        }
      }
    }

    // 2. Product-level data for every parent product.
    const productIds = Array.from(
      new Set([...combinations.values()].map((combination) => combination.id_product).filter(Boolean))
    );
    const productsById = new Map(
      (await this.client.fetchProductsById(productIds)).map((product) => [product.id, product])
    );

    // 3. Names for the brand (manufacturer) and category ids.
    const manufacturerNames = new Map(
      (await this.client.fetchManufacturers()).map((entry) => [entry.id, entry.name])
    );
    const categoryNames = new Map((await this.client.fetchCategories()).map((entry) => [entry.id, entry.name]));

    // 4. Stock quantities for every combination's stock_available.
    const stockIds = Array.from(
      new Set(
        [...combinations.values()]
          .map((combination) => combination.stock_available_id)
          .filter((id): id is string => !!id)
      )
    );
    const stockById = new Map(
      (await this.client.fetchStockByIds(stockIds)).map((entry) => [entry.id, entry.quantity])
    );

    // 5. Build and filter the rows.
    const limit = Math.min(Math.max(1, options.limit || PRESTASHOP_FETCH_LIMIT), PRESTASHOP_FETCH_LIMIT);
    const rows: ProductData[] = [];
    for (const combination of combinations.values()) {
      const product = productsById.get(combination.id_product);
      if (!this.matches(product, options)) continue;
      rows.push(this.toProductData(combination, product, manufacturerNames, categoryNames, stockById));
      if (rows.length >= limit) break;
    }
    return rows;
  }

  private matches(product: PrestaShopProductInfo | undefined, options: PrestaShopFetchOptions): boolean {
    const description = product?.description?.trim() ?? '';
    if (options.description === 'with' && !description) return false;
    if (options.description === 'without' && description) return false;

    const imageCount = product?.image_count ?? 0;
    if (options.images === 'with' && imageCount <= 0) return false;
    if (options.images === 'without' && imageCount > 0) return false;

    return true;
  }

  private toProductData(
    combination: PrestaShopCombinationInfo,
    product: PrestaShopProductInfo | undefined,
    manufacturerNames: Map<string, string | undefined>,
    categoryNames: Map<string, string | undefined>,
    stockById: Map<string, number | undefined>
  ): ProductData {
    const quantity = combination.stock_available_id
      ? stockById.get(combination.stock_available_id)
      : undefined;

    return {
      id: `ps_${combination.id_product_attribute}`,
      status: 'pending',
      source_file: 'prestashop',
      validation_errors: [],
      warnings: [],
      name: product?.name ?? '',
      reference: combination.reference ?? product?.reference,
      ean: combination.ean13 ?? product?.ean13,
      description: product?.description,
      description_short: product?.description_short,
      price: combination.price ?? product?.price,
      wholesale_price: combination.wholesale_price ?? product?.wholesale_price,
      quantity,
      brand: product?.manufacturer_id ? manufacturerNames.get(product.manufacturer_id) : undefined,
      category: this.pickCategory(product, categoryNames),
      tax:
        product?.tax_rules_group_id !== undefined && product.tax_rules_group_id !== null
          ? String(product.tax_rules_group_id)
          : undefined,
      is_new: false,
      is_updated: false
    };
  }

  private pickCategory(
    product: PrestaShopProductInfo | undefined,
    categoryNames: Map<string, string | undefined>
  ): string | undefined {
    for (const id of product?.categories ?? []) {
      if (id === ROOT_CATEGORY_ID) continue;
      const name = categoryNames.get(id);
      if (name) return name;
    }
    return undefined;
  }
}
