import { createClient, type StorageClient, type Bucket, type SyncStore } from 'r2-storage-sdk';
import client from './apiClient';

export interface R2Credentials {
  r2_enabled: boolean;
  r2_api_key: string;
  r2_base_url: string;
  r2_bucket_name: string;
}

interface CredentialsResponse {
  success?: boolean;
  config?: R2Credentials;
  detail?: string;
}

const CRED_TTL = 5 * 60 * 1000;
let cachedCreds: { expiry: number; creds: R2Credentials } | null = null;

const DEFAULT_BASE_URL = 'https://cloud.captchamaster.org/api';

async function fetchCredentials(): Promise<R2Credentials> {
  if (cachedCreds && Date.now() < cachedCreds.expiry) {
    return cachedCreds.creds;
  }
  const res = await client.get<CredentialsResponse>('/settings/r2/credentials', {
    timeout: 8000,
  });
  const cfg = res.data?.config;
  if (!cfg) {
    throw new Error(res.data?.detail || 'Failed to load R2 credentials');
  }
  cachedCreds = { expiry: Date.now() + CRED_TTL, creds: cfg };
  return cfg;
}

export function clearR2CredCache() {
  cachedCreds = null;
}

export function isR2Configured(cfg: R2Credentials): boolean {
  return Boolean(cfg?.r2_enabled && cfg.r2_api_key);
}

export async function getR2Config(): Promise<R2Credentials> {
  return fetchCredentials();
}

export async function createStorageClient(): Promise<{ storage: StorageClient; cfg: R2Credentials }> {
  const cfg = await fetchCredentials();
  if (!isR2Configured(cfg)) {
    throw new Error('R2 storage is not configured. Set up your API key in Settings first.');
  }
  const storage = createClient({
    apiKey: cfg.r2_api_key,
    baseUrl: cfg.r2_base_url || DEFAULT_BASE_URL,
  });
  return { storage, cfg };
}

export async function resolveBucket(
  storage: StorageClient,
  bucketName: string
): Promise<Bucket> {
  const page = await storage.bucket.list({ page: 1, pageSize: 100 });
  const match = page.items.find((b) => b.name === bucketName);
  if (match) return match;
  return storage.bucket.create({ name: bucketName, visibility: 'private' });
}

const SYNC_STORE_KEY = 'r2:sync:manifest';

export function createLocalSyncStore(): SyncStore {
  return {
    getItem(key: string): string | null {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key: string, value: string): void {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* ignore quota errors */
      }
    },
  };
}

export function clearLocalSyncStore(key = SYNC_STORE_KEY): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
