import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import GlassPanel from '../components/common/GlassPanel';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import EmptyState from '../components/common/EmptyState';
import { Icon } from '../components/common/Icons';
import { listModels, downloadModel, reloadModel, listExports, getExportDownloadUrl } from '../services/modelService';
import type { ModelInfo, ExportItem } from '../types';

export default function Models() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [exports, setExports] = useState<ExportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'models' | 'exports'>('models');
  const [toast, setToast] = useState('');
  const [reloading, setReloading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [modelsRes, exportsRes] = await Promise.all([
        listModels(),
        listExports().catch(() => ({ success: true, exports: [] })),
      ]);
      if (modelsRes.success) setModels(modelsRes.models);
      if (exportsRes.success) setExports(exportsRes.exports);
    } catch {
      setError('Failed to load models');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredModels = models.filter((m) =>
    m.filename.toLowerCase().includes(search.toLowerCase())
  );

  const filteredExports = exports.filter((e) =>
    e.filename.toLowerCase().includes(search.toLowerCase())
  );

  const handleDownload = async (model: ModelInfo) => {
    try {
      await downloadModel(model.path);
      showToast(`Downloading ${model.filename}...`);
    } catch {
      showToast('Download failed');
    }
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      await reloadModel();
      showToast('Model reloaded successfully');
    } catch {
      showToast('Failed to reload model');
    } finally {
      setReloading(false);
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  if (loading) return <LoadingSpinner text="Loading models..." />;
  if (error) return <ErrorMessage message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6">
      {/* Header + Tabs */}
      <GlassPanel padding={false}>
        <div className="flex items-center border-b border-dark-border">
          {(['models', 'exports'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors capitalize ${
                tab === t
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-dark-text hover:text-dark-heading'
              }`}
            >
              {t} ({t === 'models' ? models.length : exports.length})
            </button>
          ))}
          <div className="flex-1" />
          <div className="pr-4">
            <button
              onClick={handleReload}
              disabled={reloading}
              className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              <Icon name="refresh" className={`w-3 h-3 ${reloading ? 'animate-spin' : ''}`} />
              {reloading ? 'Reloading...' : 'Reload'}
            </button>
          </div>
        </div>
      </GlassPanel>

      {/* Search */}
      <div className="relative w-full sm:max-w-sm">
        <Icon
          name="search"
          className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-dark-text"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${tab}...`}
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary"
        />
      </div>

      {/* Models Tab */}
      {tab === 'models' && (
        <>
          {filteredModels.length === 0 ? (
            <EmptyState
              title="No models found"
              description={search ? 'Try a different search term' : 'No trained models yet'}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredModels.map((model, i) => (
                <motion.div
                  key={model.path}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <GlassPanel>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <Icon name="models" className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-dark-heading truncate">
                          {model.filename}
                        </h3>
                        <p className="text-xs text-dark-text mt-0.5">{model.size}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => handleDownload(model)}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-hover transition-colors flex items-center justify-center gap-1"
                      >
                        <Icon name="download" className="w-3 h-3" />
                        Download
                      </button>
                    </div>
                  </GlassPanel>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Exports Tab */}
      {tab === 'exports' && (
        <>
          {filteredExports.length === 0 ? (
            <EmptyState
              title="No exports yet"
              description="Complete training to generate exported models (.pt, .onnx, .engine, .zip)"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredExports.map((exp, i) => (
                <motion.div
                  key={exp.path}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <GlassPanel>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center text-success shrink-0">
                        <Icon name="box" className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-dark-heading truncate">
                          {exp.filename}
                        </h3>
                        <p className="text-xs text-dark-text mt-0.5">{exp.size}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <a
                        href={getExportDownloadUrl(exp.filename)}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-success text-white text-xs font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center gap-1"
                      >
                        <Icon name="download" className="w-3 h-3" />
                        Download
                      </a>
                    </div>
                  </GlassPanel>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-50 px-3 sm:px-4 py-2 rounded-lg bg-dark-surface border border-dark-border text-xs sm:text-sm text-dark-heading shadow-lg"
        >
          {toast}
        </motion.div>
      )}
    </div>
  );
}
