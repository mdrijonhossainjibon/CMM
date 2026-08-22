import client from './apiClient';

export interface R2Config {
  r2_enabled: boolean;
  r2_api_key: string;
  r2_base_url: string;
  r2_bucket_name: string;
}

export interface R2ConfigResponse {
  success: boolean;
  config: R2Config;
  message?: string;
}

export interface R2Stats {
  objects: number;
  total_size_bytes: number;
  total_size_mb: number;
  total_size_gb: number;
  by_prefix: Record<string, { objects: number; size_mb: number }>;
}

export const settingsService = {
  getR2Config: async (): Promise<R2Config> => {
    const res = await client.get<{ success: boolean; config: R2Config }>('/settings/r2');
    return res.data.config;
  },

  getR2Status: async (): Promise<{ enabled: boolean; configured: boolean; bucket: string; endpoint: string; stats: R2Stats }> => {
    try {
      const { createStorageClient, resolveBucket, isR2Configured } = await import('./r2Client');
      const { storage, cfg } = await createStorageClient();
      const bucket = await resolveBucket(storage, cfg.r2_bucket_name || 'captchamaster');
      const stats = await storage.bucket.getStats(bucket.id);
      const totalBytes = typeof stats.storageUsed === 'number' ? stats.storageUsed : Number(stats.storageUsed) || 0;
      return {
        enabled: isR2Configured(cfg),
        configured: isR2Configured(cfg),
        bucket: cfg.r2_bucket_name,
        endpoint: cfg.r2_base_url,
        stats: {
          objects: stats.fileCount,
          total_size_bytes: totalBytes,
          total_size_mb: Math.round((totalBytes / (1024 * 1024)) * 100) / 100,
          total_size_gb: Math.round((totalBytes / (1024 * 1024 * 1024)) * 100) / 100,
          by_prefix: { root: { objects: stats.fileCount, size_mb: Math.round((totalBytes / (1024 * 1024)) * 100) / 100 } },
        },
      };
    } catch {
      return { enabled: false, configured: false, bucket: '', endpoint: '', stats: { objects: 0, total_size_bytes: 0, total_size_mb: 0, total_size_gb: 0, by_prefix: {} } };
    }
  },

  saveR2Config: async (config: {
    r2_enabled: boolean;
    r2_api_key: string;
    r2_base_url: string;
    r2_bucket_name: string;
  }): Promise<R2ConfigResponse> => {
    const res = await client.put<R2ConfigResponse>('/settings/r2', config);
    return res.data;
  },

  testR2Connection: async (config: {
    r2_api_key: string;
    r2_base_url: string;
    r2_bucket_name: string;
  }): Promise<{ success: boolean; message: string }> => {
    const res = await client.post<{ success: boolean; message: string }>('/settings/r2/test', config);
    return res.data;
  },
};
