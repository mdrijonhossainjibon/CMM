import client from './apiClient';

export interface SplitResultItem {
  file: string;
  detected: boolean;
  method?: 'detector' | 'grabcut' | 'center';
  label: string | null;
  confidence: number;
  object_crops: string[];
  bg_crops: string[];
}

export interface SplitStatsItem {
  class: string;
  count: number;
}

export interface SplitStats {
  objects: SplitStatsItem[];
  backgrounds: SplitStatsItem[];
  total_objects: number;
  total_backgrounds: number;
}

export interface SplitResponse {
  success: boolean;
  processed: number;
  results: SplitResultItem[];
  errors: string[];
  stats: SplitStats;
}

export async function splitImages(
  files: File[],
  objectClass: string,
  bgClass: string,
  confThreshold = 0.35,
): Promise<SplitResponse> {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  form.append('object_class', objectClass);
  form.append('bg_class', bgClass);
  form.append('conf_threshold', String(confThreshold));
  const res = await client.post<SplitResponse>('/datasets/split', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 0,
  });
  return res.data;
}

export async function getSplitStats(): Promise<SplitStats> {
  const res = await client.get<SplitStats>('/datasets/split/stats');
  return res.data;
}

export async function deleteSplitClass(kind: 'objects' | 'backgrounds', className: string) {
  const res = await client.delete(`/datasets/split/${kind}/${encodeURIComponent(className)}`);
  return res.data;
}

export function getSplitImageUrl(kind: 'objects' | 'backgrounds', className: string, file: string): string {
  return `/api/datasets/split/${kind}/${encodeURIComponent(className)}/image?file=${encodeURIComponent(file)}`;
}

export function getSplitZipUrl(kind: 'objects' | 'backgrounds', className: string): string {
  return `/api/datasets/split/${kind}/${encodeURIComponent(className)}/zip`;
}

export async function listSplitImages(kind: 'objects' | 'backgrounds', className: string): Promise<string[]> {
  const res = await client.get<{ success: boolean; images: string[] }>(
    `/datasets/split/${kind}/${encodeURIComponent(className)}/images`,
  );
  return res.data.images ?? [];
}

export async function uploadBgZip(file: File, replace = false): Promise<{
  success: boolean;
  classes: Record<string, number>;
  total: number;
  stats: SplitStats;
}> {
  const form = new FormData();
  form.append('file', file);
  form.append('replace', String(replace));
  const res = await client.post('/datasets/bg-upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 0,
  });
  return res.data;
}

export interface AutoZipResponse {
  success: boolean;
  imported_bg: Record<string, number>;
  split: Record<string, { obj: number; bg: number }>;
  total_bg: number;
  total_obj: number;
  errors: string[];
  stats: SplitStats;
}

export async function uploadAutoZip(file: File, replace = false): Promise<AutoZipResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('replace', String(replace));
  const res = await client.post('/datasets/auto-zip', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 0,
  });
  return res.data;
}
