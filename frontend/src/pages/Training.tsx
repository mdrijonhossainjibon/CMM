import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import GlassPanel from '../components/common/GlassPanel';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Icon } from '../components/common/Icons';
import { startTraining, getTrainingStatus, getTrainingTypes, getHardwareInfo } from '../services/trainingService';
import { getTrainingClasses } from '../services/trainingDataService';
import { useWebSocket } from '../hooks';
import type { TrainingStatusResponse, TrainingType, TrainingClass } from '../types';

const DEFAULT_CONFIG = {
  training_type: 'aws',
  epochs: 100,
  batch_size: 16,
  image_size: 640,
  workers: 8,
  optimize: true,
  selected_classes: [] as string[],
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

  const wsPath = status?.running ? '/ws/training/logs' : null;
  const { messages: wsMessages, isConnected: wsConnected } = useWebSocket(wsPath);

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
    getTrainingClasses()
      .then((res) => {
        setTrainingClasses(res.classes);
        setTotalTrainImages(res.total_images);
      })
      .catch(() => {});
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

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
        </h2>
        {trainingClasses.length === 0 ? (
          <div className="text-center py-4">
            <Icon name="empty" className="w-6 h-6 text-dark-text/20 mx-auto mb-2" />
            <p className="text-xs text-dark-text/60">No training data yet. Upload images from Data Upload page.</p>
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
