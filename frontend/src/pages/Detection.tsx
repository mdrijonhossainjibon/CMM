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

const MAX_SLOTS = 9;

interface ImageSlot {
  file: File;
  preview: string;
}

export default function Detection() {
  const [slots, setSlots] = useState<(ImageSlot | null)[]>([null]);
  const [detections, setDetections] = useState<(DetectionObject[] | null)[]>([]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detectingSlot, setDetectingSlot] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [confThreshold, setConfThreshold] = useState(0.5);
  const [modelType, setModelType] = useState('auto');
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setSlots((prev) => {
      const newSlots = [...prev];

      for (const file of imageFiles) {
        let emptyIdx = newSlots.findIndex((s) => s === null);
        if (emptyIdx === -1 && newSlots.length < MAX_SLOTS) {
          emptyIdx = newSlots.length;
          newSlots.push(null);
        }
        if (emptyIdx === -1) break;

        newSlots[emptyIdx] = { file, preview: URL.createObjectURL(file) };
      }

      return newSlots.slice(0, MAX_SLOTS);
    });

    setDetections([]);
    setError('');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeSlot = (idx: number) => {
    setSlots((prev) => {
      const s = prev[idx];
      if (s) URL.revokeObjectURL(s.preview);
      const next = prev.filter((_, i) => i !== idx);
      return next.length === 0 ? [null] : next;
    });
    setDetections((prev) => prev.filter((_, i) => i !== idx));
  };

  const clearAll = () => {
    slots.forEach((s) => { if (s) URL.revokeObjectURL(s.preview); });
    setSlots([null]);
    setDetections([]);
    setError('');
  };

  const handleDetect = async (slotIdx?: number) => {
    const targetIdx = slotIdx ?? activeSlot;
    const slot = slots[targetIdx];
    if (!slot) return;

    setDetectingSlot(targetIdx);
    setError('');
    try {
      const res = await detectSingle(slot.file, confThreshold, modelType);
      if (res.success) {
        setDetections((prev) => {
          const next = [...prev];
          next[targetIdx] = res.detected_objects;
          return next;
        });
        setActiveSlot(targetIdx);
      } else {
        setError('Detection failed');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Detection failed');
    } finally {
      setDetectingSlot(null);
    }
  };

  const handleDetectAll = async () => {
    const filledSlots = slots.filter((s) => s !== null);
    if (filledSlots.length === 0) return;

    setLoading(true);
    setError('');

    const results: (DetectionObject[] | null)[] = new Array(slots.length).fill(null);
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot) continue;
      try {
        const res = await detectSingle(slot.file, confThreshold, modelType);
        if (res.success) results[i] = res.detected_objects;
      } catch {
        results[i] = [];
      }
    }

    setDetections(results);
    setLoading(false);
  };

  const filledCount = slots.filter((s) => s !== null).length;
  const totalDetections = detections.reduce((sum, d) => sum + (d?.length ?? 0), 0);

  return (
    <div className="space-y-4 sm:space-y-5">
      <GlassPanel>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <label className="text-[10px] sm:text-xs text-dark-text whitespace-nowrap">Model</label>
            <select
              value={modelType}
              onChange={(e) => setModelType(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-xs focus:outline-none focus:border-primary"
            >
              {MODEL_TYPES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] sm:text-xs text-dark-text whitespace-nowrap">Threshold</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={confThreshold}
              onChange={(e) => setConfThreshold(Number(e.target.value))}
              className="w-24 sm:w-32 accent-primary"
            />
            <span className="text-[10px] sm:text-xs text-dark-text w-8">{confThreshold.toFixed(2)}</span>
          </div>
          <div className="flex gap-2 sm:ml-auto">
            {filledCount > 1 && (
              <button
                onClick={handleDetectAll}
                disabled={loading}
                className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-primary text-white text-xs sm:text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {loading ? (
                  <><LoadingSpinner size="sm" /> Detecting...</>
                ) : (
                  <>Detect All ({filledCount})</>
                )}
              </button>
            )}
            {filledCount > 0 && (
              <button
                onClick={clearAll}
                className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg border border-dark-border text-dark-text text-xs sm:text-sm hover:bg-dark-surface transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </GlassPanel>

      {filledCount === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 max-w-xl mx-auto text-center cursor-pointer transition-all ${
            dragOver ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-dark-border hover:border-primary/50 hover:bg-dark-surface'
          }`}
        >
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Icon name="upload" className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
          </div>
          <p className="text-sm sm:text-base text-dark-heading font-medium">
            {dragOver ? 'Drop images here' : 'Drop images or click to browse'}
          </p>
          <p className="text-xs text-dark-text mt-1.5">JPG, PNG, BMP, TIFF — up to 9 images</p>
          <p className="text-[10px] text-dark-text/40 mt-3">3×3 grid detection</p>
        </motion.div>
      )}

      {filledCount > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="space-y-3">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className="relative"
            >
              {dragOver && (
                <div className="absolute inset-0 z-10 rounded-2xl border-2 border-dashed border-primary bg-primary/5 flex items-center justify-center">
                  <p className="text-sm text-primary font-medium">Drop to add</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                {slots.map((slot, idx) => (
                  <motion.div
                    key={idx}
                    layout
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => slot && setActiveSlot(idx)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      activeSlot === idx
                        ? 'border-primary ring-2 ring-primary/20'
                        : detections[idx]?.length
                          ? 'border-emerald-500/60'
                          : 'border-dark-border hover:border-dark-text/30'
                    } ${
                      slot ? 'cursor-pointer bg-dark-surface' : 'bg-dark-surface/50'
                    }`}
                  >
                    {slot ? (
                      <>
                        <img
                          src={slot.preview}
                          alt={`Slot ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {detections[idx] && detections[idx]!.length > 0 && (
                          <div className="absolute inset-0">
                            {detections[idx]!.map((det, di) => (
                              <div
                                key={di}
                                className="absolute border-2 border-emerald-400 rounded"
                                style={{
                                  left: `${(det.box[0] / 640) * 100}%`,
                                  top: `${(det.box[1] / 480) * 100}%`,
                                  width: `${((det.box[2] - det.box[0]) / 640) * 100}%`,
                                  height: `${((det.box[3] - det.box[1]) / 480) * 100}%`,
                                }}
                              >
                                <span className="absolute -top-4 left-0 text-[8px] sm:text-[9px] px-1 py-0.5 rounded bg-emerald-500/90 text-white whitespace-nowrap">
                                  {det.label} {(det.confidence * 100).toFixed(0)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); removeSlot(idx); }}
                          className="absolute top-1.5 right-1.5 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:!opacity-100 hover:bg-red-500 transition-all"
                          title="Remove"
                        >
                          <Icon name="x" className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-dark-text/30 text-xs">+</span>
                      </div>
                    )}
                    <span className="absolute bottom-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded bg-black/50 text-white/70">
                      {idx + 1}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>

            {filledCount < MAX_SLOTS && (
              <button
                onClick={() => { fileRef.current?.click(); }}
                className="text-xs text-dark-text/50 hover:text-primary transition-colors flex items-center gap-1"
              >
                <Icon name="plus" className="w-3 h-3" />
                Add more ({filledCount}/{MAX_SLOTS})
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
          </div>

          <GlassPanel>
            {activeSlot !== null && slots[activeSlot] ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                  <h3 className="text-sm font-medium text-dark-heading">
                    Slot {activeSlot + 1}
                    {detections[activeSlot] && (
                      <span className="text-xs text-dark-text ml-2">
                        {detections[activeSlot]!.length} object{detections[activeSlot]!.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </h3>
                  <button
                    onClick={() => handleDetect(activeSlot)}
                    disabled={detectingSlot === activeSlot}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-primary text-white text-xs sm:text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {detectingSlot === activeSlot ? (
                      <><LoadingSpinner size="sm" /> Detecting...</>
                    ) : (
                      'Detect'
                    )}
                  </button>
                </div>

                {error && (
                  <p className="text-xs text-red-400 mb-3 bg-red-500/10 p-2 rounded-lg">{error}</p>
                )}

                {detections[activeSlot] && detections[activeSlot]!.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {detections[activeSlot]!.map((det, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-dark-surface border border-dark-border text-center"
                      >
                        <span className="text-sm text-dark-heading font-medium">{det.label}</span>
                        <span className="text-xs text-primary mt-0.5">{(det.confidence * 100).toFixed(1)}%</span>
                      </motion.div>
                    ))}
                  </div>
                ) : detections[activeSlot] !== undefined && detectingSlot !== activeSlot ? (
                  <p className="text-sm text-dark-text/40 text-center py-8">No objects detected</p>
                ) : (
                  <p className="text-sm text-dark-text/40 text-center py-8">Click Detect to scan this image</p>
                )}
              </>
            ) : (
              <div className="text-center py-10">
                <Icon name="detection" className="w-8 h-8 text-dark-text/20 mx-auto mb-3" />
                <p className="text-sm text-dark-text/40">Select an image from the grid</p>
                {totalDetections > 0 && (
                  <p className="text-xs text-dark-text mt-2">
                    {totalDetections} objects found across {filledCount} image{filledCount !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}

            {totalDetections > 0 && (
              <div className="mt-4 pt-3 border-t border-dark-border">
                <p className="text-[10px] text-dark-text">
                  Total: {totalDetections} objects across {filledCount} image{filledCount !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
