import client from './apiClient';
import type { DatasetImageResponse } from '../types';

export async function getTrainImages(): Promise<DatasetImageResponse> {
  const res = await client.get<DatasetImageResponse>('/datasets/train', {
    timeout: 10000,
  });
  return res.data;
}

export async function getValImages(): Promise<DatasetImageResponse> {
  const res = await client.get<DatasetImageResponse>('/datasets/val', {
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
