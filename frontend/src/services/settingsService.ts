import client from './apiClient';

export interface R2Config {
  r2_enabled: boolean;
  r2_endpoint_url: string;
  r2_access_key_id: string;
  r2_bucket_name: string;
  r2_region: string;
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
    const res = await client.get<{ enabled: boolean; configured: boolean; bucket: string; endpoint: string; stats: R2Stats }>('/r2/status');
    return res.data;
  },

  saveR2Config: async (config: {
    r2_enabled: boolean;
    r2_endpoint_url: string;
    r2_access_key_id: string;
    r2_secret_access_key: string;
    r2_bucket_name: string;
    r2_region: string;
  }): Promise<R2ConfigResponse> => {
    const res = await client.put<R2ConfigResponse>('/settings/r2', config);
    return res.data;
  },

  testR2Connection: async (config: {
    r2_endpoint_url: string;
    r2_access_key_id: string;
    r2_secret_access_key: string;
    r2_bucket_name: string;
    r2_region: string;
  }): Promise<{ success: boolean; message: string }> => {
    const res = await client.post<{ success: boolean; message: string }>('/settings/r2/test', config);
    return res.data;
  },
};
