import request from 'supertest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import createApp from '../backend/src/app';
import { PrestaShopClient } from '../backend/src/modules/prestashop-client/prestashop-client';

const CSV_HEADER =
  'ean,reference,name,price,wholesale_price,quantity,brand,category,tax,description_short,description,image_hints';
const CSV_CONTENT = [
  CSV_HEADER,
  '8412345678901,REF-A,Producto A,19.99,15.00,10,Marca A,Categoria A,1,Desc corta A,"Descripcion larga A",EAN-1',
  '8412345678902,REF-B,Producto B,9.50,7.00,5,Marca B,Categoria B,1,Desc corta B,"Descripcion larga B",EAN-2',
  'bad-ean,REF-C,Producto C,3.00,2.00,1,Marca C,Categoria C,1,Desc corta C,"Descripcion larga C",EAN-3'
].join('\n');

function csvBuffer(): Buffer {
  return Buffer.from(CSV_CONTENT, 'utf8');
}

describe('API routes', () => {
  let uploadsDir: string;

  beforeAll(async () => {
    uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'catalogia-test-'));
  });

  afterAll(async () => {
    await fs.remove(uploadsDir);
  });

  function makeApp(options: { fakePrestashop?: boolean; configFile?: string } = {}) {
    const opts: any = { uploadsDir };
    if (options.fakePrestashop) {
      const fakeClient = { testConnection: () => Promise.resolve(true) } as unknown as PrestaShopClient;
      opts.prestashopClientFactory = () => fakeClient;
    }
    if (options.configFile) {
      opts.configFile = options.configFile;
    }
    return createApp(opts);
  }

  async function uploadAndParse(app: ReturnType<typeof createApp>): Promise<string> {
    const upload = await request(app)
      .post('/api/upload/csv')
      .attach('file', csvBuffer(), { filename: 'products.csv', contentType: 'text/csv' });

    expect(upload.status).toBe(200);
    expect(upload.body.file_id).toBeDefined();

    const parsed = await request(app).post('/api/process/csv').send({ fileId: upload.body.file_id });
    expect(parsed.status).toBe(200);
    expect(parsed.body.data.data_id).toBeDefined();
    return parsed.body.data.data_id as string;
  }

  it('exposes the default configuration', async () => {
    const res = await request(makeApp()).get('/api/config');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.prestashop).toBeDefined();
    expect(res.body.ai).toBeDefined();
    expect(res.body.validation).toBeDefined();
    expect(res.body.image_matcher).toBeDefined();
  });

  it('merges partial configuration updates', async () => {
    const app = makeApp();

    const update = await request(app)
      .put('/api/config')
      .send({ prestashop: { base_url: 'https://shop.example.com', api_key: 'secret' } });

    expect(update.status).toBe(200);
    expect(update.body.success).toBe(true);

    const res = await request(app).get('/api/config');
    expect(res.body.prestashop.base_url).toBe('https://shop.example.com');
    expect(res.body.prestashop.api_key).toBe('secret');
    expect(res.body.prestashop.version).toBe('1.7');
  });

  it('tests the AI connection with the mock provider', async () => {
    const res = await request(makeApp()).post('/api/config/test/ai').send({
      provider: 'mock',
      enabled_fields: ['name', 'description']
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects the PrestaShop connection test without credentials', async () => {
    const res = await request(makeApp())
      .post('/api/config/test/prestashop')
      .send({ base_url: '', api_key: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('tests the PrestaShop connection with an injected client', async () => {
    const res = await request(makeApp({ fakePrestashop: true }))
      .post('/api/config/test/prestashop')
      .send({ base_url: 'https://shop.example.com', api_key: 'secret' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('uploads and parses a CSV file into a data id', async () => {
    const app = makeApp();
    const upload = await request(app)
      .post('/api/upload/csv')
      .attach('file', csvBuffer(), { filename: 'products.csv', contentType: 'text/csv' });

    const parsed = await request(app).post('/api/process/csv').send({ fileId: upload.body.file_id });
    expect(parsed.status).toBe(200);
    // The parsed dataset is keyed by its file id, which doubles as the data id.
    expect(parsed.body.data.data_id).toBe(upload.body.file_id);
  });

  it('rejects CSV processing for an unknown file id', async () => {
    const res = await request(makeApp()).post('/api/process/csv').send({ fileId: 'missing' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('rejects uploads that are not CSV files', async () => {
    const res = await request(makeApp())
      .post('/api/upload/csv')
      .attach('file', Buffer.from('not a csv'), { filename: 'products.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/only \.csv files/i);
  });

  it('rejects uploads with binary content even with a .csv name', async () => {
    const binary = Buffer.concat([Buffer.from([0xff, 0xfe, 0x00]), Buffer.alloc(64, 0)]);
    const res = await request(makeApp())
      .post('/api/upload/csv')
      .attach('file', binary, { filename: 'products.csv', contentType: 'text/csv' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/binary content/i);
  });

  it('rejects a CSV file that has already been uploaded', async () => {
    const app = makeApp();
    const first = await request(app)
      .post('/api/upload/csv')
      .attach('file', csvBuffer(), { filename: 'products.csv', contentType: 'text/csv' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/upload/csv')
      .attach('file', csvBuffer(), { filename: 'products.csv', contentType: 'text/csv' });

    expect(second.status).toBe(400);
    expect(second.body.success).toBe(false);
    expect(second.body.error.message).toMatch(/has already been uploaded/i);
  });

  it('rejects image files that have already been uploaded', async () => {
    const app = makeApp();
    const first = await request(app)
      .post('/api/upload/images')
      .attach('files', Buffer.from('fake-image'), { filename: 'product.jpg', contentType: 'image/jpeg' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/upload/images')
      .attach('files', Buffer.from('fake-image'), { filename: 'product.jpg', contentType: 'image/jpeg' });

    expect(second.status).toBe(400);
    expect(second.body.success).toBe(false);
    expect(second.body.error.message).toMatch(/has already been uploaded/i);
  });

  it('lists, deletes and allows re-uploading files', async () => {
    const app = makeApp();

    const csv = await request(app)
      .post('/api/upload/csv')
      .attach('file', csvBuffer(), { filename: 'products.csv', contentType: 'text/csv' });
    expect(csv.status).toBe(200);

    const img = await request(app)
      .post('/api/upload/images')
      .attach('files', Buffer.from('fake-image'), { filename: 'p.jpg', contentType: 'image/jpeg' });
    expect(img.status).toBe(200);

    const listed = await request(app).get('/api/uploads');
    expect(listed.status).toBe(200);
    expect(listed.body.success).toBe(true);
    expect(listed.body.data.csvs).toEqual([{ id: csv.body.file_id, name: 'products.csv' }]);
    expect(listed.body.data.images).toEqual([{ id: 'p.jpg', name: 'p.jpg' }]);

    const delCsv = await request(app).delete(`/api/upload/csv/${csv.body.file_id}`);
    expect(delCsv.status).toBe(200);

    const delImg = await request(app).delete('/api/upload/images/p.jpg');
    expect(delImg.status).toBe(200);

    const after = await request(app).get('/api/uploads');
    expect(after.body.data.csvs).toEqual([]);
    expect(after.body.data.images).toEqual([]);

    const reupload = await request(app)
      .post('/api/upload/images')
      .attach('files', Buffer.from('fake-image'), { filename: 'p.jpg', contentType: 'image/jpeg' });
    expect(reupload.status).toBe(200);
  });

  it('rejects deleting a file that is not on the server', async () => {
    const app = makeApp();
    const res = await request(app).delete('/api/upload/images/missing.jpg');
    expect(res.status).toBe(404);
  });

  it('deletes all uploaded files at once', async () => {
    const app = makeApp();

    await request(app)
      .post('/api/upload/csv')
      .attach('file', csvBuffer(), { filename: 'a.csv', contentType: 'text/csv' });
    await request(app)
      .post('/api/upload/images')
      .attach('files', Buffer.from('f'), { filename: 'a.jpg', contentType: 'image/jpeg' });
    await request(app)
      .post('/api/upload/images')
      .attach('files', Buffer.from('f'), { filename: 'b.jpg', contentType: 'image/jpeg' });

    const delAllCsv = await request(app).delete('/api/uploads/csv');
    expect(delAllCsv.status).toBe(200);

    const delAllImg = await request(app).delete('/api/uploads/images');
    expect(delAllImg.status).toBe(200);

    const after = await request(app).get('/api/uploads');
    expect(after.body.data.csvs).toEqual([]);
    expect(after.body.data.images).toEqual([]);
  });

  it('rejects CSV uploads with the wrong number of columns', async () => {
    const app = makeApp();
    const upload = await request(app)
      .post('/api/upload/csv')
      .attach('file', Buffer.from('foo,bar\n1,2\n3,4'), { filename: 'rubbish.csv', contentType: 'text/csv' });
    expect(upload.status).toBe(400);
    expect(upload.body.success).toBe(false);
    expect(upload.body.error.message).toMatch(/2 column\(s\) but 12 are expected/i);
    expect(upload.body.error.code).toBe('CSV_COLUMN_COUNT_MISMATCH');
    expect(upload.body.error.details).toEqual({ name: 'rubbish.csv', columns: 2, expected: 12 });
  });

  it('rejects CSV uploads with the right column count but wrong headers', async () => {
    const wrongHeaders = Array.from({ length: 12 }, (_, i) => `col${i + 1}`).join(',');
    const res = await request(makeApp())
      .post('/api/upload/csv')
      .attach('file', Buffer.from(`${wrongHeaders}\n1,2,3,4,5,6,7,8,9,10,11,12`), {
        filename: 'wrongheaders.csv',
        contentType: 'text/csv'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/does not follow the expected format/i);
    expect(res.body.error.message).toContain('ean');
    expect(res.body.error.code).toBe('CSV_MISSING_COLUMNS');
    expect(res.body.error.details.missing).toContain('ean');
  });

  it('serves the CSV template with headers and an empty data row', async () => {
    const res = await request(makeApp()).get('/api/template/csv');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);

    const lines = res.text.split('\n').filter((line) => line.trim());
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines[1].split(',').length).toBe(CSV_HEADER.split(',').length);
    expect(lines[1].split(',').every((cell) => cell === '')).toBe(true);
  });

  it('rejects CSV processing when the file contains no data rows', async () => {
    const app = makeApp();
    const upload = await request(app)
      .post('/api/upload/csv')
      .attach('file', Buffer.from(CSV_HEADER), {
        filename: 'noproducts.csv',
        contentType: 'text/csv'
      });
    expect(upload.status).toBe(200);

    const res = await request(app).post('/api/process/csv').send({ fileId: upload.body.file_id });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/contains no data rows/i);
  });

  it('defers price and quantity validation to the validation screen', async () => {
    const app = makeApp();
    const upload = await request(app)
      .post('/api/upload/csv')
      .attach('file', Buffer.from(`${CSV_HEADER}\n8412345678901,REF-A,Producto A,19.999,15.00,10,Marca A,Categoria A,1,Desc corta A,"Desc larga A",EAN-1\n8412345678902,REF-B,Producto B,9.50,7.00,2.5,Marca B,Categoria B,1,Desc corta B,"Desc larga B",EAN-2\n8412345678903,REF-C,Producto C,3.00,2.00,1,Marca C,Categoria C,1,Desc corta C,"Desc larga C",EAN-3`), {
        filename: 'badrows.csv',
        contentType: 'text/csv'
      });
    expect(upload.status).toBe(200);

    const res = await request(app).post('/api/process/csv').send({ fileId: upload.body.file_id });
    expect(res.status).toBe(200);
    // Every row becomes a product; bad values are kept raw for the validation screen.
    expect(res.body.data.products).toHaveLength(3);
    expect(res.body.data.summary.total).toBe(3);

    const dataId = res.body.data.data_id;
    const validated = await request(app).post(`/api/validate/products/${dataId}`);
    expect(validated.status).toBe(200);
    const products = validated.body.data.products;
    const withErrors = products.filter((p: any) => (p.validation_errors ?? []).length > 0);
    expect(withErrors.length).toBe(2);
    expect(products[0].validation_errors.some((e: any) => e.field === 'price')).toBe(true);
    expect(products[1].validation_errors.some((e: any) => e.field === 'quantity')).toBe(true);
  });

  it('flags duplicate EANs and references across all uploaded CSVs during validation', async () => {
    const app = makeApp();

    const first = Buffer.from(
      `${CSV_HEADER}\n8412345678901,REF-A,Producto A,19.99,15.00,10,Marca A,Categoria A,1,Desc corta A,"Desc larga A",EAN-1\n8412345678902,REF-B,Producto B,9.50,7.00,5,Marca B,Categoria B,1,Desc corta B,"Desc larga B",EAN-2`,
      'utf8'
    );
    const second = Buffer.from(
      `${CSV_HEADER}\n8412345678901,REF-C,Producto C,3.00,2.00,1,Marca C,Categoria C,1,Desc corta C,"Desc larga C",EAN-3\n8412345678903,REF-A,Producto D,5.00,4.00,2,Marca D,Categoria D,1,Desc corta D,"Desc larga D",EAN-4`,
      'utf8'
    );

    const uploadA = await request(app)
      .post('/api/upload/csv')
      .attach('file', first, { filename: 'a.csv', contentType: 'text/csv' });
    const uploadB = await request(app)
      .post('/api/upload/csv')
      .attach('file', second, { filename: 'b.csv', contentType: 'text/csv' });
    expect(uploadA.status).toBe(200);
    expect(uploadB.status).toBe(200);

    const parsedA = await request(app).post('/api/process/csv').send({ fileId: uploadA.body.file_id });
    const parsedB = await request(app).post('/api/process/csv').send({ fileId: uploadB.body.file_id });
    expect(parsedA.status).toBe(200);
    expect(parsedB.status).toBe(200);

    const dataId = parsedB.body.data.data_id;
    const validated = await request(app).post(`/api/validate/products/${dataId}`);
    expect(validated.status).toBe(200);
    expect(validated.body.data.products).toHaveLength(4);

    // Producto A (EAN repeated in the second file), Producto C (same EAN) and
    // Producto D (same reference) must all be flagged; Producto B stays clean.
    const duplicates = validated.body.data.products.filter((p: any) =>
      (p.validation_errors ?? []).some((e: any) => e.code === 'DUPLICATE_VALUE')
    );
    expect(duplicates.length).toBe(3);
    const flaggedReferences = duplicates.map((p: any) => p.reference).sort();
    expect(flaggedReferences).toEqual(['REF-A', 'REF-A', 'REF-C']);
  });

  it('validates products and stores the results', async () => {
    const app = makeApp();
    const dataId = await uploadAndParse(app);

    const validated = await request(app).post(`/api/validate/products/${dataId}`);
    expect(validated.status).toBe(200);
    expect(Array.isArray(validated.body.data.products)).toBe(true);
    expect(validated.body.data.products.length).toBe(3);

    const results = await request(app).get(`/api/validate/results/${dataId}`);
    expect(results.status).toBe(200);
    expect(results.body.data.products.length).toBe(3);
  });

  it('returns 404 when validating unknown data', async () => {
    const res = await request(makeApp()).post('/api/validate/products/unknown');
    expect(res.status).toBe(404);
  });

  it('persists the configuration across app instances with encrypted secrets', async () => {
    const configFile = path.join(uploadsDir, 'config.json');
    const first = makeApp({ configFile });

    const saved = await request(first)
      .put('/api/config')
      .send({ prestashop: { base_url: 'https://shop.example.com', api_key: 'persisted-secret', version: '8' } });
    expect(saved.status).toBe(200);
    expect(saved.body.prestashop.base_url).toBe('https://shop.example.com');

    const raw = fs.readFileSync(configFile, 'utf8');
    expect(raw).not.toContain('persisted-secret');

    const second = makeApp({ configFile });
    const loaded = await request(second).get('/api/config');
    expect(loaded.status).toBe(200);
    expect(loaded.body.prestashop.base_url).toBe('https://shop.example.com');
    expect(loaded.body.prestashop.api_key).toBe('persisted-secret');
    expect(loaded.body.prestashop.version).toBe('8');
  });

  it('merges products from multiple uploaded CSVs into a single dataset', async () => {
    const app = makeApp();

    const uploadA = await request(app)
      .post('/api/upload/csv')
      .attach('file', csvBuffer(), { filename: 'a.csv', contentType: 'text/csv' });
    const uploadB = await request(app)
      .post('/api/upload/csv')
      .attach('file', csvBuffer(), { filename: 'b.csv', contentType: 'text/csv' });
    expect(uploadA.status).toBe(200);
    expect(uploadB.status).toBe(200);

    const parsedA = await request(app).post('/api/process/csv').send({ fileId: uploadA.body.file_id });
    const parsedB = await request(app).post('/api/process/csv').send({ fileId: uploadB.body.file_id });
    expect(parsedA.status).toBe(200);
    expect(parsedB.status).toBe(200);

    // The most recently parsed file's id is the handle for the merged set.
    const dataId = parsedB.body.data.data_id;

    const validated = await request(app).post(`/api/validate/products/${dataId}`);
    expect(validated.status).toBe(200);
    expect(validated.body.data.products.length).toBe(6);

    const results = await request(app).get(`/api/validate/results/${dataId}`);
    expect(results.status).toBe(200);
    expect(results.body.data.products.length).toBe(6);
  });

  it('removes a deleted file\'s products from the merged dataset', async () => {
    const app = makeApp();

    const uploadA = await request(app)
      .post('/api/upload/csv')
      .attach('file', csvBuffer(), { filename: 'a.csv', contentType: 'text/csv' });
    const uploadB = await request(app)
      .post('/api/upload/csv')
      .attach('file', csvBuffer(), { filename: 'b.csv', contentType: 'text/csv' });

    await request(app).post('/api/process/csv').send({ fileId: uploadA.body.file_id });
    const parsedB = await request(app).post('/api/process/csv').send({ fileId: uploadB.body.file_id });
    const dataId = parsedB.body.data.data_id;

    const before = await request(app).post(`/api/validate/products/${dataId}`);
    expect(before.body.data.products.length).toBe(6);

    const removed = await request(app).delete(`/api/upload/csv/${uploadA.body.file_id}`);
    expect(removed.status).toBe(200);

    const after = await request(app).post(`/api/validate/products/${dataId}`);
    expect(after.status).toBe(200);
    expect(after.body.data.products.length).toBe(3);
  });

  it('uploads images and matches them against products', async () => {
    const app = makeApp();
    const dataId = await uploadAndParse(app);

    const image = await request(app)
      .post('/api/upload/images')
      .attach('files', Buffer.from('fake-image'), { filename: '8412345678901_main.jpg', contentType: 'image/jpeg' })
      .attach('files', Buffer.from('fake-image'), { filename: '8412345678902_front.jpeg', contentType: 'image/jpeg' });

    expect(image.status).toBe(200);
    expect(image.body.success).toBe(true);

    const matched = await request(app)
      .post(`/api/images/match/${dataId}`)
      .send({ strategy: 'ean', threshold: 0.7, max_images_per_product: 5 });

    expect(matched.status).toBe(200);
    expect(Array.isArray(matched.body.data)).toBe(true);
    expect(matched.body.data.length).toBe(3);
    expect(matched.body.data.some((m: any) => m.matched_files.length > 0)).toBe(true);

    const stored = await request(app).get(`/api/images/results/${dataId}`);
    expect(stored.status).toBe(200);
    expect(stored.body.data.length).toBe(3);
  });

  it('selects an image folder from the server', async () => {
    const app = makeApp();
    const folder = path.join(uploadsDir, 'catalog');
    await fs.ensureDir(folder);
    await fs.writeFile(path.join(folder, 'product.jpg'), 'fake');
    await fs.writeFile(path.join(folder, 'logo.png'), 'fake');

    const res = await request(app).post('/api/upload/folder').send({ folderPath: folder });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('1 image(s)');

    await fs.remove(folder);
  });

  it('rejects image uploads that are not JPG or JPEG', async () => {
    const res = await request(makeApp())
      .post('/api/upload/images')
      .attach('files', Buffer.from('fake-image'), { filename: 'product.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/only \.jpg and \.jpeg images/i);
  });

  it('rejects a missing image folder', async () => {
    const res = await request(makeApp())
      .post('/api/upload/folder')
      .send({ folderPath: 'C:/definitely/not/here' });

    expect(res.status).toBe(404);
  });

  it('generates AI text suggestions for missing fields', async () => {
    const app = makeApp();
    const dataId = await uploadAndParse(app);

    const suggested = await request(app)
      .post(`/api/ai/suggest/${dataId}`)
      .send({ provider: 'mock', language: 'es', enabled_fields: ['meta_title', 'meta_description'] });

    expect(suggested.status).toBe(200);
    expect(Array.isArray(suggested.body.data)).toBe(true);
    expect(suggested.body.data.length).toBeGreaterThan(0);

    const stored = await request(app).get(`/api/ai/suggestions/${dataId}`);
    expect(stored.status).toBe(200);
    expect(stored.body.data.length).toBe(suggested.body.data.length);
  });

  it('runs the sync session lifecycle in dry-run mode', async () => {
    const app = makeApp();
    const dataId = await uploadAndParse(app);

    const created = await request(app).post(`/api/sync/session/${dataId}`).send({ batch_size: 5 });
    expect(created.status).toBe(200);
    expect(created.body.session).toBeDefined();
    expect(created.body.session.dry_run).toBe(true);
    expect(created.body.session_id).toBe(created.body.session.id);

    const sessionId = created.body.session_id as string;

    const fetched = await request(app).get(`/api/sync/session/${sessionId}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.session.id).toBe(sessionId);

    const started = await request(app).post(`/api/sync/start/${sessionId}`);
    expect(started.status).toBe(200);
    expect(Array.isArray(started.body.data)).toBe(true);
    expect(started.body.data.length).toBe(3);

    const results = await request(app).get(`/api/sync/results/${sessionId}`);
    expect(results.status).toBe(200);
    expect(results.body.data.every((r: any) => r.status === 'completed')).toBe(true);

    const jsonExport = await request(app).get(`/api/sync/export/${sessionId}/json`);
    expect(jsonExport.status).toBe(200);
    expect(jsonExport.body.success).toBe(true);

    const csvExport = await request(app).get(`/api/sync/export/${sessionId}/csv`);
    expect(csvExport.status).toBe(200);
    expect(csvExport.text).toContain('operation,status');

    const cancelled = await request(app).post(`/api/sync/cancel/${sessionId}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.success).toBe(true);
  });

  it('returns 404 for an unknown sync session', async () => {
    const res = await request(makeApp()).get('/api/sync/session/unknown');
    expect(res.status).toBe(404);
  });

  it('loads, edits and exports the review state', async () => {
    const app = makeApp();
    const dataId = await uploadAndParse(app);

    const state = await request(app).get(`/api/review/state/${dataId}`);
    expect(state.status).toBe(200);
    expect(state.body.data.total_products).toBe(3);

    const productId = state.body.data.products[0].product_id as string;

    const applied = await request(app)
      .post(`/api/review/apply/${dataId}`)
      .send({ product_id: productId, field: 'name', value: 'Nombre editado' });
    expect(applied.status).toBe(200);
    expect(applied.body.success).toBe(true);

    const batch = await request(app)
      .post(`/api/review/batch/${dataId}`)
      .send({ action: 'accept_all' });
    expect(batch.status).toBe(200);
    expect(batch.body.data.accepted_count).toBe(3);

    const exported = await request(app).get(`/api/review/export/${dataId}`);
    expect(exported.status).toBe(200);
    expect(exported.body.products).toBeDefined();
  });

  it('blocks download path traversal', async () => {
    const res = await request(makeApp()).get('/api/download/..%2Fsecret.txt');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('serves health and logs endpoints', async () => {
    const app = makeApp();

    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');

    const logs = await request(app).get('/api/logs');
    expect(logs.status).toBe(200);
    expect(Array.isArray(logs.body.data)).toBe(true);
  });
});
