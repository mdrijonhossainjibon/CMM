import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassPanel from '../components/common/GlassPanel';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import Modal from '../components/common/Modal';
import { Icon } from '../components/common/Icons';
import toast from 'react-hot-toast';
import {
  uploadZipDataset,
  listZipDatasets,
  getZipDataset,
  getZipTrainingRecords,
  deleteZipDataset,
  rebuildZipMetadata,
  getZipBackupUrl,
} from '../services/datasetService';
import type {
  ZipDatasetMetadata,
  ZipDatasetSummary,
  ZipTrainingRecord,
} from '../types';

const MAX_ZIP_MB = 1024;
const MAX_ZIP_BYTES = MAX_ZIP_MB * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

export default function ZipDatasets() {
  const [tab, setTab] = useState<'upload' | 'manage'>('upload');

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [className, setClassName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Manage state
  const [datasets, setDatasets] = useState<ZipDatasetSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [detailDataset, setDetailDataset] = useState<ZipDatasetMetadata | null>(null);
  const [detailRecords, setDetailRecords] = useState<ZipTrainingRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ZipDatasetSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchDatasets = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await listZipDatasets();
      setDatasets(res.datasets);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load datasets');
      setDatasets([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  const stats = {
    totalDatasets: datasets.length,
    totalImages: datasets.reduce((acc, d) => acc + d.totalImages, 0),
    totalClasses: datasets.reduce((acc, d) => acc + d.totalClasses, 0),
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) validateAndSet(dropped);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) validateAndSet(picked);
    if (fileRef.current) fileRef.current.value = '';
  };

  const validateAndSet = (f: File) => {
    if (!f.name.toLowerCase().endsWith('.zip')) {
      toast.error('Only .zip files are allowed');
      return;
    }
    if (f.size > MAX_ZIP_BYTES) {
      toast.error(`ZIP too large. Maximum size is ${MAX_ZIP_MB}MB`);
      return;
    }
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a ZIP file');
      return;
    }
    setUploading(true);
    try {
      const res = await uploadZipDataset(file, className);
      toast.success(`Dataset "${res.dataset.datasetId}" uploaded! ${res.dataset.totalImages} images across ${res.dataset.totalClasses} classes`);
      setFile(null);
      setClassName('');
      fetchDatasets();
      setTab('manage');
      const detail = await getZipDataset(res.dataset.datasetId);
      setDetailDataset(detail.dataset);
      setDetailVisible(true);
    } catch (e: any) {
      toast.error(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const openDetail = async (datasetId: string) => {
    setDetailVisible(true);
    setDetailLoading(true);
    setDetailRecords([]);
    setDetailDataset(null);
    try {
      const [d, r] = await Promise.all([
        getZipDataset(datasetId),
        getZipTrainingRecords(datasetId),
      ]);
      setDetailDataset(d.dataset);
      setDetailRecords(r.records || []);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load dataset details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setBusyId(confirmDelete.datasetId);
    try {
      await deleteZipDataset(confirmDelete.datasetId);
      toast.success(`Dataset "${confirmDelete.datasetId}" deleted`);
      setDatasets((prev) => prev.filter((d) => d.datasetId !== confirmDelete.datasetId));
      setConfirmDelete(null);
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleRebuild = async (datasetId: string) => {
    setBusyId(datasetId);
    try {
      const res = await rebuildZipMetadata(datasetId);
      toast.success(`Metadata rebuilt: ${res.dataset.totalImages} images, ${res.dataset.totalClasses} classes`);
      fetchDatasets();
      if (detailDataset?.datasetId === datasetId) setDetailDataset(res.dataset);
    } catch (e: any) {
      toast.error(e?.message || 'Rebuild failed');
    } finally {
      setBusyId(null);
    }
  };

  const statusPill = (status: string) =>
    status === 'valid' ? (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Valid
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" /> Empty
      </span>
    );

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <GlassPanel padding={false}>
        <div className="flex border-b border-dark-border overflow-x-auto">
          {(['upload', 'manage'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 sm:px-6 py-3 text-xs sm:text-sm font-medium transition-colors capitalize whitespace-nowrap flex items-center gap-2 ${
                tab === t ? 'text-primary border-b-2 border-primary' : 'text-dark-text hover:text-dark-heading'
              }`}
            >
              <Icon name={t === 'upload' ? 'upload' : 'datasets'} className="w-4 h-4" />
              {t === 'upload' ? 'Upload ZIP' : `Manage Datasets`}
              {t === 'manage' ? ` (${datasets.length})` : ''}
            </button>
          ))}
        </div>
      </GlassPanel>

      {tab === 'upload' && (
        <div className="space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { label: 'Datasets', value: stats.totalDatasets, icon: 'datasets' as const },
              { label: 'Images', value: stats.totalImages, icon: 'images' as const },
              { label: 'Classes', value: stats.totalClasses, icon: 'box' as const },
            ].map((s) => (
              <div key={s.label} className="glass rounded-xl p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
                <Icon name={s.icon} className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-base sm:text-xl font-semibold text-dark-heading leading-tight">{s.value}</p>
                  <p className="text-[10px] sm:text-xs text-dark-text truncate">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          <GlassPanel>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-dark-heading">Upload Dataset (ZIP)</h2>
                <p className="text-xs text-dark-text mt-0.5">
                  Top-level folders automatically become class labels
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-dark-text mb-1.5">Dataset Name (optional)</label>
              <input
                type="text"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="e.g. Animal Classification"
                className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary"
              />
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 sm:p-10 text-center cursor-pointer transition-all relative overflow-hidden ${
                dragOver ? 'border-primary bg-primary/5' : 'border-dark-border hover:border-primary/50 hover:bg-dark-surface'
              }`}
            >
              <input ref={fileRef} type="file" accept=".zip,application/zip" onChange={handleFileChange} className="hidden" />

              <AnimatePresence mode="wait">
                {file ? (
                  <motion.div
                    key="file"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex flex-col items-center"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mb-3">
                      <Icon name="fileText" className="w-7 h-7 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-dark-heading break-all max-w-md">{file.name}</p>
                    <p className="text-xs text-dark-text mt-1">{formatBytes(file.size)}</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); setFile(null); }}
                      className="mt-3 text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                    >
                      <Icon name="x" className="w-3.5 h-3.5" /> Remove
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center"
                  >
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-dark-surface border border-dark-border flex items-center justify-center mb-3">
                      <Icon name="box" className="w-7 h-7 sm:w-8 sm:h-8 text-dark-text/50" />
                    </div>
                    <p className="text-sm text-dark-text">
                      {dragOver ? 'Drop the ZIP here' : 'Drag & drop a ZIP file, or click to browse'}
                    </p>
                    <p className="text-xs text-dark-text/60 mt-1">
                      JPG · JPEG · PNG · WEBP · BMP &nbsp;|&nbsp; up to {MAX_ZIP_MB}MB
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Expected structure preview */}
            <div className="mt-4 rounded-xl bg-dark-surface/60 border border-dark-border overflow-hidden">
              <div className="px-3 py-2 border-b border-dark-border flex items-center gap-2">
                <Icon name="info" className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium text-dark-heading">Expected ZIP structure</span>
              </div>
              <pre className="p-3 text-[11px] sm:text-xs leading-relaxed text-dark-text/80 overflow-x-auto">
{`dataset.zip
├── cat/
│   ├── 1.jpg
│   └── 2.jpg
├── dog/
│   ├── 1.jpg
│   └── 2.jpg
└── bird/
    └── 1.jpg`}
              </pre>
              <div className="px-3 py-2 border-t border-dark-border text-[11px] text-dark-text/70 flex flex-wrap gap-x-4 gap-y-1">
                <span>• Each folder = class label</span>
                <span>• Unsupported files auto-skipped</span>
                <span>• Original ZIP kept as backup</span>
              </div>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <button
                onClick={handleUpload}
                disabled={uploading || !file}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon name="upload" className={`w-4 h-4 ${uploading ? 'animate-bounce' : ''}`} />
                {uploading ? 'Processing...' : 'Upload & Process Dataset'}
              </button>
              <p className="text-xs text-dark-text">
                {uploading ? 'Extracting, scanning & building metadata…' : 'Files are validated, extracted and indexed automatically.'}
              </p>
            </div>
          </GlassPanel>
        </div>
      )}

      {tab === 'manage' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-dark-text">
              {stats.totalImages.toLocaleString()} images · {stats.totalClasses.toLocaleString()} classes across {datasets.length} dataset(s)
            </p>
            <button
              onClick={fetchDatasets}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-dark-border text-dark-text hover:text-dark-heading hover:bg-dark-surface transition-colors"
            >
              <Icon name="refresh" className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {listLoading ? (
            <LoadingSpinner text="Loading datasets..." />
          ) : datasets.length === 0 ? (
            <EmptyState
              icon="datasets"
              title="No datasets uploaded"
              description="Upload a ZIP dataset to get started — folders become class labels automatically."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {datasets.map((d, i) => (
                <motion.div
                  key={d.datasetId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="glass rounded-xl p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-dark-heading font-mono">{shortId(d.datasetId)}</p>
                        {statusPill(d.status)}
                      </div>
                      {d.className && <p className="text-xs text-primary mt-0.5 truncate">{d.className}</p>}
                      {d.created_at && (
                        <p className="text-[11px] text-dark-text/60 mt-0.5">{new Date(d.created_at).toLocaleString()}</p>
                      )}
                    </div>
                    <button
                      onClick={() => openDetail(d.datasetId)}
                      className="shrink-0 text-xs px-2.5 py-1 rounded-lg bg-dark-surface border border-dark-border text-dark-text hover:text-dark-heading hover:border-primary/40 transition-colors"
                    >
                      Details
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-dark-surface/70 border border-dark-border px-3 py-2">
                      <p className="text-lg font-semibold text-dark-heading">{d.totalClasses}</p>
                      <p className="text-[11px] text-dark-text">Classes</p>
                    </div>
                    <div className="rounded-lg bg-dark-surface/70 border border-dark-border px-3 py-2">
                      <p className="text-lg font-semibold text-dark-heading">{d.totalImages.toLocaleString()}</p>
                      <p className="text-[11px] text-dark-text">Images</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1 border-t border-dark-border">
                    <a
                      href={getZipBackupUrl(d.datasetId)}
                      download={`${d.datasetId}.zip`}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] px-2 py-1.5 rounded-lg border border-dark-border text-dark-text hover:text-dark-heading hover:bg-dark-surface transition-colors"
                      title="Download original backup ZIP"
                    >
                      <Icon name="download" className="w-3.5 h-3.5" /> Backup
                    </a>
                    <button
                      onClick={() => handleRebuild(d.datasetId)}
                      disabled={busyId === d.datasetId}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] px-2 py-1.5 rounded-lg border border-dark-border text-dark-text hover:text-dark-heading hover:bg-dark-surface transition-colors disabled:opacity-50"
                      title="Rebuild metadata"
                    >
                      <Icon name="refresh" className={`w-3.5 h-3.5 ${busyId === d.datasetId ? 'animate-spin' : ''}`} /> Rebuild
                    </button>
                    <button
                      onClick={() => setConfirmDelete(d)}
                      disabled={busyId === d.datasetId}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] px-2 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      title="Delete dataset"
                    >
                      <Icon name="trash" className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail modal */}
      <Modal open={detailVisible} onClose={() => setDetailVisible(false)} title="Dataset Details" size="lg">
        {detailLoading ? (
          <LoadingSpinner text="Loading dataset..." />
        ) : detailDataset ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-mono text-dark-heading">{detailDataset.datasetId}</p>
              {statusPill(detailDataset.status)}
              {detailDataset.className && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {detailDataset.className}
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-dark-surface/70 border border-dark-border px-3 py-2 text-center">
                <p className="text-lg font-semibold text-dark-heading">{detailDataset.totalClasses}</p>
                <p className="text-[11px] text-dark-text">Classes</p>
              </div>
              <div className="rounded-lg bg-dark-surface/70 border border-dark-border px-3 py-2 text-center">
                <p className="text-lg font-semibold text-dark-heading">{detailDataset.totalImages.toLocaleString()}</p>
                <p className="text-[11px] text-dark-text">Images</p>
              </div>
              <div className="rounded-lg bg-dark-surface/70 border border-dark-border px-3 py-2 text-center">
                <p className="text-lg font-semibold text-dark-heading">{detailRecords.length.toLocaleString()}</p>
                <p className="text-[11px] text-dark-text">Records</p>
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-dark-text/50 mb-2">Class breakdown</p>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {detailDataset.classes.map((c) => {
                  const pct = detailDataset.totalImages
                    ? Math.round((c.images / detailDataset.totalImages) * 100)
                    : 0;
                  return (
                    <div key={c.name}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-dark-heading font-medium">{c.name}</span>
                        <span className="text-dark-text">{c.images.toLocaleString()} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-dark-surface overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          className="h-full rounded-full bg-primary"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end pt-2 border-t border-dark-border">
              <a
                href={getZipBackupUrl(detailDataset.datasetId)}
                download={`${detailDataset.datasetId}.zip`}
                className="inline-flex items-center justify-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-dark-border text-dark-text hover:text-dark-heading hover:bg-dark-surface transition-colors"
              >
                <Icon name="download" className="w-4 h-4" /> Download Backup
              </a>
              <button
                onClick={() => handleRebuild(detailDataset.datasetId)}
                disabled={busyId === detailDataset.datasetId}
                className="inline-flex items-center justify-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-dark-border text-dark-text hover:text-dark-heading hover:bg-dark-surface transition-colors disabled:opacity-50"
              >
                <Icon name="refresh" className={`w-4 h-4 ${busyId === detailDataset.datasetId ? 'animate-spin' : ''}`} />
                Rebuild Metadata
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-dark-text">Could not load dataset details.</p>
        )}
      </Modal>

      {/* Delete confirm modal */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Dataset"
        size="sm"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 flex items-start gap-2">
            <Icon name="alertTriangle" className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-xs text-dark-text">
              This will permanently delete dataset{' '}
              <span className="text-dark-heading font-mono">{confirmDelete?.datasetId}</span>, including all{' '}
              {confirmDelete?.totalImages.toLocaleString()} extracted images and the original backup ZIP. This cannot be undone.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={busyId === confirmDelete?.datasetId}
              className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {busyId === confirmDelete?.datasetId ? 'Deleting...' : 'Delete'}
            </button>
            <button
              onClick={() => setConfirmDelete(null)}
              className="px-4 py-2 rounded-lg border border-dark-border text-dark-text text-sm hover:bg-dark-surface transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
