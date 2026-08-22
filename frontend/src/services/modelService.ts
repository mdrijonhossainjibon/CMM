import client, { getAssetUrl } from './apiClient';
import type { ModelListResponse, ModelInfoResponse, ExportsResponse } from '../types';

export async function listModels(): Promise<ModelListResponse> {
  const res = await client.get<ModelListResponse>('/models', {
    timeout: 10000,
  });
  return res.data;
}

export async function useModel(path: string): Promise<{ success: boolean; message?: string }> {
  const res = await client.post('/models/use', { path }, { timeout: 60000 });
  return res.data;
}

export async function deleteModel(path: string): Promise<{ success: boolean; deleted?: string }> {
  const res = await client.delete(`/models/${encodeURIComponent(path)}`, {
    timeout: 10000,
  });
  return res.data;
}

export async function downloadModel(path: string): Promise<void> {
  // Direct link (no axios/blob) — big .pt files stream properly and no
  // blob-URL quirks in embedded browsers.
  const url = getAssetUrl(`models/download/${path}`);
  const link = document.createElement('a');
  link.href = url;
  const filename = path.split('/').pop() || 'model.pt';
  link.setAttribute('download', filename);
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
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
