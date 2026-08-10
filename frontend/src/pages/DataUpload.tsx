import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassPanel from '../components/common/GlassPanel';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import { Icon } from '../components/common/Icons';
import {
  uploadTrainingBatch,
  getTrainingClasses,
  getTrainingImages,
  deleteTrainingImage,
  deleteTrainingClass,
  renameTrainingImage,
} from '../services/trainingDataService';
import type { TrainingClass, TrainingImage } from '../types';

interface QueuedImage {
  file: File;
  preview: string;
}

export default function DataUpload() {
  const [tab, setTab] = useState<'upload' | 'browse'>('upload');
  const [queue, setQueue] = useState<QueuedImage[]>([]);
  const [className, setClassName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState('');
  const [classes, setClasses] = useState<TrainingClass[]>([]);
  const [totalImages, setTotalImages] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [comboOpen, setComboOpen] = useState(false);
  const [comboHighlight, setComboHighlight] = useState(-1);
  const comboRef = useRef<HTMLDivElement>(null);

  const [browseImages, setBrowseImages] = useState<TrainingImage[]>([]);
  const [browseFilter, setBrowseFilter] = useState('');
  const [browseLoading, setBrowseLoading] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameClass, setRenameClass] = useState('');

  const fetchClasses = useCallback(async () => {
    try {
      const res = await getTrainingClasses();
      setClasses(res.classes);
      setTotalImages(res.total_images);
    } catch { /* ignore */ }
  }, []);

  const fetchBrowseImages = useCallback(async (filterClass = '') => {
    setBrowseLoading(true);
    try {
      const res = await getTrainingImages(filterClass);
      setBrowseImages(res.images);
    } catch {
      setBrowseImages([]);
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);
  useEffect(() => { if (tab === 'browse') fetchBrowseImages(browseFilter); }, [tab, browseFilter, fetchBrowseImages]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setComboOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredClasses = classes.filter((c) =>
    c.name.toLowerCase().includes(className.toLowerCase())
  );
  const exactMatch = classes.some((c) => c.name.toLowerCase() === className.trim().toLowerCase());
  const showCombo = comboOpen && className.length === 0;

  const selectClass = (name: string) => {
    setClassName(name);
    setComboOpen(false);
    setComboHighlight(-1);
  };

  const handleComboKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setComboHighlight((prev) => Math.min(prev + 1, filteredClasses.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setComboHighlight((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && comboHighlight >= 0 && filteredClasses[comboHighlight]) {
      e.preventDefault();
      selectClass(filteredClasses[comboHighlight].name);
    } else if (e.key === 'Escape') {
      setComboOpen(false);
    }
  };

  const isImage = (f: File) => {
    if (f.type.startsWith('image/')) return true;
    const ext = f.name.split('.').pop()?.toLowerCase();
    const supported = ['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'];
    return supported.includes(ext || '');
  };

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(isImage);
    const newItems: QueuedImage[] = arr.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setQueue((prev) => [...prev, ...newItems]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeQueued = (idx: number) => {
    setQueue((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const clearQueue = () => {
    queue.forEach((q) => URL.revokeObjectURL(q.preview));
    setQueue([]);
  };

  const handleUpload = async () => {
    if (!className.trim() || queue.length === 0) return;
    setUploading(true);
    setResult('');
    try {
      const files = queue.map((q) => q.file);
      const res = await uploadTrainingBatch(files, className.trim());
      setResult(
        res.success
          ? `${res.saved_count} image(s) saved as "${className.trim()}" class.`
          : `${res.saved_count} saved, ${res.error_count} failed.`
      );
      clearQueue();
      fetchClasses();
    } catch (err: unknown) {
      setResult(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteClass = async (cls: string) => {
    try { await deleteTrainingClass(cls); setBrowseFilter(''); fetchClasses(); fetchBrowseImages(''); } catch { /* ignore */ }
  };

  const handleDeleteImage = async (filename: string) => {
    try { await deleteTrainingImage(filename); fetchClasses(); fetchBrowseImages(browseFilter); } catch { /* ignore */ }
  };

  const handleRename = async () => {
    if (!renameTarget || !renameClass.trim()) return;
    try {
      await renameTrainingImage(renameTarget, renameClass.trim());
      fetchClasses();
      fetchBrowseImages(browseFilter);
      setRenameTarget(null);
      setRenameClass('');
    } catch { /* ignore */ }
  };

  const startRename = (filename: string) => {
    setRenameTarget(filename);
    setRenameClass(filename.split('_')[0] || '');
  };

  return (
    <div className="space-y-6">
      <GlassPanel padding={false}>
        <div className="flex border-b border-dark-border overflow-x-auto">
          {(['upload', 'browse'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors capitalize whitespace-nowrap ${
                tab === t ? 'text-primary border-b-2 border-primary' : 'text-dark-text hover:text-dark-heading'
              }`}
            >
              {t === 'upload' ? 'Upload' : 'Browse & Manage'} {t === 'browse' ? `(${totalImages})` : ''}
            </button>
          ))}
        </div>
      </GlassPanel>

      {tab === 'upload' && (
        <GlassPanel>
          <h2 className="text-base font-semibold text-dark-heading mb-4">Upload Training Images</h2>

          <div className="mb-4" ref={comboRef}>
            <label className="block text-xs text-dark-text mb-1.5">Class Name</label>
            <div className="relative">
              <div className="flex gap-0">
                <input
                  type="text"
                  value={className}
                  onChange={(e) => {
                    setClassName(e.target.value);
                    setComboOpen(true);
                    setComboHighlight(-1);
                  }}
                  onFocus={() => { setComboOpen(true); setComboHighlight(-1); }}
                  onKeyDown={handleComboKeyDown}
                  placeholder={classes.length > 0 ? 'Type or select class...' : 'e.g. car, person, dog'}
                  className="w-full px-3 py-2 rounded-l-lg bg-dark-surface border border-r-0 border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary"
                />
                <button
                  onClick={() => { setComboOpen(!comboOpen); setComboHighlight(-1); }}
                  className="px-2.5 rounded-r-lg bg-dark-surface border border-dark-border text-dark-text hover:text-dark-heading transition-colors"
                >
                  <Icon name="chevronLeft" className={`w-4 h-4 transition-transform ${comboOpen ? 'rotate-90' : '-rotate-90'}`} />
                </button>
              </div>
              <AnimatePresence>
                {(comboOpen || (className && !exactMatch)) && (
                  <motion.ul
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute z-30 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-dark-surface border border-dark-border rounded-lg shadow-xl"
                  >
                    {filteredClasses.length > 0 ? (
                      filteredClasses.map((c, idx) => (
                        <li
                          key={c.name}
                          onMouseDown={(e) => { e.preventDefault(); selectClass(c.name); }}
                          onMouseEnter={() => setComboHighlight(idx)}
                          className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors ${
                            comboHighlight === idx ? 'bg-primary/10 text-primary' : 'text-dark-heading hover:bg-dark-surface/80'
                          }`}
                        >
                          <span>{c.name}</span>
                          <span className="text-xs text-dark-text/60">{c.count} img</span>
                        </li>
                      ))
                    ) : (
                      <li className="px-3 py-2 text-sm text-dark-text/60 italic">
                        {className.trim() ? `New class: "${className.trim()}"` : 'No classes found. Type a name to create.'}
                      </li>
                    )}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
            {className.trim() && !exactMatch && (
              <p className="text-[11px] text-primary/80 mt-1">
                + New class <strong>"{className.trim()}"</strong> will be created
              </p>
            )}
          </div>

          {classes.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-wider text-dark-text/50 mb-2">Existing Classes</p>
              <div className="flex flex-wrap gap-1.5">
                {classes.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => {
                      setClassName(c.name);
                      setComboOpen(false);
                    }}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                      className.toLowerCase() === c.name.toLowerCase()
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'bg-dark-surface border-dark-border text-dark-text hover:border-dark-text/40 hover:text-dark-heading'
                    }`}
                  >
                    {c.name}
                    <span className="ml-1 opacity-50">({c.count})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div
            ref={dropRef}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-4 sm:p-8 text-center cursor-pointer transition-all ${
              dragOver ? 'border-primary bg-primary/5' : 'border-dark-border hover:border-primary/50 hover:bg-dark-surface'
            }`}
          >
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
            <Icon name="upload" className="w-8 sm:w-10 h-8 sm:h-10 mx-auto mb-2 sm:mb-3 text-dark-text/40" />
            <p className="text-sm text-dark-text">
              {dragOver ? 'Drop images here' : 'Drag & drop images, or click to browse'}
            </p>
            <p className="text-xs text-dark-text/60 mt-1">JPG, PNG, WEBP, HEIC — multiple files supported</p>
          </div>

          {queue.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-dark-text">{queue.length} image(s) selected</span>
                <button onClick={clearQueue} className="text-xs text-red-400 hover:text-red-300">Clear all</button>
              </div>
              <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-10 gap-1 sm:gap-1.5">
                {queue.map((item, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative group aspect-square rounded-lg overflow-hidden border border-dark-border"
                  >
                    <img src={item.preview} alt={item.file.name} className="w-full h-full object-cover" />
                    <button
                      onClick={(e) => { e.stopPropagation(); removeQueued(idx); }}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Icon name="x" className="w-3 h-3" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5">
                      <p className="text-[9px] text-white truncate">{item.file.name}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <button
              onClick={handleUpload}
              disabled={uploading || queue.length === 0 || !className.trim()}
              className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : `Upload ${queue.length} image(s) to "${className.trim() || '?'}"`}
            </button>
            {result && <p className="text-xs text-dark-text">{result}</p>}
          </div>
        </GlassPanel>
      )}

      {tab === 'browse' && (
        <>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
              <button
                onClick={() => setBrowseFilter('')}
                className={`text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-full transition-colors ${
                  browseFilter === '' ? 'bg-primary text-white' : 'bg-dark-surface border border-dark-border text-dark-text hover:text-dark-heading'
                }`}
              >
                All ({totalImages})
              </button>
              {classes.map((cls) => (
                <button
                  key={cls.name}
                  onClick={() => setBrowseFilter(browseFilter === cls.name ? '' : cls.name)}
                  className={`text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-full transition-colors flex items-center gap-1 ${
                    browseFilter === cls.name ? 'bg-primary text-white' : 'bg-dark-surface border border-dark-border text-dark-text hover:text-dark-heading'
                  }`}
                >
                  {cls.name}
                  <span className="opacity-70">({cls.count})</span>
                </button>
              ))}
            </div>
            {browseFilter && (
              <button
                onClick={() => handleDeleteClass(browseFilter)}
                className="text-[10px] sm:text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors whitespace-nowrap shrink-0"
              >
                Delete "{browseFilter}" class
              </button>
            )}
          </div>

          {browseLoading ? (
            <LoadingSpinner text="Loading images..." />
          ) : browseImages.length === 0 ? (
            <EmptyState
              title="No images found"
              description={browseFilter ? `No images for class "${browseFilter}"` : 'Upload images first to see them here'}
            />
          ) : (
            <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-1.5 sm:gap-2">
              {browseImages.map((img) => (
                <motion.div
                  key={img.filename}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative group aspect-square rounded-xl overflow-hidden border border-dark-border hover:border-primary/40 transition-colors"
                >
                  <img
                    src={`/api/datasets/train?file=${img.filename}`}
                    alt={img.filename}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                    <button
                      onClick={() => startRename(img.filename)}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/90 text-white flex items-center justify-center hover:bg-primary transition-colors"
                      title="Rename class"
                    >
                      <Icon name="settings" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteImage(img.filename)}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-red-500/90 text-white flex items-center justify-center hover:bg-red-500 transition-colors"
                      title="Delete image"
                    >
                      <Icon name="trash" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                  </div>
                  <span className="absolute top-1.5 left-1.5 text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white/90">
                    {img.class}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'browse' && classes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
          {classes.map((cls) => (
            <div
              key={cls.name}
              className="flex items-center justify-between p-3 rounded-lg bg-dark-surface border border-dark-border hover:border-dark-text/30 transition-colors cursor-pointer"
              onClick={() => setBrowseFilter(cls.name)}
            >
              <div>
                <p className="text-sm text-dark-heading font-medium">{cls.name}</p>
                <p className="text-xs text-dark-text">{cls.count} image(s)</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteClass(cls.name); }}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {renameTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { setRenameTarget(null); setRenameClass(''); }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="glass rounded-2xl p-6 w-full max-w-sm"
          >
            <h3 className="text-sm font-semibold text-dark-heading mb-1">Rename Class</h3>
            <p className="text-xs text-dark-text mb-4 truncate">{renameTarget}</p>
            <label className="block text-xs text-dark-text mb-1">New Class Name</label>
            <input
              type="text"
              value={renameClass}
              onChange={(e) => setRenameClass(e.target.value)}
              placeholder="e.g. dog, cat"
              className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary mb-4"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setRenameTarget(null); setRenameClass(''); } }}
            />
            <div className="flex gap-2">
              <button
                onClick={handleRename}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                disabled={!renameClass.trim()}
              >
                Rename
              </button>
              <button
                onClick={() => { setRenameTarget(null); setRenameClass(''); }}
                className="px-4 py-2 rounded-lg border border-dark-border text-dark-text text-sm hover:bg-dark-surface transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
