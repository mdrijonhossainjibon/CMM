import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import GlassPanel from '../components/common/GlassPanel';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Icon } from '../components/common/Icons';
import { startTraining, getTrainingStatus, getTrainingTypes, getHardwareInfo } from '../services/trainingService';
import { getTrainingClasses } from '../services/trainingDataService';
import { listZipDatasets } from '../services/datasetService';
import { pullTrainingDataFromR2, getR2Status } from '../services/r2Service';
import { useWebSocket } from '../hooks';
import type { TrainingStatusResponse, TrainingType, TrainingClass, ZipDatasetSummary } from '../types';
import toast from 'react-hot-toast';

const DEFAULT_CONFIG = {
  training_type: 'aws',
  epochs: 100,
  batch_size: 16,
  image_size: 640,
  workers: 8,
  optimize: true,
  selected_classes: [] as string[],
  dataset_id: '' as string,
};

export default function Training() {
  const [status, setStatus] = useState<TrainingStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [trainingTypes, setTrainingTypes] = useState<Record<string, TrainingType>>({});
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [hardware, setHardware] = useState<{ device_type: string; gpu_name?: string; gpu_vram_mb?: number } | null>(null);
  const [trainingClasses, setTrainingClasses] = useState<TrainingClass[]>([]);
  const [totalTrainImages, setTotalTrainImages] = useState(0);
  const [zipDatasets, setZipDatasets] = useState<ZipDatasetSummary[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [r2Configured, setR2Configured] = useState(false);

  const wsPath = status?.running ? '/ws/training/logs' : null;
  const { messages: wsMessages, isConnected: wsConnected } = useWebSocket(wsPath);

  // --- Training estimate (live) ---
  const estimate = useMemo(() => {
    const isGpu = hardware?.device_type === 'gpu';
    const selectedSet = new Set(config.selected_classes);
    const useFilter = config.selected_classes.length > 0;
    const usedImages = useFilter
      ? trainingClasses
          .filter((c) => selectedSet.has(c.name))
          .reduce((sum, c) => sum + c.count, 0)
      : totalTrainImages;

    const epochs = config.epochs;
    const batch = config.batch_size;
    const img = config.image_size;

    // Per-image-per-epoch seconds (batch 16, img 640 base) — realistic YOLOv8n speeds
    const baseSec = isGpu ? 0.02 : 0.5;
    // Batch scaling: GPU te boro batch onek fast, CPU te alo beshi (CPU bound)
    const batchFactor = Math.pow(16 / batch, isGpu ? 0.5 : 0.15);
    // Image size scaling: choto img = fast
    const imgFactor = Math.pow(img / 640, 2);

    const perImageSec = baseSec * batchFactor * imgFactor;
    const totalSeconds = usedImages * epochs * perImageSec;

    // Live ETA: training chalu thakle actual measured speed theke
    let liveEtaSeconds: number | null = null;
    if (status?.running && status.progress > 0 && (status.elapsed_seconds ?? 0) > 5) {
      const secPerPercent = (status.elapsed_seconds as number) / status.progress;
      liveEtaSeconds = secPerPercent * Math.max(100 - status.progress, 0);
    }

    const totalMinutes = (liveEtaSeconds ?? totalSeconds) / 60;

    // VRAM estimate (GB)
    const vramGb = (batch * (img ** 2)) / (1024 * 1024 * 4000) + 0.8;

    const fmtTime = (min: number) => {
      if (min < 1) return `${Math.max(Math.round(min * 60), 1)} sec`;
      if (min < 60) return `${Math.round(min)} min`;
      const h = Math.floor(min / 60);
      const m = Math.round(min % 60);
      return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
    };

    const quality =
      epochs <= 40 ? 'Basic (fast)' : epochs <= 100 ? 'Standard' : epochs <= 150 ? 'Good' : 'High (slow)';

    return {
      isGpu,
      usedImages,
      epochs,
      batch,
      img,
      totalMinutes,
      totalSeconds: liveEtaSeconds ?? totalSeconds,
      isLive: liveEtaSeconds !== null,
      fmt: fmtTime(totalMinutes),
      vramGb,
      quality,
      gpuName: hardware?.gpu_name || 'GPU',
    };
  }, [config, hardware, trainingClasses, totalTrainImages, status]);


  const fetchStatus = useCallback(async () => {
    try {
      const res = await getTrainingStatus();
      setStatus(res);
      if (!res.running && pollInterval) {
        clearInterval(pollInterval);
        setPollInterval(null);
      }
    } catch {
      // ignore polling errors
    } finally {
      setLoading(false);
    }
  }, [pollInterval]);

  const fetchClasses = useCallback(async (dataSetId: string) => {
    try {
      const res = await getTrainingClasses(dataSetId);
      setTrainingClasses(res.classes);
      setTotalTrainImages(res.total_images);
    } catch { /* ignore */ }
  }, []);

  const fetchZipDatasets = useCallback(async () => {
    try {
      const res = await listZipDatasets();
      setZipDatasets(res.datasets);
      return res.datasets;
    } catch {
      setZipDatasets([]);
      return [];
    }
  }, []);

  const handleSelectDataset = async (datasetId: string) => {
    setConfig((c) => ({ ...c, dataset_id: datasetId, selected_classes: [] }));
    setTrainingClasses([]);
    await fetchClasses(datasetId);
  };

  const handleSyncFromR2 = async () => {
    setSyncing(true);
    try {
      const res = await pullTrainingDataFromR2();
      if (res.success) {
        toast.success(`Downloaded ${res.downloaded ?? 0} image(s) from R2 backup!`);
        fetchClasses(config.dataset_id);
      } else {
        toast.error(res.message || 'No data found in R2 backup');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to sync from R2');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    getR2Status()
      .then((s) => setR2Configured(s.configured))
      .catch(() => setR2Configured(false));
  }, []);

  useEffect(() => {
    fetchStatus();
    getTrainingTypes()
      .then((res) => {
        if (res.training_types) setTrainingTypes(res.training_types);
      })
      .catch(() => {});
    getHardwareInfo()
      .then((res) => {
        if (res.hardware) setHardware(res.hardware);
      })
      .catch(() => {});
    // Load ZIP datasets on mount; auto-select the first valid one so training
    // data shows immediately instead of the empty state.
    fetchZipDatasets().then((datasets) => {
      const valid = datasets.find((d) => d.status === 'valid') || datasets[0];
      if (valid) {
        setConfig((c) => ({ ...c, dataset_id: valid.datasetId }));
        fetchClasses(valid.datasetId);
      } else {
        fetchClasses('');
      }
    }).catch(() => fetchClasses(''));
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [fetchStatus, fetchClasses, fetchZipDatasets, pollInterval]);

  useEffect(() => {
    if (status?.running && !pollInterval) {
      const interval = setInterval(fetchStatus, 2000);
      setPollInterval(interval);
    }
    if (!status?.running && pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
  }, [status?.running, pollInterval, fetchStatus]);

  const handleStart = async () => {
    setStarting(true);
    setError('');
    try {
      const res = await startTraining(config);
      if (res.success) {
        setStatus({ running: true, status: 'training', progress: 0 });
      } else {
        setError(res.error || 'Failed to start training');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start training');
    } finally {
      setStarting(false);
    }
  };

  const isRunning = status?.running ?? false;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-semibold text-dark-heading">Training</h1>
        <p className="text-xs text-dark-text mt-1">Configure and start YOLO model training</p>
      </motion.div>

      {/* Training Data Overview */}
      <GlassPanel>
        <h2 className="text-sm font-medium text-dark-heading mb-3 flex items-center gap-2">
          <Icon name="datasets" className="w-4 h-4 text-primary" />
          Training Data
          {totalTrainImages > 0 && (
            <span className="text-xs text-dark-text font-normal">({totalTrainImages} images)</span>
          )}
          {r2Configured && (
            <button
              onClick={handleSyncFromR2}
              disabled={syncing}
              className="ml-auto flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
              title="Sync training data from R2 backup"
            >
              <Icon name={syncing ? 'refresh' : 'download'} className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync from R2'}
            </button>
          )}
        </h2>

        {/* Dataset selector */}
        <div className="mb-4">
          <label className="block text-[10px] uppercase tracking-wider text-dark-text/50 mb-1.5">
            Training Dataset
          </label>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
              <button
                onClick={() => handleSelectDataset('')}
                disabled={isRunning}
                className={`text-[11px] sm:text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                  config.dataset_id === ''
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-dark-surface border-dark-border text-dark-text hover:text-dark-heading hover:border-dark-text/30'
                }`}
                title="Legacy flat training_data directory"
              >
                Root Data
              </button>
              {zipDatasets.map((d) => (
                <button
                  key={d.datasetId}
                  onClick={() => handleSelectDataset(d.datasetId)}
                  disabled={isRunning}
                  className={`text-[11px] sm:text-xs px-3 py-1.5 rounded-lg border font-mono transition-colors disabled:opacity-50 flex items-center gap-1.5 ${
                    config.dataset_id === d.datasetId
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-dark-surface border-dark-border text-dark-text hover:text-dark-heading hover:border-dark-text/30'
                  }`}
                  title={`${d.totalImages} images, ${d.totalClasses} classes · ${d.status}`}
                >
                  <span>{d.status === 'valid' ? '✓' : '○'}</span>
                  {d.datasetId.slice(0, 10)}
                  <span className="opacity-60">({d.totalImages})</span>
                </button>
              ))}
            </div>
            {zipDatasets.length === 0 && (
              <span className="text-[11px] text-dark-text/40 shrink-0">
                No ZIP datasets — upload from Dataset Upload page
              </span>
            )}
          </div>
        </div>

        {trainingClasses.length === 0 ? (
          <div className="text-center py-4">
            <Icon name="empty" className="w-6 h-6 text-dark-text/20 mx-auto mb-2" />
            <p className="text-xs text-dark-text/60">
              {config.dataset_id
                ? 'This dataset has no images in its class folders.'
                : zipDatasets.length > 0
                  ? 'Select a dataset above to see its training data.'
                  : 'No training data yet. Upload a ZIP dataset from the Dataset Upload page.'}
            </p>
            {r2Configured && config.dataset_id === '' && (
              <button
                onClick={handleSyncFromR2}
                disabled={syncing}
                className="mt-3 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
              >
                <Icon name={syncing ? 'refresh' : 'download'} className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Downloading from R2...' : 'Sync Data from R2'}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {trainingClasses.map((cls) => {
                const isSelected = config.selected_classes.length === 0 || config.selected_classes.includes(cls.name);
                return (
                  <button
                    key={cls.name}
                    onClick={() => {
                      setConfig((c) => {
                        if (c.selected_classes.includes(cls.name)) {
                          const next = c.selected_classes.filter((n) => n !== cls.name);
                          return { ...c, selected_classes: next };
                        }
                        return { ...c, selected_classes: [...c.selected_classes, cls.name] };
                      });
                    }}
                    disabled={isRunning}
                    className={`text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border flex items-center gap-1.5 transition-all ${
                      isSelected
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-dark-surface border-dark-border text-dark-text hover:border-dark-text/30'
                    } disabled:opacity-50`}
                  >
                    <span>{cls.name}</span>
                    <span className="opacity-60">{cls.count}</span>
                    {isSelected && <Icon name="check" className="w-2.5 h-2.5" />}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] sm:text-xs text-dark-text/60">
              {config.selected_classes.length === 0
                ? 'All classes selected. Click to filter specific classes.'
                : `${config.selected_classes.length} class(es) selected — only these will be used for training.`}
            </p>
          </>
        )}
      </GlassPanel>

      {/* Step 1: Select Training Type */}
      <GlassPanel>
        <h2 className="text-sm font-medium text-dark-heading mb-4 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center">
            1
          </span>
          Select Training Type
        </h2>
        <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          {Object.entries(trainingTypes).map(([key, t]) => (
            <button
              key={key}
              onClick={() => setConfig((c) => ({ ...c, training_type: key }))}
              disabled={isRunning}
              className={`p-4 rounded-xl border text-left transition-all ${
                config.training_type === key
                  ? 'border-primary bg-primary/10'
                  : 'border-dark-border bg-dark-surface hover:border-dark-text/30'
              } disabled:opacity-50`}
            >
              <div className="text-xs font-semibold uppercase text-primary mb-1">{key}</div>
              <div className="text-sm text-dark-heading">{t.name}</div>
              <code className="text-[11px] text-dark-text mt-1 block">{t.output_prefix}.pt</code>
            </button>
          ))}
          {Object.keys(trainingTypes).length === 0 && (
            <p className="col-span-4 text-xs text-dark-text">Loading training types...</p>
          )}
        </div>
      </GlassPanel>

      {/* Step 2: Configure */}
      <GlassPanel>
        <h2 className="text-sm font-medium text-dark-heading mb-4 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center">
            2
          </span>
          Configure Parameters
        </h2>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-[10px] uppercase tracking-wide text-dark-text/50">Preset:</span>
          {[
            { label: '⚡ Turbo (5-10 min)', cfg: { epochs: 20, batch_size: 32, image_size: 512 } },
            { label: 'Balanced', cfg: { epochs: 50, batch_size: 32, image_size: 640 } },
            { label: 'Standard', cfg: { epochs: 100, batch_size: 16, image_size: 640 } },
            { label: 'High Quality', cfg: { epochs: 150, batch_size: 16, image_size: 640 } },
          ].map((p) => {
            const active = config.epochs === p.cfg.epochs && config.batch_size === p.cfg.batch_size && config.image_size === p.cfg.image_size;
            return (
              <button
                key={p.label}
                type="button"
                disabled={isRunning}
                onClick={() => setConfig((c) => ({ ...c, ...p.cfg, batch_size: hardware?.device_type === 'gpu' ? p.cfg.batch_size : Math.min(p.cfg.batch_size, 16) }))}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors disabled:opacity-50 ${
                  active
                    ? 'bg-primary text-white border-primary'
                    : 'bg-dark-surface text-dark-text border-dark-border hover:border-primary/50'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <label className="block text-xs text-dark-text mb-1">Epochs</label>
            <input
              type="number"
              value={config.epochs}
              onChange={(e) => setConfig((c) => ({ ...c, epochs: Number(e.target.value) }))}
              disabled={isRunning}
              min={1}
              max={1000}
              className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-dark-text mb-1">Batch Size</label>
            <input
              type="number"
              value={config.batch_size}
              onChange={(e) => setConfig((c) => ({ ...c, batch_size: Number(e.target.value) }))}
              disabled={isRunning}
              min={1}
              max={128}
              className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-dark-text mb-1">Image Size</label>
            <input
              type="number"
              value={config.image_size}
              onChange={(e) => setConfig((c) => ({ ...c, image_size: Number(e.target.value) }))}
              disabled={isRunning}
              min={320}
              max={1280}
              step={32}
              className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-dark-text mb-1">Workers</label>
            <input
              type="number"
              value={config.workers}
              onChange={(e) => setConfig((c) => ({ ...c, workers: Number(e.target.value) }))}
              disabled={isRunning}
              min={1}
              max={32}
              className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary disabled:opacity-50"
            />
          </div>
        </div>

        {hardware && (
          <div className="mt-4 p-3 rounded-lg bg-dark-surface border border-dark-border">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${hardware.device_type === 'gpu' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span className="text-xs text-dark-text">
                  {hardware.device_type === 'gpu' ? hardware.gpu_name || 'NVIDIA GPU' : 'CPU Training'}
                </span>
                {hardware.device_type === 'gpu' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">GPU</span>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer sm:ml-auto">
                <input
                  type="checkbox"
                  checked={config.optimize}
                  onChange={(e) => setConfig((c) => ({ ...c, optimize: e.target.checked }))}
                  disabled={isRunning}
                  className="w-3.5 h-3.5 rounded accent-primary"
                />
                <span className="text-xs text-dark-text">Auto-Optimize Training Speed</span>
              </label>
            </div>
            {config.optimize && (
              <>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] sm:text-xs text-dark-text/70">
                  <span>
                    Batch: <strong className="text-dark-heading">{hardware.device_type === 'gpu' ? Math.min(config.batch_size * 2, 64) : Math.max(Math.floor(config.batch_size / 2), 4)}</strong>
                  </span>
                  <span>
                    Workers: <strong className="text-dark-heading">{hardware.device_type === 'gpu' ? Math.min(config.workers, 16) : Math.min(config.workers, 4)}</strong>
                  </span>
                  <span className={hardware.device_type === 'gpu' ? 'text-emerald-400' : 'text-amber-400'}>
                    {hardware.device_type === 'gpu' ? '~8-10x faster than CPU' : 'CPU mode — conservative settings'}
                  </span>
                </div>
                {hardware.device_type === 'gpu' && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-dark-text/60">
                      <span>Est. VRAM: ~{Math.round(config.batch_size * (config.image_size ** 2) / 40000) + 100}MB</span>
                      <span>30% target: ~{(hardware.gpu_vram_mb || 15000) * 0.3 / 1024 > 1 ? `${((hardware.gpu_vram_mb || 15000) * 0.3 / 1024).toFixed(1)}GB` : `${Math.round((hardware.gpu_vram_mb || 15000) * 0.3)}MB`}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-dark-border overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-primary transition-all"
                        style={{ width: `${Math.min(((config.batch_size * (config.image_size ** 2) / 40000) + 100) / ((hardware.gpu_vram_mb || 15000)) * 100, 30)}%` }}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <button
            onClick={handleStart}
            disabled={isRunning || starting}
            className="px-5 sm:px-6 py-2 sm:py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {starting ? (
              <>
                <LoadingSpinner size="sm" />
                Starting...
              </>
            ) : isRunning ? (
              'Training in Progress'
            ) : (
              'Start Training'
            )}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </GlassPanel>

      {/* Training Estimate */}
      <GlassPanel>
        <h2 className="text-sm font-medium text-dark-heading mb-4 flex items-center gap-2">
          <Icon name="clock" className="w-4 h-4 text-primary" />
          Training Estimate
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="p-3 rounded-lg bg-dark-surface border border-dark-border">
            <p className="text-[10px] text-dark-text/60 mb-1">Images</p>
            <p className="text-lg font-semibold text-dark-heading">
              {estimate.usedImages.toLocaleString()}
            </p>
            <p className="text-[10px] text-dark-text/40 mt-0.5">
              {config.selected_classes.length > 0 ? `${config.selected_classes.length} class(es) filtered` : 'All classes'}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-dark-surface border border-dark-border">
            <p className="text-[10px] text-dark-text/60 mb-1">Epochs</p>
            <p className="text-lg font-semibold text-dark-heading">{estimate.epochs}</p>
            <p className="text-[10px] text-dark-text/40 mt-0.5">{estimate.quality}</p>
          </div>
          <div className="p-3 rounded-lg bg-dark-surface border border-dark-border">
            <p className="text-[10px] text-dark-text/60 mb-1">Device</p>
            <p className="text-lg font-semibold text-dark-heading truncate">
              {estimate.isGpu ? (estimate.gpuName || 'GPU').split(' ')[0] : 'CPU'}
            </p>
            <p className="text-[10px] text-dark-text/40 mt-0.5">
              batch {estimate.batch} · img {estimate.img}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-dark-surface border border-dark-border">
            <p className="text-[10px] text-dark-text/60 mb-1">{estimate.isLive ? 'Live Remaining' : 'Est. Time'}</p>
            <p className="text-lg font-semibold text-primary">{estimate.fmt}</p>
            <p className="text-[10px] text-dark-text/40 mt-0.5">
              {estimate.isLive ? `measured · ${status?.progress ?? 0}% done` : `~${Math.max(Math.round(estimate.totalSeconds), 1).toLocaleString()} sec`}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-dark-surface border border-dark-border">
            <p className="text-[10px] text-dark-text/60 mb-1">Est. VRAM</p>
            <p className="text-lg font-semibold text-dark-heading">
              {estimate.vramGb >= 1 ? `${estimate.vramGb.toFixed(1)} GB` : `${Math.round(estimate.vramGb * 1024)} MB`}
            </p>
            <p className={`text-[10px] mt-0.5 ${estimate.isGpu && estimate.vramGb > ((hardware?.gpu_vram_mb ?? 16000) / 1024) ? 'text-red-400' : 'text-dark-text/40'}`}>
              {estimate.isGpu && estimate.vramGb > ((hardware?.gpu_vram_mb ?? 16000) / 1024)
                ? 'OOM risk — batch koman!'
                : estimate.isGpu ? `GPU ${((hardware?.gpu_vram_mb ?? 16000) / 1024).toFixed(0)}GB` : 'RAM use'}
            </p>
          </div>
        </div>
      </GlassPanel>

      {/* Training Progress */}
      {status && (
        <GlassPanel>
          <h2 className="text-sm font-medium text-dark-heading mb-4">Training Progress</h2>
          {loading && <LoadingSpinner />}
          {!loading && (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-dark-heading">
                  Status:{' '}
                  <span
                    className={
                      status.status === 'completed'
                        ? 'text-green-400'
                        : status.status.startsWith('failed')
                          ? 'text-red-400'
                          : 'text-primary'
                    }
                  >
                    {status.status}
                  </span>
                </span>
                <span className="text-xs text-primary font-medium">{status.progress}%</span>
              </div>
              <div className="w-full h-3 rounded-full bg-dark-border overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${status.progress}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
              {isRunning && (
                <div className="space-y-3 mt-3">
                  <div className="flex items-center gap-2">
                    <LoadingSpinner size="sm" />
                    <span className="text-xs text-dark-text">Training in progress...</span>
                    {wsConnected && (
                      <span className="text-xs text-green-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                        Live
                      </span>
                    )}
                  </div>

                  {(status.gpu_util ?? 0) > 0 && (
                    <div className="grid grid-cols-1 xs:grid-cols-3 gap-2 sm:gap-3">
                      <div className="p-2.5 sm:p-3 rounded-lg bg-dark-surface border border-dark-border">
                        <p className="text-[10px] sm:text-xs text-dark-text">GPU Usage</p>
                        <div className="flex items-end gap-1 mt-1">
                          <p className="text-sm sm:text-lg font-semibold text-dark-heading">{status.gpu_util}</p>
                          <p className="text-[10px] sm:text-xs text-dark-text mb-0.5">%</p>
                        </div>
                        <div className="w-full h-1 rounded-full bg-dark-border mt-1.5 overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full ${(status.gpu_util ?? 0) >= 90 ? 'bg-red-500' : (status.gpu_util ?? 0) >= 70 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(status.gpu_util ?? 0, 100)}%` }}
                            transition={{ duration: 0.5 }}
                          />
                        </div>
                      </div>
                      <div className="p-2.5 sm:p-3 rounded-lg bg-dark-surface border border-dark-border">
                        <p className="text-[10px] sm:text-xs text-dark-text">VRAM</p>
                        <p className="text-sm sm:text-lg font-semibold text-dark-heading mt-1">
                          {((status.gpu_mem_used ?? 0) >= 1024
                            ? `${((status.gpu_mem_used ?? 0) / 1024).toFixed(1)}GB`
                            : `${status.gpu_mem_used ?? 0}MB`) + ' / ' +
                            ((status.gpu_mem_total ?? 0) >= 1024
                            ? `${((status.gpu_mem_total ?? 0) / 1024).toFixed(1)}GB`
                            : `${status.gpu_mem_total ?? 0}MB`)}
                        </p>
                      </div>
                      <div className="p-2.5 sm:p-3 rounded-lg bg-dark-surface border border-dark-border">
                        <p className="text-[10px] sm:text-xs text-dark-text">Temperature</p>
                        <p className="text-sm sm:text-lg font-semibold text-dark-heading mt-1">
                          {status.gpu_temperature ?? '--'}°C
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {status.status === 'completed' && (
                <p className="text-xs text-green-400 mt-3">
                  Training completed successfully! Check exports for your model.
                </p>
              )}
              {status.status.startsWith('failed') && (
                <p className="text-xs text-red-400 mt-3">Training failed: {status.status}</p>
              )}
            </>
          )}
        </GlassPanel>
      )}

      {/* Live Logs */}
      {wsMessages.length > 0 && (
        <GlassPanel>
          <h3 className="text-sm font-medium text-dark-heading mb-3 flex items-center gap-2">
            Live Training Logs
            {wsConnected && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-400/10 text-green-400">
                LIVE
              </span>
            )}
          </h3>
          <div className="bg-dark-surface rounded-lg p-4 max-h-[400px] overflow-y-auto font-mono text-xs text-dark-text leading-relaxed">
            {wsMessages.slice(-100).map((msg, i) => (
              <div
                key={i}
                className={`hover:bg-dark-border/30 py-0.5 ${
                  msg.startsWith('PROGRESS:') ? 'text-primary font-medium' : ''
                }`}
              >
                {msg}
              </div>
            ))}
          </div>
        </GlassPanel>
      )}

      {/* System Info */}
      <GlassPanel>
        <h3 className="text-sm font-medium text-dark-heading mb-2">System Status</h3>
        <p className="text-xs text-dark-text">
          Training runs as a background process. Monitor live logs above. Exported models will
          appear in the Models page.
        </p>
      </GlassPanel>
    </div>
  );
}
