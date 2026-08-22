import client from './apiClient';

export async function getSceneClasses(): Promise<string[]> {
  const res = await client.get<string[]>('/vision/scene-classes');
  return res.data;
}

export async function getSceneDatasetStats() {
  const res = await client.get('/vision/scene-dataset-stats');
  return res.data;
}

export async function uploadSceneImages(files: File[], className: string) {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  form.append('class_name', className);
  const res = await client.post('/vision/scene-upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
  return res.data;
}

export async function deleteSceneClass(className: string) {
  const res = await client.delete(`/vision/scene-class/${encodeURIComponent(className)}`);
  return res.data;
}

export async function startSceneTraining(params: { epochs?: number; batch_size?: number; image_size?: number; workers?: number }) {
  const res = await client.post('/vision/scene-train', params);
  return res.data;
}

export async function getSceneTrainingStatus() {
  const res = await client.get('/vision/scene-train/status');
  return res.data;
}
