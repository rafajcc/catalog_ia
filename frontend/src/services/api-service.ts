"""
API Service Layer
Handles all communication between frontend and backend
"""

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import {
  ApiResponse,
  PaginatedResponse,
  FileUploadResponse,
  SyncResponse,
  ConfigurationResponse,
  SyncPlanResponse,
  ProductData,
  AIConfig,
  ValidationConfig,
  ImageMatcherConfig,
  ImageSelectionConfig,
  SyncConfig,
  SyncSession,
  SyncResult
} from '../types';

class ApiService {
  private client: AxiosInstance;
  private baseURL: string;

  constructor() {
    this.baseURL = '/api';
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        // Add auth token if available
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Handle unauthorized - clear auth and redirect
          localStorage.removeItem('auth_token');
          window.location.href = '/login';
        }

        if (error.response?.status >= 500) {
          console.error('Server error:', error.response.data);
        }

        return Promise.reject(error);
      }
    );
  }

  // Health check
  async healthCheck(): Promise<ApiResponse> {
    const response = await this.client.get('/health');
    return response.data;
  }

  // Configuration endpoints
  async getConfiguration(): Promise<ConfigurationResponse> {
    const response = await this.client.get('/config');
    return response.data;
  }

  async updateConfiguration(config: any): Promise<ApiResponse> {
    const response = await this.client.put('/config', config);
    return response.data;
  }

  async testPrestashopConnection(config: any): Promise<ApiResponse> {
    const response = await this.client.post('/config/test/prestashop', config);
    return response.data;
  }

  async testAIConnection(config: any): Promise<ApiResponse> {
    const response = await this.client.post('/config/test/ai', config);
    return response.data;
  }

  // File upload endpoints
  async uploadCSV(file: File): Promise<FileUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.client.post('/upload/csv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  }

  async uploadImages(files: File[]): Promise<ApiResponse> {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });

    const response = await this.client.post('/upload/images', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  }

  async selectImageFolder(folderPath: string): Promise<ApiResponse> {
    const response = await this.client.post('/upload/folder', { folderPath });
    return response.data;
  }

  // Data processing endpoints
  async parseCSV(fileId: string): Promise<ApiResponse> {
    const response = await this.client.post('/process/csv', { fileId });
    return response.data;
  }

  async getParsedData(fileId: string): Promise<ApiResponse> {
    const response = await this.client.get(`/process/csv/${fileId}`);
    return response.data;
  }

  async validateProducts(dataId: string): Promise<ApiResponse> {
    const response = await this.client.post(`/validate/products/${dataId}`);
    return response.data;
  }

  async getValidationResults(dataId: string): Promise<ApiResponse> {
    const response = await this.client.get(`/validate/results/${dataId}`);
    return response.data;
  }

  async matchImages(dataId: string, config: any): Promise<ApiResponse> {
    const response = await this.client.post(`/images/match/${dataId}`, config);
    return response.data;
  }

  async getImageMatchingResults(dataId: string): Promise<ApiResponse> {
    const response = await this.client.get(`/images/results/${dataId}`);
    return response.data;
  }

  async generateTextSuggestions(dataId: string, config: any): Promise<ApiResponse> {
    const response = await this.client.post(`/ai/suggest/${dataId}`, config);
    return response.data;
  }

  async getTextSuggestions(dataId: string): Promise<ApiResponse> {
    const response = await this.client.get(`/ai/suggestions/${dataId}`);
    return response.data;
  }

  async createSyncSession(dataId: string, config: any): Promise<SyncResponse> {
    const response = await this.client.post(`/sync/session/${dataId}`, config);
    return response.data;
  }

  async getSyncSession(sessionId: string): Promise<ApiResponse> {
    const response = await this.client.get(`/sync/session/${sessionId}`);
    return response.data;
  }

  async startSync(sessionId: string): Promise<ApiResponse> {
    const response = await this.client.post(`/sync/start/${sessionId}`);
    return response.data;
  }

  async cancelSync(sessionId: string): Promise<ApiResponse> {
    const response = await this.client.post(`/sync/cancel/${sessionId}`);
    return response.data;
  }

  async getSyncResults(sessionId: string): Promise<ApiResponse> {
    const response = await this.client.get(`/sync/results/${sessionId}`);
    return response.data;
  }

  async exportSyncResults(sessionId: string, format: string): Promise<Blob> {
    const response = await this.client.get(`/sync/export/${sessionId}/${format}`, {
      responseType: 'blob'
    });
    return response.data;
  }

  // Review endpoints
  async getReviewState(dataId: string): Promise<ApiResponse> {
    const response = await this.client.get(`/review/state/${dataId}`);
    return response.data;
  }

  async updateReviewState(dataId: string, reviewState: any): Promise<ApiResponse> {
    const response = await this.client.put(`/review/state/${dataId}`, reviewState);
    return response.data;
  }

  async applyReviewChanges(dataId: string, changes: any): Promise<ApiResponse> {
    const response = await this.client.post(`/review/apply/${dataId}`, changes);
    return response.data;
  }

  async batchReviewAction(dataId: string, action: string, targetIds?: string[]): Promise<ApiResponse> {
    const response = await this.client.post(`/review/batch/${dataId}`, {
      action,
      targetIds
    });
    return response.data;
  }

  async exportReviewState(dataId: string): Promise<Blob> {
    const response = await this.client.get(`/review/export/${dataId}`, {
      responseType: 'blob'
    });
    return response.data;
  }

  // Utility endpoints
  async getSystemStatus(): Promise<ApiResponse> {
    const response = await this.client.get('/status');
    return response.data;
  }

  async getLogs(level?: string, limit?: number): Promise<ApiResponse> {
    const params = new URLSearchParams();
    if (level) params.append('level', level);
    if (limit) params.append('limit', limit.toString());

    const response = await this.client.get(`/logs?${params.toString()}`);
    return response.data;
  }

  async downloadFile(filePath: string): Promise<Blob> {
    const response = await this.client.get(`/download/${filePath}`, {
      responseType: 'blob'
    });
    return response.data;
}
