import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import GlassPanel from '../components/common/GlassPanel';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import EmptyState from '../components/common/EmptyState';
import Modal from '../components/common/Modal';
import { Icon } from '../components/common/Icons';
import { listModels, downloadModel, reloadModel, listExports, getExportDownloadUrl, deleteModel } from '../services/modelService';
import type { ModelInfo, ExportItem } from '../types';
import toast from 'react-hot-toast';

const SOURCE_META: Record<string, { label: string; cls: string }> = {
  system: { label: 'SYSTEM', cls: 'bg-accent/10 text-accent border-accent/20' },
  local: { label: 'LOCAL', cls: 'bg-primary/10 text-primary border-primary/20' },
  cloud: { label: 'CLOUD', cls: 'bg-success/10 text-success border-success/20' },
};

const SOURCE_ICONS: Record<string, JSX.Element> = {
  system: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 12h4" /><path d="M14 12h4" /><path d="M6 10v4" /><path d="M14 10v4" />
    </svg>
  ),
  local: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  cloud: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
      <path d="M17.5 19a4.5 4.5 0 0 0 .42-8.98 5 5 0 0 0-9.65 1.6A3.75 3.75 0 0 0 9 19h8.5z" />
    </svg>
  ),
};

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

const MAX_CLASSES_SHOW = 8;

function relativeTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo ago`;
  return `${Math.floor(month / 12)}y ago`;
}

export default function Models() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [exports, setExports] = useState<ExportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'models' | 'exports'>('models');
  const [reloading, setReloading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ModelInfo | null>(null);
  const [viewModel, setViewModel] = useState<ModelInfo | null>(null);
  const [viewExport, setViewExport] = useState<ExportItem | null>(null);
  const [showAllClasses, setShowAllClasses] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      toast.success(`Downloading ${model.filename}...`);
    } catch {
      toast.error('Download failed');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteModel(deleteTarget.path);
      toast.success(`Deleted ${deleteTarget.filename}`);
      setDeleteTarget(null);
      fetchData();
    } catch {
      toast.error('Failed to delete model');
    } finally {
      setDeleting(false);
    }
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      await reloadModel();
      toast.success('Model reloaded successfully');
    } catch {
      toast.error('Failed to reload model');
    } finally {
      setReloading(false);
    }
  };

  const copyClasses = (classes: string[]) => {
    if (classes.length === 0) return;
    navigator.clipboard.writeText(classes.join(', ')).then(() => {
      toast.success('Classes copied!');
    });
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
        <Icon name="search" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-dark-text" />
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
              {filteredModels.map((model, i) => {
                const meta = SOURCE_META[model.source || 'local'] || SOURCE_META.local;
                return (
                  <motion.div
                    key={model.path}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => { setShowAllClasses(false); setViewModel(model); }}
                    className="cursor-pointer group"
                  >
                    <GlassPanel>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:bg-primary/20 transition-colors">
                          <Icon name="models" className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-sm font-medium text-dark-heading truncate">{model.filename}</h3>
                            {model.is_system && (
                              <span className="shrink-0 text-[8px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20 font-medium uppercase tracking-wide">
                                System
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-dark-text mt-0.5">{model.size}</p>
                        </div>
                      </div>

                      {/* Meta row */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-3">
                        <span className={`inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full border font-medium ${meta.cls}`}>
                          {SOURCE_ICONS[model.source || 'local']}
                          {meta.label}
                        </span>
                        {model.created_at && (
                          <span className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full bg-dark-surface border border-dark-border text-dark-text/70">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3">
                              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                            </svg>
                            {relativeTime(model.created_at)}
                          </span>
                        )}
                      </div>

                      {model.classes && model.classes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {model.classes.slice(0, MAX_CLASSES_SHOW).map((cls) => (
                            <span key={cls} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                              {cls}
                            </span>
                          ))}
                          {model.classes.length > MAX_CLASSES_SHOW && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-dark-surface border border-dark-border text-dark-text/70">
                              +{model.classes.length - MAX_CLASSES_SHOW} more
                            </span>
                          )}
                        </div>
                      )}
                      {(!model.classes || model.classes.length === 0) && (
                        <p className="text-[10px] text-dark-text/40 mt-3">No class info</p>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 mt-4">
                        {!model.is_system && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownload(model); }}
                            className="px-3 py-1.5 rounded-lg bg-dark-surface border border-dark-border text-dark-text text-xs font-medium hover:border-dark-text/30 hover:text-dark-heading transition-all flex items-center justify-center gap-1"
                          >
                            <Icon name="download" className="w-3 h-3" />
                            Download
                          </button>
                        )}
                        {!model.is_system && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(model); }}
                            className="px-2.5 py-1.5 rounded-lg bg-dark-surface border border-dark-border text-danger hover:bg-danger/10 hover:border-danger/30 transition-all flex items-center justify-center"
                            title="Delete model"
                          >
                            <Icon name="trash" className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </GlassPanel>
                  </motion.div>
                );
              })}
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
              {filteredExports.map((exp, i) => {
                const meta = SOURCE_META[exp.source || 'local'] || SOURCE_META.local;
                return (
                  <motion.div
                    key={exp.path}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => { setShowAllClasses(false); setViewExport(exp); }}
                    className="cursor-pointer group"
                  >
                    <GlassPanel>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center text-success shrink-0 group-hover:bg-success/20 transition-colors">
                          <Icon name="box" className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-dark-heading truncate">{exp.filename}</h3>
                          <p className="text-xs text-dark-text mt-0.5">{exp.size}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 mt-3">
                        <span className={`inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full border font-medium ${meta.cls}`}>
                          {SOURCE_ICONS[exp.source || 'local']}
                          {meta.label}
                        </span>
                        {exp.created_at && (
                          <span className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full bg-dark-surface border border-dark-border text-dark-text/70">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3">
                              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                            </svg>
                            {relativeTime(exp.created_at)}
                          </span>
                        )}
                      </div>

                      {exp.classes && exp.classes.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {exp.classes.slice(0, MAX_CLASSES_SHOW).map((cls) => (
                            <span key={cls} className="text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
                              {cls}
                            </span>
                          ))}
                          {exp.classes.length > MAX_CLASSES_SHOW && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-dark-surface border border-dark-border text-dark-text/70">
                              +{exp.classes.length - MAX_CLASSES_SHOW} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-[10px] text-dark-text/40 mt-3">{exp.filename}</p>
                      )}

                      <div className="flex gap-2 mt-4">
                        <a
                          href={getExportDownloadUrl(exp.filename)}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 px-3 py-1.5 rounded-lg bg-success text-white text-xs font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center gap-1"
                        >
                          <Icon name="download" className="w-3 h-3" />
                          Download
                        </a>
                      </div>
                    </GlassPanel>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      <Modal
        open={!!viewModel}
        onClose={() => { setShowAllClasses(false); setViewModel(null); }}
        title="Model Details"
        size="md"
      >
        {viewModel && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Icon name="models" className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-dark-heading break-all leading-snug">{viewModel.filename}</h3>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${(SOURCE_META[viewModel.source || 'local'] || SOURCE_META.local).cls}`}>
                    {SOURCE_ICONS[viewModel.source || 'local']}
                    {(SOURCE_META[viewModel.source || 'local'] || SOURCE_META.local).label}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-dark-surface border border-dark-border text-dark-text/70">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3">
                      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                    </svg>
                    Created {relativeTime(viewModel.created_at)}
                  </span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-lg bg-dark-surface border border-dark-border text-center">
                <p className="text-lg font-semibold text-dark-heading">{viewModel.size.replace(/ MB$/, '')}</p>
                <p className="text-[10px] text-dark-text/60 mt-0.5">Size (MB)</p>
              </div>
              <div className="p-3 rounded-lg bg-dark-surface border border-dark-border text-center">
                <p className="text-lg font-semibold text-dark-heading">{viewModel.classes?.length ?? 0}</p>
                <p className="text-[10px] text-dark-text/60 mt-0.5">Classes</p>
              </div>
              <div className="p-3 rounded-lg bg-dark-surface border border-dark-border text-center">
                <p className="text-lg font-semibold text-dark-heading">{viewModel.is_system ? 'Yes' : 'No'}</p>
                <p className="text-[10px] text-dark-text/60 mt-0.5">System</p>
              </div>
            </div>

            {/* Created date full */}
            <div className="p-3 rounded-lg bg-dark-surface border border-dark-border">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-dark-text/60">Created at</span>
                <span className="text-xs text-dark-heading font-medium">{formatDate(viewModel.created_at)}</span>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[11px] text-dark-text/60">Path</span>
                <span className="text-[11px] text-dark-text font-mono break-all text-right">{viewModel.path}</span>
              </div>
            </div>

            {/* Classes */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-dark-text/50 mb-2">
                Classes ({viewModel.classes?.length ?? 0}){!showAllClasses && (viewModel.classes?.length ?? 0) > MAX_CLASSES_SHOW && ` · showing first ${MAX_CLASSES_SHOW}`}
              </p>
              {viewModel.classes && viewModel.classes.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {(showAllClasses ? viewModel.classes : viewModel.classes.slice(0, MAX_CLASSES_SHOW)).map((cls) => (
                      <span key={cls} className="text-[11px] px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                        {cls}
                      </span>
                    ))}
                    {!showAllClasses && viewModel.classes.length > MAX_CLASSES_SHOW && (
                      <button
                        onClick={() => setShowAllClasses(true)}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-dark-surface border border-dark-border text-dark-text hover:text-dark-heading hover:border-dark-text/30 transition-colors"
                      >
                        +{viewModel.classes.length - MAX_CLASSES_SHOW} more
                      </button>
                    )}
                  </div>
                  {showAllClasses && (
                    <button
                      onClick={() => setShowAllClasses(false)}
                      className="text-[11px] text-primary hover:underline mt-2"
                    >
                      Show less
                    </button>
                  )}
                </>
              ) : (
                <p className="text-xs text-dark-text/40">No class info available for this model</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1 border-t border-dark-border">
              <button
                onClick={() => copyClasses(viewModel.classes)}
                disabled={!viewModel.classes || viewModel.classes.length === 0}
                className="px-4 py-2.5 rounded-lg bg-dark-surface border border-dark-border text-dark-text text-sm font-medium hover:border-dark-text/30 hover:text-dark-heading transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
                  <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy Classes
              </button>
              {!viewModel.is_system && (
                <button
                  onClick={() => { setViewModel(null); handleDownload(viewModel); }}
                  className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors flex items-center justify-center gap-1.5"
                >
                  <Icon name="download" className="w-4 h-4" />
                  Download
                </button>
              )}
              <button
                onClick={() => setViewModel(null)}
                className={`py-2.5 rounded-lg border border-dark-border text-dark-text text-sm hover:bg-dark-surface transition-colors ${viewModel.is_system ? 'flex-1' : 'px-4'}`}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!viewExport}
        onClose={() => { setShowAllClasses(false); setViewExport(null); }}
        title="Export Details"
        size="md"
      >
        {viewExport && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center text-success shrink-0">
                <Icon name="box" className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-dark-heading break-all leading-snug">{viewExport.filename}</h3>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${(SOURCE_META[viewExport.source || 'local'] || SOURCE_META.local).cls}`}>
                    {SOURCE_ICONS[viewExport.source || 'local']}
                    {(SOURCE_META[viewExport.source || 'local'] || SOURCE_META.local).label}
                  </span>
                  {viewExport.created_at && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-dark-surface border border-dark-border text-dark-text/70">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3">
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                      </svg>
                      Created {relativeTime(viewExport.created_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg bg-dark-surface border border-dark-border text-center">
                <p className="text-lg font-semibold text-dark-heading">{viewExport.size.replace(/ MB$/, '')}</p>
                <p className="text-[10px] text-dark-text/60 mt-0.5">Size (MB)</p>
              </div>
              <div className="p-3 rounded-lg bg-dark-surface border border-dark-border text-center">
                <p className="text-lg font-semibold text-dark-heading">{viewExport.classes?.length ?? 0}</p>
                <p className="text-[10px] text-dark-text/60 mt-0.5">Classes</p>
              </div>
            </div>

            {/* Created date full */}
            <div className="p-3 rounded-lg bg-dark-surface border border-dark-border">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-dark-text/60">Created at</span>
                <span className="text-xs text-dark-heading font-medium">{formatDate(viewExport.created_at)}</span>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[11px] text-dark-text/60">Path</span>
                <span className="text-[11px] text-dark-text font-mono break-all text-right">{viewExport.path}</span>
              </div>
            </div>

            {/* Classes */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-dark-text/50 mb-2">
                Classes ({viewExport.classes?.length ?? 0}){!showAllClasses && (viewExport.classes?.length ?? 0) > MAX_CLASSES_SHOW && ` · showing first ${MAX_CLASSES_SHOW}`}
              </p>
              {viewExport.classes && viewExport.classes.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {(showAllClasses ? viewExport.classes : viewExport.classes.slice(0, MAX_CLASSES_SHOW)).map((cls) => (
                      <span key={cls} className="text-[11px] px-2.5 py-1 rounded-full bg-success/10 text-success border border-success/20">
                        {cls}
                      </span>
                    ))}
                    {!showAllClasses && viewExport.classes.length > MAX_CLASSES_SHOW && (
                      <button
                        onClick={() => setShowAllClasses(true)}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-dark-surface border border-dark-border text-dark-text hover:text-dark-heading hover:border-dark-text/30 transition-colors"
                      >
                        +{viewExport.classes.length - MAX_CLASSES_SHOW} more
                      </button>
                    )}
                  </div>
                  {showAllClasses && (
                    <button
                      onClick={() => setShowAllClasses(false)}
                      className="text-[11px] text-primary hover:underline mt-2"
                    >
                      Show less
                    </button>
                  )}
                </>
              ) : (
                <p className="text-xs text-dark-text/40">No class info available for this export</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1 border-t border-dark-border">
              <button
                onClick={() => copyClasses(viewExport.classes)}
                disabled={!viewExport.classes || viewExport.classes.length === 0}
                className="px-4 py-2.5 rounded-lg bg-dark-surface border border-dark-border text-dark-text text-sm font-medium hover:border-dark-text/30 hover:text-dark-heading transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
                  <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy Classes
              </button>
              <a
                href={getExportDownloadUrl(viewExport.filename)}
                onClick={() => setViewExport(null)}
                className="flex-1 py-2.5 rounded-lg bg-success text-white text-sm font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center gap-1.5"
              >
                <Icon name="download" className="w-4 h-4" />
                Download
              </a>
              <button
                onClick={() => setViewExport(null)}
                className="px-4 py-2.5 rounded-lg border border-dark-border text-dark-text text-sm hover:bg-dark-surface transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Delete Model"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-dark-text">
            Are you sure you want to delete{' '}
            <span className="text-dark-heading font-medium break-all">{deleteTarget?.filename}</span>? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="flex-1 py-2.5 rounded-lg bg-danger text-white text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
            <button
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="px-4 py-2.5 rounded-lg border border-dark-border text-dark-text text-sm hover:bg-dark-surface transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
