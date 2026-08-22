import client from './apiClient';
import type {
  DatasetImageResponse,
  ZipDatasetListResponse,
  ZipDatasetResponse,
  ZipTrainingRecordsResponse,
} from '../types';

export async function getTrainImages(page = 1, limit = 60): Promise<DatasetImageResponse> {
  const res = await client.get<DatasetImageResponse>('/datasets/train', {
    params: { page, limit },
    timeout: 10000,
  });
  return res.data;
}

export async function getValImages(page = 1, limit = 60): Promise<DatasetImageResponse> {
  const res = await client.get<DatasetImageResponse>('/datasets/val', {
    params: { page, limit },
    timeout: 10000,
  });
  return res.data;
}

export async function uploadDataset(formData: FormData, datasetType = 'train') {
  const res = await client.post('/datasets/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    params: { dataset_type: datasetType },
    timeout: 60000,
  });
  return res.data;
}

export async function deleteDataset(type: string) {
  const res = await client.delete(`/datasets/${type}`, {
    timeout: 10000,
  });
  return res.data;
}

export async function deleteDatasetImage(type: string, filename: string) {
  const res = await client.delete(`/datasets/${type}/image`, {
    params: { file: filename },
    timeout: 10000,
  });
  return res.data;
}

export async function deleteDatasetClass(type: string, className: string) {
  const res = await client.delete(`/datasets/${type}/class/${encodeURIComponent(className)}`, {
    timeout: 10000,
  });
  return res.data;
}

// ---------------------------------------------------------------------------
// ZIP Dataset Upload & Management
// ---------------------------------------------------------------------------

export async function uploadZipDataset(file: File, className?: string): Promise<ZipDatasetResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (className?.trim()) formData.append('class_name', className.trim());
  const res = await client.post<ZipDatasetResponse>('/datasets/zip/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 0, // large ZIPs allowed
  });
  return res.data;
}

export async function listZipDatasets(): Promise<ZipDatasetListResponse> {
  const res = await client.get<ZipDatasetListResponse>('/datasets/zip/list', {
    timeout: 15000,
  });
  return res.data;
}

export async function getZipDataset(datasetId: string): Promise<ZipDatasetResponse> {
  const res = await client.get<ZipDatasetResponse>('/datasets/zip/detail', {
    params: { dataset_id: datasetId },
    timeout: 10000,
  });
  return res.data;
}

export async function getZipTrainingRecords(datasetId: string): Promise<ZipTrainingRecordsResponse> {
  const res = await client.get<ZipTrainingRecordsResponse>('/datasets/zip/training-records', {
    params: { dataset_id: datasetId },
    timeout: 15000,
  });
  return res.data;
}

export async function deleteZipDataset(datasetId: string) {
  const res = await client.delete(`/datasets/zip/${datasetId}`, {
    timeout: 10000,
  });
  return res.data;
}

export async function rebuildZipMetadata(datasetId: string): Promise<ZipDatasetResponse> {
  const res = await client.post<ZipDatasetResponse>(`/datasets/zip/${datasetId}/rebuild`, undefined, {
    timeout: 15000,
  });
  return res.data;
}

export function getZipBackupUrl(datasetId: string): string {
  const base = (client.defaults.baseURL || '').replace(/\/+$/, '');
  return `${base}/datasets/zip/${datasetId}/backup`;
}
