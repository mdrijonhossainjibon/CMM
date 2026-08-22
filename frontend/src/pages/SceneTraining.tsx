import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import GlassPanel from '../components/common/GlassPanel';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Icon } from '../components/common/Icons';
import {
  getSceneClasses,
  getSceneDatasetStats,
  uploadSceneImages,
  deleteSceneClass,
  startSceneTraining,
  getSceneTrainingStatus,
} from '../services/sceneTrainingService';

export default function SceneTraining() {
  const [classes, setClasses] = useState<string[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [totalImages, setTotalImages] = useState(0);
  const [selectedClass, setSelectedClass] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [epochs, setEpochs] = useState(30);
  const [batchSize, setBatchSize] = useState(32);
  const [imageSize, setImageSize] = useState(224);
  const [workers, setWorkers] = useState(4);
  const [status, setStatus] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [cls, s] = await Promise.all([getSceneClasses(), getSceneDatasetStats()]);
      setClasses(cls);
      const map: Record<string, number> = {};
      for (const c of (s.classes || [])) map[c.class] = c.count;
      setStats(map);
      setTotalImages(s.total_images || 0);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    refresh();
    return () => { if (pollRef.current != null) window.clearInterval(pollRef.current); };
  }, [refresh]);

  const startPoll = () => {
    if (pollRef.current != null) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      const st = await getSceneTrainingStatus();
      setStatus(st);
      if (!st.running) {
        const id = pollRef.current;
        pollRef.current = null;
        if (id != null) window.clearInterval(id);
        refresh();
      }
    }, 2000);
  };

  const handleUpload = async () => {
    if (!selectedClass || files.length === 0) return;
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const res = await uploadSceneImages(files, selectedClass);
      if (res.success) {
        setSuccess(`Uploaded ${res.saved_count} images to "${selectedClass}"`);
        setFiles([]);
        if (fileRef.current) fileRef.current.value = '';
        refresh();
      } else {
        setError(res.errors?.join(', ') || 'Upload failed');
      }
    } catch (e) {
      setError((e as Error).message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateClass = async () => {
    const name = newClassName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!name) return;
    setSelectedClass(name);
    setNewClassName('');
    await refresh();
  };

  const handleDeleteClass = async (cls: string) => {
    if (!confirm(`Delete scene class "${cls}" and all its images?`)) return;
    await deleteSceneClass(cls);
    if (selectedClass === cls) setSelectedClass('');
    refresh();
  };

  const handleTrain = async () => {
    setError('');
    setSuccess('');
    try {
      const res = await startSceneTraining({ epochs, batch_size: batchSize, image_size: imageSize, workers });
      if (res.success) {
        setSuccess('Scene training started');
        setStatus({ running: true, status: 'training', progress: 0 });
        startPoll();
      } else {
        setError(res.error || 'Failed to start training');
      }
    } catch (e) {
      setError((e as Error).message || 'Failed to start training');
    }
  };

  const isTraining = status?.running;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-dark-heading">Scene Training</h1>
        <p className="text-sm text-dark-text/70 mt-1">
          EfficientNet-B0 transfer learning on folder-per-class scene images.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Classes + Upload */}
        <div className="lg:col-span-2 space-y-5">
          <GlassPanel>
            <h3 className="text-xs font-semibold text-dark-heading uppercase tracking-wider mb-3">Scene Classes</h3>
            {classes.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <Icon name="box" className="w-8 h-8 text-dark-text/30 mb-2" />
                <p className="text-sm text-dark-text/60">No scene classes yet</p>
                <p className="text-xs text-dark-text/40 mt-1">Create a class below and upload images</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {classes.map((cls) => (
                  <motion.button
                    key={cls}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => setSelectedClass(cls)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all text-left ${
                      selectedClass === cls
                        ? 'border-primary bg-primary/10'
                        : 'border-dark-border bg-dark-surface hover:border-primary/30'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-dark-heading capitalize">{cls}</p>
                      <p className="text-[10px] text-dark-text/50 mt-0.5">{stats[cls] || 0} images</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteClass(cls); }}
                      className="p-1.5 rounded-lg text-dark-text/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Icon name="trash" className="w-3.5 h-3.5" />
                    </button>
                  </motion.button>
                ))}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <input
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                placeholder="new scene class (e.g. beach)"
                className="flex-1 px-3 py-2.5 rounded-lg bg-dark-bg border border-dark-border text-sm text-dark-heading placeholder:text-dark-text/30 focus:outline-none focus:border-primary transition-colors"
              />
              <button
                onClick={handleCreateClass}
                className="px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-hover transition-colors"
              >
                <Icon name="plus" className="w-4 h-4" />
              </button>
            </div>
          </GlassPanel>

          <GlassPanel>
            <h3 className="text-xs font-semibold text-dark-heading uppercase tracking-wider mb-3">Upload Images</h3>
            {!selectedClass ? (
              <p className="text-sm text-dark-text/50">Select or create a scene class first.</p>
            ) : (
              <div className="space-y-3">
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-dark-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/30 transition-colors"
                >
                  <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) setFiles(Array.from(e.target.files)); e.target.value = ''; }} />
                  <Icon name="upload" className="w-6 h-6 text-primary mx-auto mb-2" />
                  <p className="text-sm text-dark-heading font-medium">Click to upload images</p>
                  <p className="text-xs text-dark-text/50 mt-1">{files.length} file(s) selected — {selectedClass}</p>
                </div>
                <button
                  onClick={handleUpload}
                  disabled={uploading || files.length === 0}
                  className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {uploading ? <><LoadingSpinner size="sm" /> Uploading...</> : <><Icon name="upload" className="w-4 h-4" /> Upload to {selectedClass}</>}
                </button>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between text-xs text-dark-text/60">
              <span>Total images: {totalImages}</span>
              <span>{classes.length} classes</span>
            </div>
          </GlassPanel>
        </div>

        {/* Training */}
        <div className="space-y-5">
          <GlassPanel>
            <h3 className="text-xs font-semibold text-dark-heading uppercase tracking-wider mb-3">Train Scene Model</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-dark-text/60 uppercase tracking-wider font-medium block mb-1">Epochs</label>
                <input type="number" min="5" max="200" value={epochs} onChange={(e) => setEpochs(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg bg-dark-bg border border-dark-border text-sm text-dark-heading focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-[10px] text-dark-text/60 uppercase tracking-wider font-medium block mb-1">Batch Size</label>
                <input type="number" min="1" max="256" value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg bg-dark-bg border border-dark-border text-sm text-dark-heading focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-[10px] text-dark-text/60 uppercase tracking-wider font-medium block mb-1">Image Size</label>
                <select value={imageSize} onChange={(e) => setImageSize(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg bg-dark-bg border border-dark-border text-sm text-dark-heading focus:outline-none focus:border-primary">
                  <option value={128}>128</option>
                  <option value={224}>224</option>
                  <option value={256}>256</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-dark-text/60 uppercase tracking-wider font-medium block mb-1">Workers</label>
                <input type="number" min="0" max="16" value={workers} onChange={(e) => setWorkers(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg bg-dark-bg border border-dark-border text-sm text-dark-heading focus:outline-none focus:border-primary" />
              </div>
              <button
                onClick={handleTrain}
                disabled={isTraining || classes.length < 2}
                className="w-full py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm shadow-primary/25"
              >
                {isTraining ? <><LoadingSpinner size="sm" /> Training...</> : <><Icon name="brain" className="w-4 h-4" /> Train Scene Model</>}
              </button>
              {classes.length < 2 && <p className="text-[10px] text-dark-text/50">Need at least 2 classes to train.</p>}
            </div>
          </GlassPanel>

          {status && (
            <GlassPanel>
              <h3 className="text-xs font-semibold text-dark-heading uppercase tracking-wider mb-3">Training Status</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-dark-text/70 capitalize">{status.status || 'idle'}</span>
                  <span className="font-mono text-primary font-semibold">{status.progress ?? 0}%</span>
                </div>
                <div className="h-2 rounded-full bg-dark-bg overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${status.progress ?? 0}%` }} />
                </div>
                {(status.gpu_util != null || status.gpu_mem_used != null) && (
                  <div className="flex items-center gap-2 text-[10px] text-dark-text/60">
                    <Icon name="gpu" className="w-3.5 h-3.5 text-primary" />
                    <span>GPU {status.gpu_util ?? 0}% · {status.gpu_mem_used ?? 0}/{status.gpu_mem_total ?? 0} MB · {status.gpu_temperature ?? 0}°C</span>
                  </div>
                )}
              </div>
            </GlassPanel>
          )}
        </div>
      </div>

      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <Icon name="alertTriangle" className="w-4 h-4 shrink-0" />
          {error}
        </motion.div>
      )}
      {success && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
          <Icon name="check" className="w-4 h-4 shrink-0" />
          {success}
        </motion.div>
      )}
    </div>
  );
}
