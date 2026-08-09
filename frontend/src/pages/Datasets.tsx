import { useState, useEffect, useCallback } from 'react';
import GlassPanel from '../components/common/GlassPanel';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import EmptyState from '../components/common/EmptyState';
import { getTrainImages, getValImages } from '../services/datasetService';
import type { DatasetImageResponse } from '../types';

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

  if (loading) return <LoadingSpinner text="Loading datasets..." />;
  if (error) return <ErrorMessage message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6">
      <GlassPanel padding={false}>
        <div className="flex border-b border-dark-border">
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
      </GlassPanel>

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
    </div>
  );
}
