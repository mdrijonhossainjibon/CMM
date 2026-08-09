import { useState, useRef, useEffect } from 'react';
import { Icon } from '../common/Icons';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { toggleTheme } from '../../store/slices/themeSlice';
import { setServerUrl } from '../../store/slices/serverSlice';
import { updateBaseURL } from '../../services/apiClient';

interface TopbarProps {
  title: string;
  onToggleSidebar?: () => void;
}

export default function Topbar({ title, onToggleSidebar }: TopbarProps) {
  const dispatch = useAppDispatch();
  const { theme } = useAppSelector((state) => state.theme);
  const { serverUrl } = useAppSelector((state) => state.server);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingUrl && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingUrl]);

  const startEdit = () => {
    setUrlInput(serverUrl);
    setEditingUrl(true);
  };

  const saveUrl = () => {
    const trimmed = urlInput.trim();
    if (trimmed && trimmed !== serverUrl) {
      dispatch(setServerUrl(trimmed));
      updateBaseURL(trimmed);
    }
    setEditingUrl(false);
  };

  const cancelEdit = () => {
    setEditingUrl(false);
  };

  return (
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
        <h1 className="text-sm sm:text-lg font-semibold text-dark-heading truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {editingUrl ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveUrl(); if (e.key === 'Escape') cancelEdit(); }}
              placeholder="http://server-ip:8000/api"
              className="w-[160px] sm:w-[220px] lg:w-[260px] px-2 py-1 text-[10px] sm:text-xs rounded-lg bg-dark-surface border border-primary text-dark-heading focus:outline-none"
            />
            <button onClick={saveUrl} className="p-1 rounded text-green-400 hover:bg-dark-surface">
              <Icon name="check" className="w-3.5 h-3.5" />
            </button>
            <button onClick={cancelEdit} className="p-1 rounded text-dark-text hover:bg-dark-surface">
              <Icon name="x" className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={startEdit}
            className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-dark-surface transition-colors group"
            title="Click to change backend URL"
          >
            <Icon name="wifi" className={`w-3 h-3 ${serverUrl ? 'text-green-400' : 'text-red-400'}`} />
            <span className="text-[10px] sm:text-xs text-dark-text group-hover:text-dark-heading truncate max-w-[100px] sm:max-w-[150px] lg:max-w-[200px]">
              {serverUrl ? serverUrl.replace(/https?:\/\//, '').replace(/\/api$/, '') : 'Set URL'}
            </span>
            <Icon name="settings" className="w-2.5 h-2.5 text-dark-text/30 group-hover:text-dark-text" />
          </button>
        )}

        <button
          onClick={() => dispatch(toggleTheme())}
          className="p-1.5 sm:p-2 rounded-lg text-dark-text hover:bg-dark-surface hover:text-dark-heading transition-colors"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>
    </header>
  );
}
