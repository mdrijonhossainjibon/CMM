import client from './apiClient';

export async function pullTrainingDataFromR2(): Promise<{ success: boolean; downloaded?: number; failed?: number; message?: string }> {
  const res = await client.post('/r2/pull/training-data', {}, { timeout: 300000 });
  return res.data;
}

export async function pushTrainingDataToR2(): Promise<{ success: boolean; uploaded?: number; failed?: number; message?: string }> {
  const res = await client.post('/r2/push/training-data', {}, { timeout: 300000 });
  return res.data;
}

export async function getR2Status(): Promise<{ enabled: boolean; configured: boolean; bucket: string; endpoint: string }> {
  const res = await client.get('/r2/status', { timeout: 5000 });
  return res.data;
}
