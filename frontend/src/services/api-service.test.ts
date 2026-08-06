import { ApiService } from './api-service';

var mockGet: jest.Mock;
var mockPost: jest.Mock;
var mockPut: jest.Mock;
var mockInterceptorsUse: jest.Mock;

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: () => ({
      get: mockGet,
      post: mockPost,
      put: mockPut,
      interceptors: {
        request: { use: mockInterceptorsUse },
        response: { use: mockInterceptorsUse }
      }
    })
  }
}));

function getRequestHandler(): (config: any) => any {
  return mockInterceptorsUse.mock.calls[0][0];
}

function getResponseErrorHandler(): (error: any) => Promise<any> {
  return mockInterceptorsUse.mock.calls[1][1];
}

describe('ApiService', () => {
  beforeEach(() => {
    mockGet = jest.fn();
    mockPost = jest.fn();
    mockPut = jest.fn();
    mockInterceptorsUse = jest.fn();
    localStorage.clear();
  });

  it('creates an axios instance with the configured base URL and timeouts', () => {
    const service = new ApiService('/custom');
    expect(service.baseURL).toBe('/custom');
  });

  it('attaches the auth token from localStorage on every request', () => {
    localStorage.setItem('auth_token', 'secret-token');
    new ApiService();
    const handler = getRequestHandler();

    const config: any = { headers: {} };
    const result = handler(config);

    expect(result.headers.Authorization).toBe('Bearer secret-token');
  });

  it('leaves the request headers unchanged when no token is present', () => {
    new ApiService();
    const handler = getRequestHandler();

    const config: any = { headers: {} };
    const result = handler(config);

    expect(result.headers.Authorization).toBeUndefined();
  });

  it('clears the token and redirects to login on 401 responses', async () => {
    localStorage.setItem('auth_token', 'expired-token');
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: { pathname: '/', href: '', search: '', hash: '', origin: 'http://localhost' }
    });
    try {
      new ApiService();
      const handler = getResponseErrorHandler();

      await expect(handler({ response: { status: 401 } })).rejects.toEqual({ response: { status: 401 } });
      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(window.location.href).toBe('/login');
    } finally {
      Object.defineProperty(window, 'location', {
        writable: true,
        configurable: true,
        value: originalLocation
      });
    }
  });

  it('logs server errors for 5xx responses', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    new ApiService();
    const handler = getResponseErrorHandler();

    return expect(
      handler({ response: { status: 500, data: { error: 'boom' } } })
    ).rejects.toEqual({ response: { status: 500, data: { error: 'boom' } } }).then(() => {
      expect(consoleError).toHaveBeenCalledWith('Server error:', { error: 'boom' });
      consoleError.mockRestore();
    });
  });

  it('rejects other response errors without side effects', () => {
    new ApiService();
    const handler = getResponseErrorHandler();

    return expect(
      handler({ response: { status: 400 } })
    ).rejects.toEqual({ response: { status: 400 } });
  });

  describe('request methods', () => {
    let service: ApiService;

    beforeEach(() => {
      service = new ApiService();
    });

    it('healthCheck hits /health', async () => {
      mockGet.mockResolvedValue({ data: { success: true } });
      await expect(service.healthCheck()).resolves.toEqual({ success: true });
      expect(mockGet).toHaveBeenCalledWith('/health');
    });

    it('getConfiguration hits /config', async () => {
      mockGet.mockResolvedValue({ data: { ai: { provider: 'mock' } } });
      await expect(service.getConfiguration()).resolves.toEqual({ ai: { provider: 'mock' } });
      expect(mockGet).toHaveBeenCalledWith('/config');
    });

    it('updateConfiguration PUTs to /config', async () => {
      mockPut.mockResolvedValue({ data: { success: true } });
      const config = { prestashop: { base_url: 'https://shop.test' } };
      await service.updateConfiguration(config);
      expect(mockPut).toHaveBeenCalledWith('/config', config);
    });

    it('testPrestashopConnection POSTs config', async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      const config: any = { base_url: 'https://shop.test', api_key: 'key' };
      await service.testPrestashopConnection(config);
      expect(mockPost).toHaveBeenCalledWith('/config/test/prestashop', config);
    });

    it('testAIConnection POSTs config', async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      const config: any = { provider: 'openai', api_key: 'key' };
      await service.testAIConnection(config);
      expect(mockPost).toHaveBeenCalledWith('/config/test/ai', config);
    });

    it('uploadCSV posts multipart form data', async () => {
      mockPost.mockResolvedValue({ data: { success: true, file_id: 'f1' } });
      const file = new File(['a,b'], 'products.csv', { type: 'text/csv' });
      const result = await service.uploadCSV(file);

      expect(result.file_id).toBe('f1');
      const [url, formData, options] = mockPost.mock.calls[0];
      expect(url).toBe('/upload/csv');
      expect(formData).toBeInstanceOf(FormData);
      expect((formData as FormData).get('file')).toBe(file);
      expect(options.headers['Content-Type']).toBe('multipart/form-data');
    });

    it('uploadImages posts every file to the images endpoint', async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      const files = [new File(['a'], 'a.jpg'), new File(['b'], 'b.jpg')];
      await service.uploadImages(files);

      const [url, formData] = mockPost.mock.calls[0];
      expect(url).toBe('/upload/images');
      const values = (formData as FormData).getAll('files');
      expect(values).toHaveLength(2);
    });

    it('selectImageFolder posts the folder path', async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      await service.selectImageFolder('C:/images');
      expect(mockPost).toHaveBeenCalledWith('/upload/folder', { folderPath: 'C:/images' });
    });

    it('parseCSV posts the file id', async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      await service.parseCSV('f1');
      expect(mockPost).toHaveBeenCalledWith('/process/csv', { fileId: 'f1' });
    });

    it('getParsedData hits the process endpoint', async () => {
      mockGet.mockResolvedValue({ data: { success: true } });
      await service.getParsedData('f1');
      expect(mockGet).toHaveBeenCalledWith('/process/csv/f1');
    });

    it('validateProducts posts the data id', async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      await service.validateProducts('d1');
      expect(mockPost).toHaveBeenCalledWith('/validate/products/d1');
    });

    it('getValidationResults hits the results endpoint', async () => {
      mockGet.mockResolvedValue({ data: { success: true } });
      await service.getValidationResults('d1');
      expect(mockGet).toHaveBeenCalledWith('/validate/results/d1');
    });

    it('matchImages posts config', async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      const config = { strategy: 'ean' } as any;
      await service.matchImages('d1', config);
      expect(mockPost).toHaveBeenCalledWith('/images/match/d1', config);
    });

    it('getImageMatchingResults hits the results endpoint', async () => {
      mockGet.mockResolvedValue({ data: { success: true } });
      await service.getImageMatchingResults('d1');
      expect(mockGet).toHaveBeenCalledWith('/images/results/d1');
    });

    it('generateTextSuggestions posts config', async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      const config = { provider: 'mock', enabled_fields: ['name'] } as any;
      await service.generateTextSuggestions('d1', config);
      expect(mockPost).toHaveBeenCalledWith('/ai/suggest/d1', config);
    });

    it('getTextSuggestions hits the suggestions endpoint', async () => {
      mockGet.mockResolvedValue({ data: { success: true } });
      await service.getTextSuggestions('d1');
      expect(mockGet).toHaveBeenCalledWith('/ai/suggestions/d1');
    });

    it('createSyncSession posts config', async () => {
      mockPost.mockResolvedValue({ data: { success: true, session_id: 's1' } });
      const config = { batch_size: 10 } as any;
      const result = await service.createSyncSession('d1', config);
      expect(result.session_id).toBe('s1');
      expect(mockPost).toHaveBeenCalledWith('/sync/session/d1', config);
    });

    it('getSyncSession hits the session endpoint', async () => {
      mockGet.mockResolvedValue({ data: { success: true, session_id: 's1' } });
      await service.getSyncSession('s1');
      expect(mockGet).toHaveBeenCalledWith('/sync/session/s1');
    });

    it('startSync posts the session id', async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      await service.startSync('s1');
      expect(mockPost).toHaveBeenCalledWith('/sync/start/s1');
    });

    it('cancelSync posts the session id', async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      await service.cancelSync('s1');
      expect(mockPost).toHaveBeenCalledWith('/sync/cancel/s1');
    });

    it('getSyncResults hits the results endpoint', async () => {
      mockGet.mockResolvedValue({ data: { success: true } });
      await service.getSyncResults('s1');
      expect(mockGet).toHaveBeenCalledWith('/sync/results/s1');
    });

    it('exportSyncResults requests a blob', async () => {
      mockGet.mockResolvedValue({ data: new Blob(['csv']) });
      const blob = await service.exportSyncResults('s1', 'csv');
      expect(blob).toBeInstanceOf(Blob);
      expect(mockGet).toHaveBeenCalledWith('/sync/export/s1/csv', { responseType: 'blob' });
    });

    it('getReviewState hits the review endpoint', async () => {
      mockGet.mockResolvedValue({ data: { success: true } });
      await service.getReviewState('d1');
      expect(mockGet).toHaveBeenCalledWith('/review/state/d1');
    });

    it('updateReviewState PUTs to the review endpoint', async () => {
      mockPut.mockResolvedValue({ data: { success: true } });
      await service.updateReviewState('d1', { products: [] });
      expect(mockPut).toHaveBeenCalledWith('/review/state/d1', { products: [] });
    });

    it('applyReviewChanges posts changes', async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      await service.applyReviewChanges('d1', { edits: [] });
      expect(mockPost).toHaveBeenCalledWith('/review/apply/d1', { edits: [] });
    });

    it('batchReviewAction posts action and target ids', async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      await service.batchReviewAction('d1', 'accept_all', ['p1', 'p2']);
      expect(mockPost).toHaveBeenCalledWith('/review/batch/d1', {
        action: 'accept_all',
        targetIds: ['p1', 'p2']
      });
    });

    it('exportReviewState requests a blob', async () => {
      mockGet.mockResolvedValue({ data: new Blob(['json']) });
      await service.exportReviewState('d1');
      expect(mockGet).toHaveBeenCalledWith('/review/export/d1', { responseType: 'blob' });
    });

    it('getSystemStatus hits /status', async () => {
      mockGet.mockResolvedValue({ data: { success: true } });
      await service.getSystemStatus();
      expect(mockGet).toHaveBeenCalledWith('/status');
    });

    it('getLogs appends provided query params', async () => {
      mockGet.mockResolvedValue({ data: { success: true } });
      await service.getLogs('error', 50);
      expect(mockGet).toHaveBeenCalledWith('/logs?level=error&limit=50');
    });

    it('getLogs omits query params when not provided', async () => {
      mockGet.mockResolvedValue({ data: { success: true } });
      await service.getLogs();
      expect(mockGet).toHaveBeenCalledWith('/logs?');
    });

    it('downloadFile requests a blob', async () => {
      mockGet.mockResolvedValue({ data: new Blob(['data']) });
      const blob = await service.downloadFile('tmp/file.csv');
      expect(blob).toBeInstanceOf(Blob);
      expect(mockGet).toHaveBeenCalledWith('/download/tmp/file.csv', { responseType: 'blob' });
    });

    it('getCsvTemplate requests the template as a blob', async () => {
      mockGet.mockResolvedValue({ data: new Blob(['ean,name']) });
      const blob = await service.getCsvTemplate();
      expect(blob).toBeInstanceOf(Blob);
      expect(mockGet).toHaveBeenCalledWith('/template/csv', { responseType: 'blob' });
    });
  });
});
