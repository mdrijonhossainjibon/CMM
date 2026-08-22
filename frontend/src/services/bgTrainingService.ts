import client from './apiClient';

export interface BgTrainStatus {
  running: boolean;
  status: string;
  progress: number;
  elapsed_seconds?: number | null;
}

export async function startBgTraining(params: {
  epochs?: number;
  batch_size?: number;
  image_size?: number;
  workers?: number;
}) {
  const res = await client.post<{ success: boolean; message?: string; error?: string }>(
    '/vision/bg-train',
    params,
  );
  return res.data;
}

export async function getBgTrainingStatus(): Promise<BgTrainStatus> {
  const res = await client.get<BgTrainStatus>('/vision/bg-train/status');
  return res.data;
}
