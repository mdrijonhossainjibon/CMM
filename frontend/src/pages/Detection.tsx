import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import GlassPanel from '../components/common/GlassPanel';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Icon } from '../components/common/Icons';
import { detectSingle } from '../services/detectionService';
import type { DetectionObject } from '../types';

const MODEL_TYPES = [
  { value: 'auto', label: 'Auto (best.pt)' },
  { value: 'aws', label: 'AWS' },
  { value: 'kbs', label: 'KBS' },
  { value: 'kb-l', label: 'KB Login' },
  { value: 'custom', label: 'Custom' },
] as const;

const THRESHOLD_PRESETS = [0.3, 0.5, 0.7, 0.9] as const;
const GRID_SIZE = 9;

interface ImageSlot {
  file: File;
  preview: string;
}

export default function Detection() {
  const [slots, setSlots] = useState<(ImageSlot | null)[]>(Array(GRID_SIZE).fill(null));
  const [detections, setDetections] = useState<(DetectionObject[] | null)[]>([]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detectingSlot, setDetectingSlot] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [confThreshold, setConfThreshold] = useState(0.5);
  const [modelType, setModelType] = useState('aws');
  const [modelInfo, setModelInfo] = useState<{ name: string; classes: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);

  const filledIndices = slots
    .map((s, i) => (s ? i : -1))
    .filter((i) => i >= 0);
  const filledCount = filledIndices.length;

  const handleFiles = useCallback((files: FileList | File[], targetSlot?: number) => {
    const isImage = (f: File) => {
      if (f.type.startsWith('image/')) return true;
      const ext = f.name.split('.').pop()?.toLowerCase();
      const supported = ['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'];
      return supported.includes(ext || '');
    };
    const imageFiles = Array.from(files).filter(isImage);
    if (imageFiles.length === 0) return;

    setSlots((prev) => {
      const newSlots = [...prev];

      if (targetSlot !== undefined) {
        const file = imageFiles[0];
        const old = newSlots[targetSlot];
        if (old) URL.revokeObjectURL(old.preview);
        newSlots[targetSlot] = { file, preview: URL.createObjectURL(file) };
        return newSlots;
      }

      for (const file of imageFiles) {
        const emptyIdx = newSlots.findIndex((s) => s === null);
        if (emptyIdx === -1) break;
        newSlots[emptyIdx] = { file, preview: URL.createObjectURL(file) };
      }

      return newSlots;
    });

    setDetections([]);
    setError('');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, slotIdx?: number) => {
    e.preventDefault();
    setDragOver(false);
    setDragOverSlot(null);
    handleFiles(e.dataTransfer.files, slotIdx);
  }, [handleFiles]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSlotFileChange = (e: React.ChangeEvent<HTMLInputElement>, slotIdx: number) => {
    if (e.target.files) handleFiles(e.target.files, slotIdx);
    e.target.value = '';
  };

  const removeSlot = (idx: number) => {
    setSlots((prev) => {
      const s = prev[idx];
      if (s) URL.revokeObjectURL(s.preview);
      const next = [...prev];
      next[idx] = null;
      return next;
    });
    setDetections((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
  };

  const clearAll = () => {
    slots.forEach((s) => { if (s) URL.revokeObjectURL(s.preview); });
    setSlots(Array(GRID_SIZE).fill(null));
    setDetections([]);
    setError('');
    setModelInfo(null);
  };

  const handleDetectAll = async () => {
    if (filledCount === 0) return;

    setLoading(true);
    setError('');
    setDetectingSlot(null);

    const results: (DetectionObject[] | null)[] = new Array(GRID_SIZE).fill(null);

    for (let i = 0; i < GRID_SIZE; i++) {
      const slot = slots[i];
      if (!slot) continue;
      setDetectingSlot(i);
      try {
        const res = await detectSingle(slot.file, confThreshold, modelType);
        if (res.success) {
          results[i] = res.detected_objects;
          if (res.model_name && !modelInfo) {
            setModelInfo({ name: res.model_name, classes: res.model_classes || [] });
          }
        }
      } catch {
        results[i] = [];
      }
    }

    setDetections(results);
    setDetectingSlot(null);

    const firstWithDetections = results.findIndex((r) => r && r.length > 0);
    if (firstWithDetections >= 0) {
      setActiveSlot(firstWithDetections);
    }

    setLoading(false);
  };

  const totalDetections = detections.reduce((sum, d) => sum + (d?.length ?? 0), 0);

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <GlassPanel>
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-dark-text/60 uppercase tracking-wider font-medium">Model</span>
              <select
                value={modelType}
                onChange={(e) => setModelType(e.target.value)}
                className="pl-2.5 pr-7 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-xs font-medium focus:outline-none focus:border-primary appearance-none bg-no-repeat"
                style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.25rem center', backgroundSize: '1.25rem' }}
              >
                {MODEL_TYPES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-dark-text/60 uppercase tracking-wider font-medium">Threshold</span>
              <span className="text-xs font-mono font-semibold text-primary tabular-nums">
                {confThreshold.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0.1"
                max="0.95"
                step="0.01"
                value={confThreshold}
                onChange={(e) => setConfThreshold(Number(e.target.value))}
                className="flex-1 h-1.5 rounded-full appearance-none bg-dark-border cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md
                  [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform
                  [&::-webkit-slider-thumb]:hover:scale-125
                  [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
              />
            </div>
            <div className="flex gap-1.5">
              {THRESHOLD_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setConfThreshold(preset)}
                  className={`text-[10px] px-2.5 py-1 rounded-md transition-all font-medium ${
                    confThreshold === preset
                      ? 'bg-primary text-white shadow-sm shadow-primary/25'
                      : 'bg-dark-surface border border-dark-border text-dark-text hover:border-primary/30 hover:text-dark-heading'
                  }`}
                >
                  {preset.toFixed(2)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {filledCount > 0 && (
              <button
                onClick={handleDetectAll}
                disabled={loading}
                className="px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-hover transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm shadow-primary/25"
              >
                {loading ? (
                  <><LoadingSpinner size="sm" /> Detecting...</>
                ) : (
                  <><Icon name="detection" className="w-3.5 h-3.5" /> Detect ({filledCount})</>
                )}
              </button>
            )}
            {filledCount > 0 && (
              <button
                onClick={clearAll}
                className="px-4 py-2.5 rounded-xl border border-dark-border text-dark-text text-xs font-medium hover:bg-dark-surface hover:border-dark-text/20 transition-all flex items-center gap-1.5"
              >
                <Icon name="trash" className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>
      </GlassPanel>

      {/* Main Content: Grid + Results */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-5">
        {/* Image Grid */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => handleDrop(e)}
          className="relative flex items-center justify-center"
        >
          {dragOver && (
            <div className="absolute inset-0 z-20 rounded-2xl border-2 border-dashed border-primary bg-primary/5 flex items-center justify-center backdrop-blur-sm">
              <div className="text-center">
                <Icon name="upload" className="w-8 h-8 text-primary mx-auto mb-2 animate-bounce" />
                <p className="text-sm text-primary font-semibold">Drop images here</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full max-w-[540px]">
            {slots.map((slot, idx) => {
              const hasDetection = detections[idx] && detections[idx]!.length > 0;
              const isActive = activeSlot === idx;
              const isDetecting = detectingSlot === idx;

              return (
                <motion.div
                  key={idx}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.25, delay: idx * 0.03 }}
                  onClick={() => slot && setActiveSlot(idx)}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverSlot(idx); }}
                  onDragLeave={() => setDragOverSlot(null)}
                  onDrop={(e) => { e.stopPropagation(); handleDrop(e, idx); }}
                  className={`relative aspect-square rounded-xl overflow-hidden transition-all duration-200 group ${
                    isActive
                      ? 'ring-2 ring-primary ring-offset-1 ring-offset-dark-bg shadow-lg shadow-primary/10'
                      : hasDetection
                        ? 'ring-1 ring-emerald-500/40'
                        : 'ring-1 ring-dark-border'
                  } ${
                    slot ? 'cursor-pointer' : ''
                  }`}
                >
                  {slot ? (
                    <>
                      <img
                        src={slot.preview}
                        alt={`Slot ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      {isDetecting && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <LoadingSpinner size="sm" />
                        </div>
                      )}
                      {hasDetection && (
                        <>
                          <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white shadow-sm">
                            {detections[idx]!.length}
                          </span>
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="bg-black/50 backdrop-blur-sm rounded-lg px-2 py-1 max-w-[90%]">
                              {detections[idx]!.map((d, di) => (
                                <span key={di} className="text-[10px] sm:text-xs text-white font-semibold capitalize leading-tight block text-center">
                                  {d.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <button
                        onClick={(e) => { e.stopPropagation(); removeSlot(idx); }}
                        className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all backdrop-blur-sm"
                        title="Remove"
                      >
                        <Icon name="x" className="w-3.5 h-3.5" />
                      </button>
                      <span className="absolute bottom-2 left-2 text-[10px] px-1.5 py-0.5 rounded-md bg-black/60 text-white/80 backdrop-blur-sm font-medium tabular-nums">
                        {idx + 1}
                      </span>
                    </>
                  ) : (
                    <label
                      className={`w-full h-full flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                        dragOverSlot === idx
                          ? 'bg-primary/10 border-2 border-dashed border-primary'
                          : 'bg-dark-surface/50 border-2 border-dashed border-dark-border hover:border-dark-text/20 hover:bg-dark-surface'
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleSlotFileChange(e, idx)}
                      />
                      <Icon name="plus" className={`w-5 h-5 transition-colors ${dragOverSlot === idx ? 'text-primary' : 'text-dark-text/25 group-hover:text-dark-text/50'}`} />
                      <span className={`text-[10px] font-medium transition-colors ${dragOverSlot === idx ? 'text-primary' : 'text-dark-text/25 group-hover:text-dark-text/50'}`}>
                        {idx + 1}
                      </span>
                    </label>
                  )}
                </motion.div>
              );
            })}
          </div>

          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
        </div>

        {/* Results Panel */}
        <GlassPanel>
          {modelInfo && (
            <div className="mb-4 p-2.5 rounded-xl bg-dark-surface border border-dark-border flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-dark-text/50 uppercase tracking-wider font-medium">Active Model</p>
                <p className="text-xs font-semibold text-dark-heading truncate">{modelInfo.name}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                {modelInfo.classes.map((cls) => (
                  <span key={cls} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/15 font-medium">
                    {cls}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Detected Objects Summary */}
          {totalDetections > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] text-dark-text/50 uppercase tracking-wider font-medium">
                Results <span className="text-emerald-400">{totalDetections} objects</span>
              </p>
              {slots.map((slot, idx) => {
                const dets = detections[idx];
                if (!slot) return null;
                const hasDets = dets && dets.length > 0;
                return (
                  <button
                    key={idx}
                    onClick={() => setActiveSlot(idx)}
                    className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between ${
                      activeSlot === idx
                        ? 'bg-primary/10 border border-primary/30'
                        : 'bg-dark-surface border border-dark-border hover:border-dark-text/20'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-[11px] font-bold text-dark-text/40 w-4">{idx + 1}</span>
                      {hasDets ? (
                        <span className="text-xs sm:text-sm font-semibold text-dark-heading capitalize">
                          {dets!.map(d => d.label).join(', ')}
                        </span>
                      ) : (
                        <span className="text-xs text-dark-text/30">—</span>
                      )}
                    </div>
                    {hasDets && (
                      <span className="text-xs sm:text-sm font-bold text-primary tabular-nums shrink-0">
                        {Math.max(...dets!.map(d => d.confidence * 100)).toFixed(0)}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : filledCount > 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-dark-text/40 font-medium">Ready to scan</p>
              <p className="text-xs text-dark-text/30 mt-1">Click Detect in toolbar</p>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-xl bg-dark-surface border border-dark-border flex items-center justify-center mx-auto mb-3">
                <Icon name="images" className="w-5 h-5 text-dark-text/20" />
              </div>
              <p className="text-xs text-dark-text/40 font-medium">Drop images on the grid</p>
              <p className="text-[10px] text-dark-text/25 mt-1">3x3 Captcha Detection</p>
            </div>
          )}

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl"
            >
              {error}
            </motion.p>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
