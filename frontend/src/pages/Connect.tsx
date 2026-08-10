import { useState, useEffect, useRef } from 'react';
import { useAppDispatch } from '../app/store';
import { setServerUrl } from '../store/slices/serverSlice';
import { updateBaseURL } from '../services/apiClient';

const DEFAULT_URL = 'http://localhost:8000/api';

export default function Connect() {
  const dispatch = useAppDispatch();
  const [url, setUrl] = useState(localStorage.getItem('server_api_url') || 'localhost:8000');
  const [testing, setTesting] = useState(false);
  const [connError, setConnError] = useState('');
  const [connOk, setConnOk] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalizeUrl = (raw: string) => {
    let u = raw.trim().replace(/\/+$/, '');
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
    if (!u.endsWith('/api')) u = u.replace(/\/+$/, '') + '/api';
    return u;
  };

  const testConnection = async (targetUrl: string) => {
    try {
      const res = await fetch(`${targetUrl}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return true;
      const data = await res.json().catch(() => null);
      if (data?.status === 'ok') return true;
      return false;
    } catch {
      return false;
    }
  };

  const doConnect = async (raw: string) => {
    const trimmed = normalizeUrl(raw);
    if (!trimmed) return;

    setTesting(true);
    setConnError('');
    setConnOk(false);

    const ok = await testConnection(trimmed);
    setTesting(false);

    if (ok) {
      dispatch(setServerUrl(trimmed));
      updateBaseURL(trimmed);
      setConnOk(true);
    } else {
      setConnError('Cannot reach the backend. Check the URL and try again.');
    }
  };

  const handleChange = (value: string) => {
    setUrl(value);
    setConnError('');
    setConnOk(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) return;
    debounceRef.current = setTimeout(() => doConnect(value), 600);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Fast connect: try current stored URL on mount
  useEffect(() => {
    const stored = localStorage.getItem('server_api_url');
    if (stored) {
      doConnect(stored);
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-bg px-4">
      <div className="w-full max-w-sm rounded-2xl p-8 border border-dark-border shadow-2xl"
        style={{ background: 'var(--color-dark-card, #22222e)' }}
      >
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
            <img src="/logo.png" alt="CaptchaMaster" className="w-9 h-9 rounded-lg object-contain" />
          </div>
          <h1 className="text-xl font-semibold text-dark-heading">
            Connect to Backend
          </h1>
          <p className="text-sm text-dark-text mt-1">
            Enter the server address to get started
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-dark-text mb-1.5 font-medium">Server Address</label>
            <div className="relative">
              <input
                type="text"
                value={url}
                onChange={(e) => handleChange(e.target.value)}
                placeholder="localhost:8000"
                autoFocus
                className={`w-full px-3 py-2.5 rounded-lg bg-dark-surface border text-dark-heading text-sm focus:outline-none focus:ring-1 transition-all ${
                  connOk
                    ? 'border-success/50 focus:border-success focus:ring-success/30'
                    : connError
                    ? 'border-danger/50 focus:border-danger focus:ring-danger/30'
                    : testing
                    ? 'border-warning/50'
                    : 'border-dark-border focus:border-primary focus:ring-primary/30'
                }`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {connOk && (
                  <span className="w-4 h-4 rounded-full bg-success flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                )}
                {testing && <span className="w-4 h-4 rounded-full border-2 border-warning border-t-transparent animate-spin" />}
              </div>
            </div>
            <p className="text-[10px] text-dark-text/50 mt-1.5">
              {connOk ? 'Connected!' : connError ? '' : 'localhost:8000 likhun — /api auto-add hoye jabe'}
            </p>
          </div>

          {connError && (
            <p className="text-xs text-danger flex items-center gap-1.5 bg-danger/5 border border-danger/10 rounded-lg px-3 py-2">
              <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {connError}
            </p>
          )}

          <div className="text-center">
            <p className="text-[10px] text-dark-text/40">Default: {DEFAULT_URL}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
