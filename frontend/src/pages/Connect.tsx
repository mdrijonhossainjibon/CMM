import { useState } from 'react';
import { useAppDispatch } from '../app/store';
import { setServerUrl } from '../store/slices/serverSlice';

export default function Connect() {
  const dispatch = useAppDispatch();

  const DEFAULT_URL = 'http://localhost:8000/api';
  const isDev = import.meta.env.DEV;
  const [url, setUrl] = useState(localStorage.getItem('server_api_url') || DEFAULT_URL);
  const [testing, setTesting] = useState(false);
  const [connError, setConnError] = useState('');

  const testConnection = async (targetUrl: string) => {
    try {
      const res = await fetch(`${targetUrl}/health`);
      if (res.ok) return true;
      const data = await res.json().catch(() => null);
      if (data?.status === 'ok' || data?.message) return true;
      return false;
    } catch {
      return false;
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnError('');
    const trimmed = url.trim().replace(/\/+$/, '');
    if (!trimmed) {
      setConnError('Please enter a valid URL');
      return;
    }

    setTesting(true);
    const ok = await testConnection(trimmed);
    setTesting(false);

    if (ok) {
      dispatch(setServerUrl(trimmed));
    } else {
      setConnError('Cannot reach the backend. Check the URL and try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-bg px-4">
      <div className="w-full max-w-sm glass rounded-2xl p-8">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white text-lg font-bold mx-auto mb-3">
            CM
          </div>
          <h1 className="text-xl font-semibold text-dark-heading">
            Connect to Backend
          </h1>
          <p className="text-sm text-dark-text mt-1">
            Enter the API server URL to get started
          </p>
        </div>

        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <label className="block text-xs text-dark-text mb-1">API Base URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setConnError('');
              }}
              placeholder="http://localhost:8000/api"
              className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary transition-colors"
              autoFocus
            />
          </div>

          {connError && <p className="text-xs text-red-400">{connError}</p>}

          <button
            type="submit"
            disabled={testing}
            className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {testing ? 'Testing connection...' : 'Connect'}
          </button>
        </form>

        <p className="text-center text-xs text-dark-text mt-4">Default: {DEFAULT_URL}</p>

        {isDev && (
          <button
            onClick={() => dispatch(setServerUrl(DEFAULT_URL))}
            className="w-full mt-3 py-2 rounded-lg border border-dark-border text-dark-text text-xs hover:bg-dark-surface transition-colors"
          >
            Quick Connect (Dev Mode)
          </button>
        )}
      </div>
    </div>
  );
}
