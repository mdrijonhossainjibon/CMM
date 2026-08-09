import client from './apiClient';
import type { ModelListResponse, ModelInfoResponse, ExportsResponse } from '../types';

export async function listModels(): Promise<ModelListResponse> {
  const res = await client.get<ModelListResponse>('/models', {
    timeout: 10000,
  });
  return res.data;
}

export async function downloadModel(path: string): Promise<void> {
  const res = await client.get(`/models/download/${path}`, {
    responseType: 'blob',
    timeout: 60000,
  });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = url;
  const filename = path.split('/').pop() || 'model.pt';
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function reloadModel(): Promise<void> {
  await client.post('/reload', undefined, { timeout: 10000 });
}

export async function getModelInfo(): Promise<ModelInfoResponse> {
  const res = await client.get<ModelInfoResponse>('/info', {
    timeout: 5000,
  });
  return res.data;
}

export async function listExports(): Promise<ExportsResponse> {
  const res = await client.get<ExportsResponse>('/exports', {
    timeout: 10000,
  });
  return res.data;
}

export function getExportDownloadUrl(filename: string): string {
  const base = (client.defaults.baseURL || '').replace(/\/+$/, '');
  return `${base}/exports/download/${encodeURIComponent(filename)}`;
}
