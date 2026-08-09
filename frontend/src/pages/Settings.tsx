import { useState } from 'react';
import GlassPanel from '../components/common/GlassPanel';
import { Icon } from '../components/common/Icons';
import { useAppDispatch, useAppSelector } from '../app/store';
import { toggleTheme } from '../store/slices/themeSlice';
import { setServerUrl } from '../store/slices/serverSlice';

export default function Settings() {
  const dispatch = useAppDispatch();
  const { theme } = useAppSelector((state) => state.theme);
  const { serverUrl } = useAppSelector((state) => state.server);
  const [editUrl, setEditUrl] = useState(serverUrl);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const trimmed = editUrl.trim().replace(/\/+$/, '');
    dispatch(setServerUrl(trimmed));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4 sm:space-y-6 sm:max-w-2xl">
      <GlassPanel>
        <h2 className="text-base font-semibold text-dark-heading mb-4">Server Connection</h2>
        <div>
          <label className="block text-sm text-dark-heading mb-1">API Base URL</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <p className="text-xs text-dark-text mt-1">
            Change the backend API server URL. Default: http://localhost:8000/api
          </p>
        </div>
      </GlassPanel>

      <GlassPanel>
        <h2 className="text-base font-semibold text-dark-heading mb-4">Appearance</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-dark-heading">Theme</p>
            <p className="text-xs text-dark-text">Switch between dark and light mode</p>
          </div>
          <button
            onClick={() => dispatch(toggleTheme())}
            className="px-4 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-text text-sm hover:bg-dark-surface/80 transition-colors flex items-center gap-2"
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="w-4 h-4" />
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>
      </GlassPanel>

      <GlassPanel>
        <h2 className="text-base font-semibold text-dark-heading mb-4">Detection</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-dark-heading mb-1">Default Confidence Threshold</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              defaultValue={0.5}
              className="w-full max-w-xs"
            />
          </div>
        </div>
      </GlassPanel>

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
        >
          Save Settings
        </button>
        {saved && <span className="text-xs text-green-400 self-center">Settings saved!</span>}
      </div>
    </div>
  );
}
