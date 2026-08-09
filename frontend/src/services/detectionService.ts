import client from './apiClient';
import type {
  DetectResponse,
  BatchDetectRequest,
  BatchDetectResponse,
} from '../types';

export async function detectSingle(
  file: File,
  confThreshold = 0.5,
  modelType = 'auto'
): Promise<DetectResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('conf_threshold', String(confThreshold));
  formData.append('model_type', modelType);
  const res = await client.post<DetectResponse>('/detect', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
  return res.data;
}

export async function detectBatch(
  data: BatchDetectRequest,
  modelType = 'auto'
): Promise<BatchDetectResponse> {
  const res = await client.post<BatchDetectResponse>(`/detect-batch?model_type=${modelType}`, data, {
    timeout: 120000,
  });
  return res.data;
}
