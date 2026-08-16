import { useState, useEffect, useRef } from 'react';
import Modal from '../common/Modal';
import { Icon } from '../common/Icons';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { toggleTheme } from '../../store/slices/themeSlice';
import { logout } from '../../store/slices/authSlice';
import { setServerUrl } from '../../store/slices/serverSlice';
import { updateBaseURL, isNgrokUrl } from '../../services/apiClient';
import { useNavigate } from 'react-router-dom';

interface TopbarProps {
  title: string;
  onToggleSidebar?: () => void;
}

export default function Topbar({ title, onToggleSidebar }: TopbarProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { theme } = useAppSelector((state) => state.theme);
  const { serverUrl } = useAppSelector((state) => state.server);
  const { username, role } = useAppSelector((state) => state.auth);
  const [modalOpen, setModalOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [connError, setConnError] = useState('');
  const [connOk, setConnOk] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanDisplayUrl = (url: string) => {
    if (!url) return '';
    return url.replace(/\/+$/, '').replace(/\/api$/, '').replace(/^https?:\/\//, '');
  };

  const openModal = () => {
    setUrlInput(cleanDisplayUrl(serverUrl));
    setConnError('');
    setConnOk(false);
    setModalOpen(true);
  };

  const testConnection = async (targetUrl: string) => {
    try {
      const headers: Record<string, string> = {};
      if (isNgrokUrl(targetUrl)) headers['ngrok-skip-browser-warning'] = '1';
      const res = await fetch(`${targetUrl}/health`, { headers });
      const data = await res.json().catch(() => null);
      return data?.status === 'ok';
    } catch {
      return false;
    }
  };

  const normalizeUrl = (raw: string) => {
    let url = raw.trim().replace(/\/+$/, '');
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
      url = 'http://' + url;
    }
    if (!url.endsWith('/api')) {
      url = url.replace(/\/+$/, '') + '/api';
    }
    return url;
  };

  const doConnect = async (url: string) => {
    const trimmed = normalizeUrl(url);
    if (!trimmed || trimmed === serverUrl) {
      setConnError('');
      setConnOk(!!trimmed && trimmed === serverUrl);
      return;
    }

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

  useEffect(() => {
    if (!connOk) return;
    const timer = setTimeout(() => setModalOpen(false), 600);
    return () => clearTimeout(timer);
  }, [connOk]);

  const handleUrlChange = (value: string) => {
    setUrlInput(value);
    setConnError('');
    setConnOk(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const normalized = normalizeUrl(value);
    if (!normalized) return;

    debounceRef.current = setTimeout(() => doConnect(value), 500);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <>
      <header
        className="sticky top-0 z-20 flex items-center justify-between h-14 lg:h-16 px-3 sm:px-4 lg:px-6 border-b border-dark-border backdrop-blur-md"
        style={{ background: 'var(--color-dark-topbar, rgba(18,18,24,0.8))' }}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="lg:hidden p-1.5 rounded-lg text-dark-text hover:bg-dark-surface hover:text-dark-heading transition-colors shrink-0"
            >
              <Icon name="layout" className="w-5 h-5" />
            </button>
          )}
          <img
            src="/logo.png"
            alt="CaptchaMaster"
            width={28}
            height={28}
            className="rounded object-contain shrink-0"
          />
          <h1 className="text-sm sm:text-lg font-semibold text-dark-heading truncate">{title}</h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            onClick={openModal}
            className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-dark-surface transition-colors group"
            title="Change backend server URL"
          >
            <Icon name="wifi" className={`w-3 h-3 ${serverUrl ? 'text-green-400' : 'text-red-400'}`} />
            <span className="text-[10px] sm:text-xs text-dark-text group-hover:text-dark-heading truncate max-w-[100px] sm:max-w-[150px] lg:max-w-[200px]">
              {serverUrl ? serverUrl.replace(/https?:\/\//, '').replace(/\/api$/, '') : 'Set URL'}
            </span>
            <Icon name="settings" className="w-2.5 h-2.5 text-dark-text/30 group-hover:text-dark-text" />
          </button>

          <button
            onClick={() => dispatch(toggleTheme())}
            className="p-1.5 sm:p-2 rounded-lg text-dark-text hover:bg-dark-surface hover:text-dark-heading transition-colors"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {username && (
            <div className="flex items-center gap-2 pl-2 border-l border-dark-border">
              <span className="text-[10px] sm:text-xs text-dark-text truncate max-w-[80px] sm:max-w-[120px]">
                {username}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium uppercase">
                {role}
              </span>
            </div>
          )}

          <button
            onClick={() => { dispatch(logout()); navigate('/login'); }}
            className="p-1.5 sm:p-2 rounded-lg text-dark-text hover:bg-red-500/10 hover:text-red-400 transition-colors"
            title="Logout"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
          </button>
        </div>
      </header>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Server Connection" size="sm">
        <div className="text-center mb-5">
          <div className={`w-11 h-11 rounded-xl border flex items-center justify-center mx-auto mb-3 transition-colors ${
            connOk ? 'bg-success/10 border-success/30' : testing ? 'bg-warning/10 border-warning/30' : connError ? 'bg-danger/10 border-danger/30' : 'bg-primary/10 border-primary/20'
          }`}>
            {connOk ? (
              <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : testing ? (
              <svg className="w-5 h-5 text-warning animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : connError ? (
              <svg className="w-5 h-5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z" />
              </svg>
            )}
          </div>
          <p className="text-xs text-dark-text">
            {connOk ? 'Connected successfully!' : testing ? 'Testing connection...' : 'Enter the backend API server URL'}
          </p>
        </div>

        <div>
          <div className="relative">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="localhost:8000"
              className={`w-full px-3 py-2.5 rounded-lg bg-dark-surface border text-dark-heading text-sm focus:outline-none focus:ring-1 transition-all ${
                connOk ? 'border-success/50 focus:border-success focus:ring-success/30' :
                connError ? 'border-danger/50 focus:border-danger focus:ring-danger/30' :
                testing ? 'border-warning/50' :
                'border-dark-border focus:border-primary focus:ring-primary/30'
              }`}
              autoFocus
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {connOk && (
                <span className="w-4 h-4 rounded-full bg-success flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              )}
              {testing && (
                <span className="w-4 h-4 rounded-full border-2 border-warning border-t-transparent animate-spin" />
              )}
            </div>
          </div>
          <p className="text-[10px] text-dark-text/50 mt-1.5">
            {connOk ? 'Auto-closing...' : 'localhost:8000 — /api auto-add hoye jabe'}
          </p>
        </div>

        {connError && (
          <p className="text-xs text-danger flex items-center gap-1.5 bg-danger/5 border border-danger/10 rounded-lg px-3 py-2 mt-3">
            <Icon name="alertTriangle" className="w-3 h-3 shrink-0" />
            {connError}
          </p>
        )}
      </Modal>
    </>
  );
}
