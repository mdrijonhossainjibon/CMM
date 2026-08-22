import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import GlassPanel from '../components/common/GlassPanel';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Icon } from '../components/common/Icons';
import toast from 'react-hot-toast';
import { startBgTraining, getBgTrainingStatus, type BgTrainStatus } from '../services/bgTrainingService';
import { getSplitStats, type SplitStats } from '../services/splitterService';

const PRESETS = [
  { label: '⚡ Turbo (5-10 min)', epochs: 10, image_size: 128 },
  { label: 'Balanced', epochs: 25, image_size: 224 },
  { label: 'High Quality', epochs: 50, image_size: 224 },
];

export default function BgTraining() {
  const [stats, setStats] = useState<SplitStats | null>(null);
  const [epochs, setEpochs] = useState(25);
  const [batchSize, setBatchSize] = useState(32);
  const [imageSize, setImageSize] = useState(224);
  const [workers, setWorkers] = useState(4);
  const [status, setStatus] = useState<BgTrainStatus | null>(null);
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStats(await getSplitStats());
      setStatus(await getBgTrainingStatus());
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    refresh();
    return () => {
      if (pollRef.current != null) window.clearInterval(pollRef.current);
    };
  }, [refresh]);

  const startPoll = () => {
    if (pollRef.current != null) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const st = await getBgTrainingStatus();
        setStatus(st);
        if (!st.running) {
          const id = pollRef.current;
          pollRef.current = null;
          if (id != null) window.clearInterval(id);
          if (st.status === 'completed') toast.success('BG training complete — .pt model saved! 🎉');
          else if (st.status !== 'idle') toast.error(`BG training ${st.status}`);
        }
      } catch {
        // silent
      }
    }, 2000);
  };

  const handleTrain = async () => {
    try {
      const res = await startBgTraining({ epochs, batch_size: batchSize, image_size: imageSize, workers });
      if (res.success) {
        toast.success('BG training started');
        setStatus({ running: true, status: 'training', progress: 0 });
        startPoll();
      } else {
        toast.error(res.error || 'Failed to start BG training');
      }
    } catch (e) {
      toast.error((e as Error).message || 'Failed to start BG training');
    }
  };

  const isTraining = status?.running ?? false;
  const totalCrops = stats?.total_backgrounds ?? 0;
  const classCount = stats?.backgrounds.length ?? 0;

  const fmtElapsed = (s?: number | null) => {
    if (!s) return '0s';
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`;
  };

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="rounded-2xl border border-dark-border bg-gradient-to-br from-emerald-500/10 via-transparent to-primary/10 p-5 sm:p-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-dark-heading flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Icon name="brain" className="w-5 h-5 text-emerald-400" />
          </span>
          BG Training
        </h1>
        <p className="text-sm text-dark-text/80 mt-2 max-w-2xl">
          Data Splitter er <span className="text-emerald-400 font-medium">background crops</span> diye{' '}
          EfficientNet-B0 train hoy — output <code className="text-primary">scene_efficientnet.pt</code>,
          jeta KB-L pipeline automatic use kore bg/scene detect er jonno.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Dataset overview */}
        <div className="lg:col-span-1 space-y-5">
          <GlassPanel>
            <h3 className="text-xs font-semibold text-dark-heading uppercase tracking-wider mb-3">Dataset</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Icon name="images" className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xl font-semibold text-dark-heading leading-none">{totalCrops.toLocaleString()}</p>
                  <p className="text-[11px] text-dark-text mt-0.5">Background crops ready</p>
                </div>
              </div>
              {classCount === 0 ? (
                <p className="text-xs text-dark-text/60 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  Kono bg class nai. Age <span className="text-dark-heading font-medium">Data Splitter</span> page e
                  image split korun.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {stats!.backgrounds.map((c) => (
                    <div key={c.class} className="flex items-center justify-between text-xs">
                      <span className="text-dark-heading capitalize truncate">{c.class}</span>
                      <span className="text-dark-text shrink-0">{c.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </GlassPanel>

          {/* Status */}
          {status && (
            <GlassPanel>
              <h3 className="text-xs font-semibold text-dark-heading uppercase tracking-wider mb-3">Status</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-dark-text/70 capitalize">{status.status}</span>
                  <span className="font-mono text-emerald-400 font-semibold">{status.progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-dark-surface overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-emerald-400"
                    animate={{ width: `${status.progress}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
                {isTraining && (
                  <p className="text-[10px] text-dark-text/50">Elapsed: {fmtElapsed(status.elapsed_seconds)}</p>
                )}
              </div>
            </GlassPanel>
          )}
        </div>

        {/* Training config */}
        <div className="lg:col-span-2">
          <GlassPanel>
            <h3 className="text-xs font-semibold text-dark-heading uppercase tracking-wider mb-4">Train BG Model</h3>
            {isTraining && <LoadingSpinner size="sm" text="Training cholche..." />}

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-[10px] uppercase tracking-wide text-dark-text/50">Preset:</span>
              {PRESETS.map((p) => {
                const active = epochs === p.epochs && imageSize === p.image_size;
                return (
                  <button
                    key={p.label}
                    disabled={isTraining}
                    onClick={() => {
                      setEpochs(p.epochs);
                      setImageSize(p.image_size);
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors disabled:opacity-50 ${
                      active
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-dark-surface text-dark-text border-dark-border hover:border-emerald-500/50'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-dark-text mb-1">Epochs</label>
                <input
                  type="number"
                  min={5}
                  max={200}
                  value={epochs}
                  onChange={(e) => setEpochs(Number(e.target.value))}
                  disabled={isTraining}
                  className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-emerald-400/60 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs text-dark-text mb-1">Batch Size</label>
                <input
                  type="number"
                  min={1}
                  max={128}
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  disabled={isTraining}
                  className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-emerald-400/60 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs text-dark-text mb-1">Image Size</label>
                <select
                  value={imageSize}
                  onChange={(e) => setImageSize(Number(e.target.value))}
                  disabled={isTraining}
                  className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-emerald-400/60 disabled:opacity-50"
                >
                  <option value={128}>128</option>
                  <option value={224}>224</option>
                  <option value={256}>256</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-dark-text mb-1">Workers</label>
                <input
                  type="number"
                  min={0}
                  max={16}
                  value={workers}
                  onChange={(e) => setWorkers(Number(e.target.value))}
                  disabled={isTraining}
                  className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-emerald-400/60 disabled:opacity-50"
                />
              </div>
            </div>

            <button
              onClick={handleTrain}
              disabled={isTraining || classCount < 2 || totalCrops < 4}
              className="mt-4 w-full py-3 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-emerald-500/25"
            >
              <Icon name="brain" className="w-4 h-4" />
              {isTraining ? 'Training...' : 'Train BG Model'}
            </button>
            {classCount < 2 && (
              <p className="text-[10px] text-dark-text/50 mt-2">
                Minimum 2 ta bg class ar 4 ta crop lagbe. Data Splitter e age split korun.
              </p>
            )}
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
