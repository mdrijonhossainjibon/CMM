import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

function isNgrokUrl(url: string): boolean {
  return /ngrok(-free)?\.(app|io|dev)/i.test(url) || url.includes('ngrok');
}

function getBaseURL(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;

  if (import.meta.env.DEV) {
    return localStorage.getItem('server_api_url') || 'http://localhost:8000/api';
  }
  return localStorage.getItem('server_api_url') || '/api';
}

const client = axios.create({
  baseURL: getBaseURL(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const base = client.defaults.baseURL || '';
  if (isNgrokUrl(base) && config.headers) {
    config.headers['ngrok-skip-browser-warning'] = '1';
  }
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (res) => res,
  async (err: AxiosError<{ success?: boolean; message?: string; detail?: string }>) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('username');
      localStorage.removeItem('role');
    }

    const message =
      err.response?.data?.message ||
      err.response?.data?.detail ||
      err.message ||
      'An unexpected error occurred';

    const enrichedError = new Error(message);
    (enrichedError as Error & { status?: number }).status = err.response?.status;
    (enrichedError as Error & { data?: unknown }).data = err.response?.data;
    return Promise.reject(enrichedError);
  }
);

export function updateBaseURL(url: string) {
  client.defaults.baseURL = url;
}

export function getAssetUrl(path: string): string {
  const base = (client.defaults.baseURL || '').replace(/\/+$/, '');
  if (!base) return path;
  let clean = path.replace(/^\/+/, '');
  // base e /api thakle path er api/ prefix duplicate korbe na
  if (base.endsWith('/api') && clean.startsWith('api/')) {
    clean = clean.slice(4);
  }
  return `${base}/${clean}`;
}

export function getWsBaseURL(): string {
  const envWsUrl = import.meta.env.VITE_WS_URL;
  if (envWsUrl) return envWsUrl;

  if (import.meta.env.DEV) {
    const apiUrl = localStorage.getItem('server_api_url') || 'http://localhost:8000/api';
    return apiUrl.replace(/^http/, 'ws').replace(/\/api$/, '');
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

export default client;
