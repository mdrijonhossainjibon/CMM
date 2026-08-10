import { useState, useEffect, useCallback } from 'react';
import { Select } from 'antd';
import GlassPanel from '../components/common/GlassPanel';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import EmptyState from '../components/common/EmptyState';
import Modal from '../components/common/Modal';
import { getTrainImages, getValImages, deleteDataset, deleteDatasetImage, deleteDatasetClass } from '../services/datasetService';
import { Icon } from '../components/common/Icons';
import type { DatasetImageResponse } from '../types';
import toast from 'react-hot-toast';

type Tab = 'train' | 'val';

function parseClass(filename: string): string {
  if (!filename.includes('_')) return 'unknown';
  return filename.split('_')[0];
}

export default function Datasets() {
  const [tab, setTab] = useState<Tab>('train');
  const [trainData, setTrainData] = useState<DatasetImageResponse | null>(null);
  const [valData, setValData] = useState<DatasetImageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [confirmDeleteClass, setConfirmDeleteClass] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deletingClass, setDeletingClass] = useState(false);
  const [selectedClass, setSelectedClass] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [train, val] = await Promise.all([getTrainImages(), getValImages()]);
      setTrainData(train);
      setValData(val);
    } catch {
      setError('Failed to load dataset images');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const currentData = tab === 'train' ? trainData : valData;
  const images = currentData?.images ?? [];
  const isUploaded = currentData?.source === 'training_data';
  const classes = currentData?.classes ?? [];
  const imageDir = tab;

  const handleDeleteImage = async (filename: string) => {
    setDeleting(true);
    try {
      if (isUploaded) {
        const { deleteTrainingImage } = await import('../services/trainingDataService');
        await deleteTrainingImage(filename);
      } else {
        await deleteDatasetImage(imageDir, filename);
      }
      toast.success(`Deleted ${filename}`);
      setConfirmTarget(null);
      fetchData();
    } catch {
      toast.error('Failed to delete image');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    if (isUploaded) {
      toast.error('Uploaded data er jonno Data Upload page e delete use koren');
      setConfirmDeleteAll(false);
      return;
    }
    setDeletingAll(true);
    try {
      const res = await deleteDataset(imageDir);
      toast.success(`Deleted ${res.deleted_count} image(s)`);
      setConfirmDeleteAll(false);
      fetchData();
    } catch {
      toast.error('Failed to delete dataset');
    } finally {
      setDeletingAll(false);
    }
  };

  const handleDeleteClass = async () => {
    if (!selectedClass) return;
    if (isUploaded) {
      const { deleteTrainingClass } = await import('../services/trainingDataService');
      setDeletingClass(true);
      try {
        await deleteTrainingClass(selectedClass);
        toast.success(`Deleted class "${selectedClass}"`);
        setConfirmDeleteClass(false);
        setSelectedClass('');
        fetchData();
      } catch {
        toast.error('Failed to delete class');
      } finally {
        setDeletingClass(false);
      }
      return;
    }
    setDeletingClass(true);
    try {
      const res = await deleteDatasetClass(imageDir, selectedClass);
      toast.success(`Deleted ${res.deleted_count} image(s) of class "${selectedClass}"`);
      setConfirmDeleteClass(false);
      setSelectedClass('');
      fetchData();
    } catch {
      toast.error('Failed to delete class');
    } finally {
      setDeletingClass(false);
    }
  };

  if (loading) return <LoadingSpinner text="Loading datasets..." />;
  if (error) return <ErrorMessage message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6">
      <GlassPanel padding={false}>
        <div className="flex border-b border-dark-border items-center">
          <div className="flex flex-1">
            {(['train', 'val'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors ${
                  tab === t ? 'text-primary border-b-2 border-primary' : 'text-dark-text hover:text-dark-heading'
                }`}
              >
                {t === 'train' ? 'Training' : 'Validation'} ({t === 'train' ? trainData?.count ?? 0 : valData?.count ?? 0})
              </button>
            ))}
          </div>
          {!isUploaded && images.length > 0 && (
            <button
              onClick={() => setConfirmDeleteAll(true)}
              className="mr-3 flex items-center gap-1 text-[11px] sm:text-xs text-danger px-2 py-1.5 rounded-lg hover:bg-danger/10 transition-colors"
            >
              <Icon name="trash" className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Delete All</span>
            </button>
          )}
        </div>
      </GlassPanel>

      {classes.length > 0 && (
        <GlassPanel>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <div className="flex-1 min-w-0">
              <label className="block text-[10px] uppercase tracking-wider text-dark-text/50 mb-1.5">Select Class</label>
              <Select
                value={selectedClass || undefined}
                placeholder="Choose a class to delete..."
                onChange={(value) => setSelectedClass(value)}
                options={classes.map((cls) => ({
                  value: cls,
                  label: (
                    <div className="flex items-center justify-between gap-3">
                      <span>{cls}</span>
                      <span className="text-xs opacity-60">{images.filter((img) => parseClass(img) === cls).length} img</span>
                    </div>
                  ),
                }))}
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: '100%' }}
                status={selectedClass ? 'error' : undefined}
                dropdownStyle={{ maxHeight: 220 }}
              />
            </div>
            <button
              onClick={() => selectedClass && setConfirmDeleteClass(true)}
              disabled={!selectedClass}
              className="self-end sm:self-auto px-4 py-2 rounded-lg bg-danger text-white text-sm font-medium hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              <Icon name="trash" className="w-4 h-4" />
              Delete Class
            </button>
          </div>
        </GlassPanel>
      )}

      {isUploaded && images.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs text-amber-400">
            Showing uploaded training data. Dataset will be split into Training/Validation when training starts.
          </p>
          {classes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {classes.map((cls) => (
                <span key={cls} className="text-[10px] px-2 py-0.5 rounded-full bg-dark-surface border border-dark-border text-dark-text">
                  {cls}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {images.length === 0 ? (
        <EmptyState
          title="No images in this dataset"
          description={`The ${tab === 'train' ? 'training' : 'validation'} dataset is empty. Add images via Data Upload, then start training.`}
        />
      ) : (
        <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-1.5 sm:gap-2">
          {images.map((img) => {
            const cls = parseClass(img);
            return (
              <div
                key={img}
                className="aspect-square rounded-xl border border-dark-border overflow-hidden relative group"
              >
                <img
                  src={`/api/datasets/${imageDir}?file=${img}`}
                  alt={img}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%2322222e" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%236b7280" font-size="10">No preview</text></svg>';
                  }}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    onClick={() => setConfirmTarget(img)}
                    className="w-8 h-8 rounded-lg bg-danger/90 text-white flex items-center justify-center hover:bg-danger transition-colors"
                    title="Delete image"
                  >
                    <Icon name="trash" className="w-4 h-4" />
                  </button>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[9px] text-white truncate block">{cls}</span>
                </div>
                <span className="absolute top-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded bg-black/50 text-white/80">
                  {cls}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!confirmTarget}
        onClose={() => !deleting && setConfirmTarget(null)}
        title="Delete Image"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-dark-text">
            Are you sure you want to delete{' '}
            <span className="text-dark-heading font-medium break-all">{confirmTarget}</span>?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => confirmTarget && handleDeleteImage(confirmTarget)}
              disabled={deleting}
              className="flex-1 py-2.5 rounded-lg bg-danger text-white text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
            <button
              onClick={() => setConfirmTarget(null)}
              disabled={deleting}
              className="px-4 py-2.5 rounded-lg border border-dark-border text-dark-text text-sm hover:bg-dark-surface transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmDeleteAll}
        onClose={() => !deletingAll && setConfirmDeleteAll(false)}
        title="Delete All Images"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-dark-text">
            Are you sure you want to delete all{' '}
            <span className="text-dark-heading font-medium">{images.length}</span> image(s) from the{' '}
            <span className="text-dark-heading font-medium">{tab}</span> dataset? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDeleteAll}
              disabled={deletingAll}
              className="flex-1 py-2.5 rounded-lg bg-danger text-white text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
            >
              {deletingAll ? 'Deleting...' : 'Delete All'}
            </button>
            <button
              onClick={() => setConfirmDeleteAll(false)}
              disabled={deletingAll}
              className="px-4 py-2.5 rounded-lg border border-dark-border text-dark-text text-sm hover:bg-dark-surface transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmDeleteClass}
        onClose={() => !deletingClass && setConfirmDeleteClass(false)}
        title="Delete Class"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-dark-text">
            Are you sure you want to delete all images of class{' '}
            <span className="text-dark-heading font-medium">{selectedClass}</span> from the{' '}
            <span className="text-dark-heading font-medium">{tab}</span> dataset? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDeleteClass}
              disabled={deletingClass}
              className="flex-1 py-2.5 rounded-lg bg-danger text-white text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
            >
              {deletingClass ? 'Deleting...' : 'Delete Class'}
            </button>
            <button
              onClick={() => setConfirmDeleteClass(false)}
              disabled={deletingClass}
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
