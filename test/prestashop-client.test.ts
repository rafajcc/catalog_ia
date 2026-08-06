import axios from 'axios';
import { PrestaShopClient } from '../backend/src/modules/prestashop-client/prestashop-client';
import { logger } from '../backend/src/utils/logger';
import type { PrestaShopConfig, ProductData } from '../backend/src/types';

jest.mock('axios', () => ({
  __esModule: true,
  default: { create: jest.fn() }
}));

const mockAxiosCreate = axios.create as jest.Mock;

const baseConfig: PrestaShopConfig = {
  base_url: 'https://shop.example.com',
  api_key: 'SECRET-KEY',
  version: '1.7',
  language_id: 1
};

interface FakeClient {
  get: jest.Mock;
  put: jest.Mock;
  patch: jest.Mock;
  post: jest.Mock;
  requestInterceptor?: (config: any) => any;
  requestErrorHandler?: (error: any) => Promise<any>;
  responseInterceptor?: (response: any) => any;
  responseErrorHandler?: (error: any) => Promise<any>;
}

function makeFakeClient(): FakeClient {
  const fake: FakeClient = {
    get: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    post: jest.fn()
  };
  (fake as any).interceptors = {
    request: {
      use: jest.fn((ok: any, err?: any) => {
        fake.requestInterceptor = ok;
        fake.requestErrorHandler = err;
      })
    },
    response: {
      use: jest.fn((ok: any, err?: any) => {
        fake.responseInterceptor = ok;
        fake.responseErrorHandler = err;
      })
    }
  };
  return fake;
}

function makeClient(fake: FakeClient, config: PrestaShopConfig = baseConfig): PrestaShopClient {
  mockAxiosCreate.mockReturnValue(fake as never);
  return new PrestaShopClient(config);
}

const productFoundXml = `<prestashop>
  <products>
    <product id="9">
      <reference><![CDATA[REF-1]]></reference>
    </product>
  </products>
</prestashop>`;

const createdProductXml = `<prestashop>
  <product id="123">
    <reference><![CDATA[REF-1]]></reference>
  </product>
</prestashop>`;

describe('PrestaShopClient', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates an axios instance with the base URL and default timeout', () => {
      const fake = makeFakeClient();

      makeClient(fake);

      expect(mockAxiosCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://shop.example.com',
          timeout: 30000,
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/xml'
          })
        })
      );
    });

    it('honors a custom timeout', () => {
      const fake = makeFakeClient();

      makeClient(fake, { ...baseConfig, timeout: 5000 });

      expect(mockAxiosCreate).toHaveBeenCalledWith(expect.objectContaining({ timeout: 5000 }));
    });

    it('strips a trailing "/api" from the base URL', () => {
      const fake = makeFakeClient();

      makeClient(fake, { ...baseConfig, base_url: 'https://shop.example.com/api/' });

      expect(mockAxiosCreate).toHaveBeenCalledWith(expect.objectContaining({ baseURL: 'https://shop.example.com' }));
    });
  });

  describe('request interceptor', () => {
    it('adds the Basic auth header with the API key as the username', () => {
      const fake = makeFakeClient();
      makeClient(fake);

      const config = { headers: {} };
      const result = fake.requestInterceptor!(config);

      const expected = Buffer.from('SECRET-KEY:').toString('base64');
      expect(result.headers.Authorization).toBe(`Basic ${expected}`);
    });

    it('rejects request errors', async () => {
      const fake = makeFakeClient();
      makeClient(fake);

      const error = new Error('boom');
      await expect(fake.requestErrorHandler!(error)).rejects.toBe(error);
    });
  });

  describe('response interceptor', () => {
    it('passes successful responses through', () => {
      const fake = makeFakeClient();
      makeClient(fake);

      const response = { data: '<prestashop/>' };
      expect(fake.responseInterceptor!(response)).toEqual(response);
    });

    it('throws a clear error on 401 responses', async () => {
      const fake = makeFakeClient();
      makeClient(fake);

      const error = { response: { status: 401 }, message: 'Unauthorized', config: { url: '/api/products' } };
      await expect(fake.responseErrorHandler!(error)).rejects.toThrow(
        'Invalid PrestaShop API key or insufficient permissions'
      );
    });

    it('warns and rethrows on 404 responses', async () => {
      const fake = makeFakeClient();
      makeClient(fake);

      const error = { response: { status: 404 }, message: 'Not Found', config: { url: '/api/products', method: 'get' } };
      await expect(fake.responseErrorHandler!(error)).rejects.toBe(error);
      expect(logger.warn).toHaveBeenCalledWith('PrestaShop resource not found', {
        url: '/api/products',
        method: 'get'
      });
    });

    it('logs and rethrows on 5xx responses', async () => {
      const fake = makeFakeClient();
      makeClient(fake);

      const error = { response: { status: 500 }, message: 'Internal', config: { url: '/api/products', method: 'post' } };
      await expect(fake.responseErrorHandler!(error)).rejects.toBe(error);
      expect(logger.error).toHaveBeenCalledWith('PrestaShop server error', {
        status: 500,
        url: '/api/products',
        error: 'Internal'
      });
    });

    it('rethrows network errors without response data unchanged', async () => {
      const fake = makeFakeClient();
      makeClient(fake);

      const error = new Error('ECONNRESET');
      await expect(fake.responseErrorHandler!(error)).rejects.toBe(error);
    });
  });

  describe('resolveProduct', () => {
    it('returns the first matching product from the response', async () => {
      const fake = makeFakeClient();
      fake.get.mockResolvedValue({ data: productFoundXml });
      const client = makeClient(fake);

      const result = await client.resolveProduct({ reference: 'REF-1' });

      expect(fake.get).toHaveBeenCalledWith('/api/products', { params: { reference: 'REF-1' } });
      expect(result).not.toBeNull();
      expect(result!.id).toBe('9');
      expect(result!.reference).toBe('REF-1');
    });

    it('returns null when no products match', async () => {
      const fake = makeFakeClient();
      fake.get.mockResolvedValue({ data: '<prestashop><products/></prestashop>' });
      const client = makeClient(fake);

      const result = await client.resolveProduct({ reference: 'missing' });

      expect(result).toBeNull();
    });

    it('returns the first product when multiple match', async () => {
      const fake = makeFakeClient();
      fake.get.mockResolvedValue({
        data: '<prestashop><products><product id="1"/><product id="2"/></products></prestashop>'
      });
      const client = makeClient(fake);

      const result = await client.resolveProduct({});

      expect(fake.get).toHaveBeenCalledWith('/api/products', { params: {} });
      expect(result!.id).toBe('1');
    });

    it('maps all provided filters to query params', async () => {
      const fake = makeFakeClient();
      fake.get.mockResolvedValue({ data: '<prestashop><products/></prestashop>' });
      const client = makeClient(fake);

      await client.resolveProduct({ id: '3', reference: 'R', ean13: 'E', active: true });

      expect(fake.get).toHaveBeenCalledWith('/api/products', {
        params: { id: '3', reference: 'R', ean13: 'E', active: true }
      });
    });

    it('throws a wrapped error when the request fails', async () => {
      const fake = makeFakeClient();
      fake.get.mockRejectedValue(new Error('ECONNREFUSED'));
      const client = makeClient(fake);

      await expect(client.resolveProduct({ reference: 'R' })).rejects.toThrow(
        'Product resolution failed: ECONNREFUSED'
      );
    });

    it('throws a wrapped error when the response is not valid XML', async () => {
      const fake = makeFakeClient();
      fake.get.mockResolvedValue({ data: 'not xml at all' });
      const client = makeClient(fake);

      await expect(client.resolveProduct({})).rejects.toThrow(
        'Product resolution failed: Invalid XML response from PrestaShop'
      );
    });
  });

  describe('resolveStockAvailable', () => {
    it('resolves stock by product id', async () => {
      const fake = makeFakeClient();
      fake.get.mockResolvedValue({
        data: '<prestashop><stock_availables><stock_available id="50"><quantity>0</quantity></stock_available></stock_availables></prestashop>'
      });
      const client = makeClient(fake);

      const result = await client.resolveStockAvailable('7');

      expect(fake.get).toHaveBeenCalledWith('/api/stock_availables', { params: { id_product: 7 } });
      expect(result).not.toBeNull();
      expect(result!.id).toBe('50');
      expect(result!.quantity).toBe(0);
    });

    it('resolves stock by reference', async () => {
      const fake = makeFakeClient();
      fake.get.mockResolvedValue({ data: '<prestashop><stock_availables/></prestashop>' });
      const client = makeClient(fake);

      const result = await client.resolveStockAvailable('7', 'REF-1');

      expect(fake.get).toHaveBeenCalledWith('/api/stock_availables', { params: { id_product: 0, reference: 'REF-1' } });
      expect(result).toBeNull();
    });

    it('returns null instead of throwing when the lookup fails', async () => {
      const fake = makeFakeClient();
      fake.get.mockRejectedValue(new Error('ECONNRESET'));
      const client = makeClient(fake);

      const result = await client.resolveStockAvailable('7');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Failed to resolve stock available', expect.anything());
    });
  });

  describe('updateStock', () => {
    it('returns success after updating stock', async () => {
      const fake = makeFakeClient();
      fake.put.mockResolvedValue({ data: '' });
      const client = makeClient(fake);

      const result = await client.updateStock({ id: '5', id_product: '7', quantity: 3 });

      expect(fake.put).toHaveBeenCalledTimes(1);
      expect(fake.put.mock.calls[0][0]).toBe('/api/stock_availables/5');
      expect(fake.put.mock.calls[0][1]).toContain('<quantity>3</quantity>');
      expect(result).toMatchObject({ success: true, operation: 'update_stock', stock_updated: true, errors: [] });
    });

    it('returns a failure result when the request errors', async () => {
      const fake = makeFakeClient();
      fake.put.mockRejectedValue(new Error('timeout'));
      const client = makeClient(fake);

      const result = await client.updateStock({ id: '5', quantity: 3 });

      expect(result.success).toBe(false);
      expect(result.stock_updated).toBe(false);
      expect(result.errors).toEqual(['timeout']);
    });
  });

  describe('updateProduct', () => {
    it('returns success after updating the product', async () => {
      const fake = makeFakeClient();
      fake.patch.mockResolvedValue({ data: '<prestashop><product id="9"/></prestashop>' });
      const client = makeClient(fake);

      const result = await client.updateProduct({ id: '9', reference: 'REF' });

      expect(fake.patch).toHaveBeenCalledWith('/api/products/9', expect.any(String));
      expect(result).toMatchObject({ success: true, product_id: '9', operation: 'update_product', errors: [] });
    });

    it('returns a failure result when the request errors', async () => {
      const fake = makeFakeClient();
      fake.patch.mockRejectedValue(new Error('403'));
      const client = makeClient(fake);

      const result = await client.updateProduct({ id: '9' });

      expect(result.success).toBe(false);
      expect(result.product_id).toBe('9');
      expect(result.errors).toEqual(['403']);
    });
  });

  describe('createProduct', () => {
    it('extracts the created product id from the response', async () => {
      const fake = makeFakeClient();
      fake.post.mockResolvedValue({ data: createdProductXml });
      const client = makeClient(fake);

      const result = await client.createProduct({ reference: 'REF-1', name: { '1': 'Test' } });

      expect(fake.post).toHaveBeenCalledWith('/api/products', expect.any(String));
      expect(result).toMatchObject({ success: true, product_id: '123', operation: 'create_product', errors: [] });
    });

    it('returns a failure result when the request errors', async () => {
      const fake = makeFakeClient();
      fake.post.mockRejectedValue(new Error('conflict'));
      const client = makeClient(fake);

      const result = await client.createProduct({ reference: 'REF-1' });

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(['conflict']);
    });
  });

  describe('uploadProductImage', () => {
    it('uploads the image as multipart form data', async () => {
      jest.spyOn(require('fs'), 'readFileSync').mockReturnValue(Buffer.from('fake-jpeg-bytes') as never);
      const fake = makeFakeClient();
      fake.post.mockResolvedValue({ data: '' });
      const client = makeClient(fake);

      const result = await client.uploadProductImage({ id_product: '42', file: '/tmp/photo.jpg', position: 2 });

      expect(fake.post).toHaveBeenCalledTimes(1);
      expect(fake.post.mock.calls[0][0]).toBe('/api/images/products/42');
      expect(fake.post.mock.calls[0][2]).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
      expect(result).toMatchObject({ success: true, images_uploaded: 1 });
    });

    it('returns a failure result when the upload errors', async () => {
      jest.spyOn(require('fs'), 'readFileSync').mockReturnValue(Buffer.from('fake-jpeg-bytes') as never);
      const fake = makeFakeClient();
      fake.post.mockRejectedValue(new Error('413'));
      const client = makeClient(fake);

      const result = await client.uploadProductImage({ id_product: '42', file: '/tmp/photo.jpg' });

      expect(result.success).toBe(false);
      expect(result.images_uploaded).toBe(0);
      expect(result.errors).toEqual(['413']);
    });
  });

  describe('syncSingleProduct', () => {
    const product: ProductData = {
      id: 'row-1',
      status: 'valid',
      source_file: 'file.csv',
      validation_errors: [],
      warnings: [],
      name: 'Great Product!',
      reference: 'REF-1',
      ean: '4006381333931',
      price: 19.99,
      wholesale_price: 10,
      tax: '21',
      selected_images: []
    };

    it('creates the product when it does not exist yet', async () => {
      const fake = makeFakeClient();
      fake.get.mockResolvedValueOnce({ data: '<prestashop><products/></prestashop>' });
      fake.post.mockResolvedValueOnce({ data: createdProductXml });
      const client = makeClient(fake);

      const result = await client.syncSingleProduct(product);

      expect(fake.patch).not.toHaveBeenCalled();
      expect(fake.post.mock.calls[0][1]).toContain('<link_rewrite>great-product</link_rewrite>');
      expect(fake.post.mock.calls[0][1]).toContain('<tax_rules_group_id>21</tax_rules_group_id>');
      expect(result).toMatchObject({ success: true, product_id: '123' });
    });

    it('updates the product when it already exists', async () => {
      const fake = makeFakeClient();
      fake.get.mockResolvedValueOnce({ data: productFoundXml });
      fake.patch.mockResolvedValueOnce({ data: '<prestashop><product id="9"/></prestashop>' });
      const client = makeClient(fake);

      const result = await client.syncSingleProduct(product);

      expect(fake.post).not.toHaveBeenCalled();
      expect(fake.patch).toHaveBeenCalledWith('/api/products/9', expect.any(String));
      expect(fake.patch.mock.calls[0][1]).toContain('<reference>REF-1</reference>');
      expect(fake.patch.mock.calls[0][1]).toContain('<tax_rules_group_id>21</tax_rules_group_id>');
      expect(result).toMatchObject({ success: true, product_id: '9' });
    });

    it('does not overwrite price or stock when the CSV cells are empty', async () => {
      const fake = makeFakeClient();
      fake.get.mockResolvedValueOnce({ data: productFoundXml });
      fake.patch.mockResolvedValueOnce({ data: '<prestashop><product id="9"/></prestashop>' });
      const client = makeClient(fake);

      const result = await client.syncSingleProduct({
        ...product,
        price: undefined,
        wholesale_price: undefined,
        quantity: undefined
      });

      const xml = fake.patch.mock.calls[0][1] as string;
      expect(xml).not.toContain('<price>');
      expect(xml).not.toContain('<wholesale_price>');
      expect(xml).not.toContain('<quantity>');
      expect(fake.put).not.toHaveBeenCalled();
      expect(result).toMatchObject({ success: true, product_id: '9' });
    });

    it('updates stock when the product has a quantity', async () => {
      const fake = makeFakeClient();
      fake.get
        .mockResolvedValueOnce({ data: productFoundXml })
        .mockResolvedValueOnce({
          data: '<prestashop><stock_availables><stock_available id="50"><quantity>0</quantity></stock_available></stock_availables></prestashop>'
        });
      fake.patch.mockResolvedValueOnce({ data: '<prestashop><product id="9"/></prestashop>' });
      fake.put.mockResolvedValueOnce({ data: '' });
      const client = makeClient(fake);

      const result = await client.syncSingleProduct({ ...product, quantity: 5 });

      expect(fake.put).toHaveBeenCalledWith('/api/stock_availables/50', expect.any(String));
      expect(result.stock_updated).toBe(true);
    });

    it('uploads selected images up to a maximum of 5', async () => {
      const readFileSpy = jest.spyOn(require('fs'), 'readFileSync').mockReturnValue(Buffer.from('fake-jpeg-bytes') as never);
      const fake = makeFakeClient();
      fake.get.mockResolvedValueOnce({ data: productFoundXml });
      fake.patch.mockResolvedValueOnce({ data: '<prestashop><product id="9"/></prestashop>' });
      fake.post.mockResolvedValue({ data: '<prestashop/>' });
      const client = makeClient(fake);

      const images = Array.from({ length: 6 }, (_, i) => ({
        filename: `image_${i}.jpg`,
        path: `/tmp/img/image_${i}.jpg`,
        format: 'jpg'
      }));
      const result = await client.syncSingleProduct({ ...product, selected_images: images as any });

      expect(fake.post).toHaveBeenCalledTimes(5);
      expect(result.images_uploaded).toBe(5);
      expect(readFileSpy).toHaveBeenCalledWith('/tmp/img/image_0.jpg');
      expect(readFileSpy).toHaveBeenCalledWith('/tmp/img/image_4.jpg');
    });

    it('returns a failure result when product resolution fails', async () => {
      const fake = makeFakeClient();
      fake.get.mockRejectedValueOnce(new Error('ECONNRESET'));
      const client = makeClient(fake);

      const result = await client.syncSingleProduct(product);

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(['Product resolution failed: ECONNRESET']);
    });
  });

  describe('testConnection', () => {
    it('returns true when the API responds with 200', async () => {
      const fake = makeFakeClient();
      fake.get.mockResolvedValue({ status: 200 });
      const client = makeClient(fake);

      const result = await client.testConnection();

      expect(fake.get).toHaveBeenCalledWith('/api');
      expect(result).toBe(true);
    });

    it('returns false when the API is unreachable', async () => {
      const fake = makeFakeClient();
      fake.get.mockRejectedValue(new Error('ECONNREFUSED'));
      const client = makeClient(fake);

      const result = await client.testConnection();

      expect(result).toBe(false);
    });
  });
});
