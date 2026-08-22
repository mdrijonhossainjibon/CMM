import client from './apiClient';
import {
  createStorageClient,
  resolveBucket,
  isR2Configured,
  getR2Config,
  clearR2CredCache,
  createLocalSyncStore,
  clearLocalSyncStore,
} from './r2Client';

export async function getR2Status(): Promise<{
  enabled: boolean;
  configured: boolean;
  bucket: string;
  endpoint: string;
}> {
  try {
    const res = await client.get<{ config?: { r2_bucket_name?: string; r2_api_key?: string; r2_base_url?: string } }>(
      '/settings/r2',
      { timeout: 5000 }
    );
    const c = res.data?.config || {};
    const configured = Boolean(c.r2_api_key);
    return {
      enabled: configured,
      configured,
      bucket: c.r2_bucket_name || '',
      endpoint: c.r2_base_url || '',
    };
  } catch {
    return { enabled: false, configured: false, bucket: '', endpoint: '' };
  }
}

interface SyncResult {
  success: boolean;
  uploaded?: number;
  downloaded?: number;
  skipped?: number;
  failed?: number;
  deleted?: number;
  message?: string;
}

export async function pushTrainingDataToR2(): Promise<SyncResult> {
  try {
    const { storage, cfg } = await createStorageClient();
    const bucket = await resolveBucket(storage, cfg.r2_bucket_name || 'captchamaster');
    const images = await listBackendImages();
    if (images.length === 0) {
      return { success: false, uploaded: 0, message: 'No training data to push' };
    }

    const files = await Promise.all(
      images.map(async (img) => {
        const blob = await fetchBackendImage(img.url);
        return { path: `training-data/${img.filename}`, data: blob, mimeType: blob.type || undefined };
      })
    );

    const store = createLocalSyncStore();
    const result = await storage.sync.sync({
      bucketId: bucket.id,
      files,
      concurrency: 6,
      store,
      onProgress: (p) => {
        // progress available if UI needs it (speed/eta)
        void p;
      },
    });

    return {
      success: result.failed.length === 0,
      uploaded: result.uploaded,
      skipped: result.skipped,
      failed: result.failed.length,
      message: result.failed.length === 0 ? undefined : `${result.failed.length} file(s) failed`,
    };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Failed to push to R2', failed: 0 };
  }
}

export async function clearPushManifest(): Promise<void> {
  try {
    clearLocalSyncStore();
  } catch {
    /* ignore */
  }
}

export async function pullTrainingDataFromR2(): Promise<SyncResult> {
  try {
    const { storage, cfg } = await createStorageClient();
    const bucket = await resolveBucket(storage, cfg.r2_bucket_name || 'captchamaster');

    const page = await storage.file.list(bucket.id, { page: 1, pageSize: 500 });
    if (page.items.length === 0) {
      return { success: false, downloaded: 0, failed: 0, message: 'No training data found in R2' };
    }

    let downloaded = 0;
    const failed: string[] = [];
    for (const file of page.items) {
      try {
        const resp = await storage.file.download(bucket.id, file.id);
        const buf = await resp.arrayBuffer();
        const filename = file.name || file.originalName || 'image.jpg';
        const cls = resolveClassFromFilename(filename);
        const blob = new Blob([buf], { type: file.mimeType || guessContentType(filename) });
        const blobFile = new File([blob], filename, { type: blob.type });
        await uploadSingleToBackend(blobFile, cls);
        downloaded += 1;
      } catch {
        failed.push(file.name);
      }
    }

    return {
      success: failed.length === 0,
      downloaded,
      failed: failed.length,
      message: failed.length === 0 ? undefined : `${failed.length} file(s) failed`,
    };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Failed to pull from R2', failed: 0 };
  }
}

export async function deleteR2Object(..._args: unknown[]): Promise<SyncResult> {
  return { success: false, message: 'Delete via r2-storage-sdk is handled in the platform dashboard.' };
}

async function listBackendImages(): Promise<{ filename: string; url: string }[]> {
  const res = await client.get<{ images?: { filename: string; url: string }[] }>(
    '/training-data/images',
    { params: { page: 1, limit: 300 }, timeout: 8000 }
  );
  return res.data?.images || [];
}

async function fetchBackendImage(url: string): Promise<Blob> {
  const base = (client.defaults.baseURL || '').replace(/\/+$/, '');
  const full = /^https?:\/\//.test(url) ? url : `${base}/${url.replace(/^\/+/, '')}`;
  const res = await fetch(full);
  if (!res.ok) throw new Error(`GET ${full} -> ${res.status}`);
  return res.blob();
}

function resolveClassFromFilename(filename: string): string {
  const parts = filename.split('_');
  let cls = parts[0] || 'unknown';
  for (let i = 0; i < parts.length; i++) {
    if (/^\d{10,}$/.test(parts[i])) {
      cls = parts.slice(0, i).join('_') || 'unknown';
      break;
    }
  }
  return cls;
}

function guessContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    bmp: 'image/bmp',
  };
  return map[ext] || 'application/octet-stream';
}

async function uploadSingleToBackend(file: File, className: string): Promise<void> {
  const formData = new FormData();
  formData.append('files', file);
  formData.append('class_name', className);
  const res = await client.post('/training-data/batch', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
  if (!res.data?.success) throw new Error('Backend rejected upload');
}

export { clearR2CredCache, getR2Config, isR2Configured };
