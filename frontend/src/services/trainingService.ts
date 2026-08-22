import client from './apiClient';
import type { TrainingStartResponse, TrainingStatusResponse, TrainingTypesResponse, TrainingConfig } from '../types';

export async function startTraining(config: TrainingConfig): Promise<TrainingStartResponse> {
  const res = await client.post<TrainingStartResponse>('/train', config, {
    timeout: 10000,
  });
  return res.data;
}

export async function getTrainingStatus(): Promise<TrainingStatusResponse> {
  const res = await client.get<TrainingStatusResponse>('/train/status', {
    timeout: 5000,
  });
  return res.data;
}

export async function getHardwareInfo(): Promise<{ success: boolean; hardware: { device_type: string; gpu_name?: string; gpu_vram_mb?: number } }> {
  const res = await client.get('/train/hardware', { timeout: 5000 });
  return res.data;
}

export async function getOptimizePreview(batchSize: number, imageSize: number, workers: number, optimize: boolean) {
  const res = await client.get('/train/optimize-preview', {
    params: { batch_size: batchSize, image_size: imageSize, workers, optimize },
    timeout: 5000,
  });
  return res.data;
}

export async function getTrainingTypes(): Promise<TrainingTypesResponse> {
  const res = await client.get<TrainingTypesResponse>('/training-types', {
    timeout: 5000,
  });
  return res.data;
}

export async function deleteTrainingDataClass(className: string) {
  const res = await client.delete('/training-data/delete-class', {
    params: { class_name: className },
    timeout: 10000,
  });
  return res.data;
}

export async function getTrainingClasses() {
  const res = await client.get('/training-data/classes', {
    timeout: 5000,
  });
  return res.data;
}

export async function getTrainStatusRaw() {
  const res = await client.get('/train/status', { timeout: 5000 });
  return res.data;
}
