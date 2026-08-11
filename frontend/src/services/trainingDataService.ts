import client from './apiClient';
import type {
  TrainingClassesResponse,
  TrainingImagesResponse,
  BatchUploadResponse,
} from '../types';

export async function uploadTrainingBatch(
  files: File[],
  className: string
): Promise<BatchUploadResponse> {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  formData.append('class_name', className);
  const res = await client.post<BatchUploadResponse>('/training-data/batch', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
  return res.data;
}

export async function getTrainingClasses(): Promise<TrainingClassesResponse> {
  const res = await client.get<TrainingClassesResponse>('/training-data/classes', {
    timeout: 5000,
  });
  return res.data;
}

export async function getTrainingImages(className = '', page = 1, limit = 60): Promise<TrainingImagesResponse> {
  const res = await client.get<TrainingImagesResponse>('/training-data/images', {
    params: {
      ...(className ? { class_name: className } : {}),
      page,
      limit,
    },
    timeout: 5000,
  });
  return res.data;
}

export async function deleteTrainingImage(filename: string) {
  const res = await client.delete('/training-data/delete', {
    params: { filename },
    timeout: 10000,
  });
  return res.data;
}

export async function deleteTrainingClass(className: string) {
  const res = await client.delete('/training-data/delete-class', {
    params: { class_name: className },
    timeout: 10000,
  });
  return res.data;
}

export async function renameTrainingImage(filename: string, newClass: string) {
  const res = await client.put('/training-data/rename', null, {
    params: { filename, new_class: newClass },
    timeout: 10000,
  });
  return res.data;
}
