import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassPanel from '../components/common/GlassPanel';
import { Icon } from '../components/common/Icons';
import toast from 'react-hot-toast';
import {
  splitImages,
  getSplitStats,
  deleteSplitClass,
  getSplitZipUrl,
  getSplitImageUrl,
  listSplitImages,
  uploadAutoZip,
  type AutoZipResponse,
  type SplitResponse,
  type SplitStats,
} from '../services/splitterService';

// "guitar and castle" → { object: 'guitar', bg: 'castle' }
function parseCombo(name: string): { object: string; bg: string } | null {
  const m = name.match(/^(.+?)\s+and\s+(.+)$/i);
  if (!m) return null;
  const object = m[1].trim().toLowerCase().replace(/\s+/g, '_');
  const bg = m[2].trim().toLowerCase().replace(/\s+/g, '_');
  if (!object || !bg) return null;
  return { object, bg };
}

interface FileGroup {
  key: string;
  object: string;
  bg: string;
  files: File[];
  folder: string;
}

// Group picked files by their parent folder name ("X and Y" pattern)
function buildGroups(fileList: File[]): FileGroup[] {
  const map = new Map<string, FileGroup>();
  for (const f of fileList) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || '';
    const parts = rel.split('/').filter(Boolean);
    const parent = parts.length >= 2 ? parts[parts.length - 2] : '';
    const combo = parseCombo(parent);
    if (!combo) continue;
    const key = `${combo.object}|${combo.bg}`;
    if (!map.has(key)) {
      map.set(key, { key, object: combo.object, bg: combo.bg, files: [], folder: parent });
    }
    map.get(key)!.files.push(f);
  }
  return [...map.values()];
}

export default function Split() {
  const [objectClass, setObjectClass] = useState('');
  const [bgClass, setBgClass] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [groups, setGroups] = useState<FileGroup[]>([]);
  const [splitting, setSplitting] = useState(false);
  const [result, setResult] = useState<SplitResponse | null>(null);
  const [stats, setStats] = useState<SplitStats | null>(null);
  const [previewClass, setPreviewClass] = useState<{ kind: 'objects' | 'backgrounds'; cls: string } | null>(null);
  const [previewFiles, setPreviewFiles] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [bgZip, setBgZip] = useState<File | null>(null);
  const [bgReplace, setBgReplace] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);
  const [autoResult, setAutoResult] = useState<AutoZipResponse | null>(null);
  const bgZipRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const refreshStats = useCallback(async () => {
    try {
      setStats(await getSplitStats());
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  const pickFiles = (list: File[], fromFolder: boolean) => {
    setFiles(list);
    setResult(null);
    if (!fromFolder) {
      setGroups([]);
      return;
    }
    const gs = buildGroups(list);
    setGroups(gs);
    if (gs.length === 1) {
      setObjectClass(gs[0].object);
      setBgClass(gs[0].bg);
    }
  };

  const handleSplit = async () => {
    if (files.length === 0) {
      toast.error('Kono image select koren ni');
      return;
    }
    const runs: { files: File[]; object: string; bg: string }[] =
      groups.length > 0
        ? groups.map((g) => ({ files: g.files, object: g.object, bg: g.bg }))
        : [{ files, object: objectClass.trim(), bg: bgClass.trim() }];
    if (runs.some((r) => !r.object || !r.bg)) {
      toast.error('Object class ar BG class paura jay nai — manually din ba folder name "X and Y" rakhen');
      return;
    }
    setSplitting(true);
    setResult(null);
    let totalObj = 0;
    let totalBg = 0;
    let missed = 0;
    try {
      for (const run of runs) {
        const res = await splitImages(run.files, run.object, run.bg);
        totalObj += res.results.reduce((a, r) => a + r.object_crops.length, 0);
        totalBg += res.results.reduce((a, r) => a + r.bg_crops.length, 0);
        missed += res.results.filter((r) => !r.detected).length;
        setResult(res);
        setStats(res.stats);
      }
      toast.success(
        `Done! ${totalObj} object crop + ${totalBg} bg crop${missed ? ` (${missed} e auto region paura jay nai — center-crop use hoyeche)` : ''}`,
      );
    } catch (e) {
      toast.error((e as Error).message || 'Split failed');
    } finally {
      setSplitting(false);
    }
  };

  const togglePreview = async (kind: 'objects' | 'backgrounds', cls: string) => {
    setPreviewClass({ kind, cls });
    setPreviewFiles([]);
    setPreviewLoading(true);
    try {
      setPreviewFiles(await listSplitImages(kind, cls));
    } catch {
      toast.error('Crops load kora gaye na');
      setPreviewClass(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDelete = async (kind: 'objects' | 'backgrounds', cls: string) => {
    if (!confirm(`Delete ${kind} class "${cls}" and all its crops?`)) return;
    try {
      await deleteSplitClass(kind, cls);
      refreshStats();
      toast.success(`"${cls}" deleted`);
    } catch (e) {
      toast.error((e as Error).message || 'Delete failed');
    }
  };

  const handleBgZip = async () => {
    if (!bgZip) {
      toast.error('Age BG ZIP select korun');
      return;
    }
    setBgUploading(true);
    setAutoResult(null);
    try {
      const res = await uploadAutoZip(bgZip, bgReplace);
      const splitParts = Object.entries(res.split).map(
        ([combo, c]) => `${combo}: ${c.obj} obj + ${c.bg} bg`,
      );
      const bgParts = Object.entries(res.imported_bg).map(([c, n]) => `${c}: ${n}`);
      toast.success(
        `Done! ${res.total_obj} object + ${res.total_bg} bg crops${splitParts.length ? ` — ${splitParts.join(', ')}` : ''}${bgParts.length ? ` — bg: ${bgParts.join(', ')}` : ''}`,
      );
      setAutoResult(res);
      setStats(res.stats);
      setBgZip(null);
      if (bgZipRef.current) bgZipRef.current.value = '';
    } catch (e) {
      toast.error((e as Error).message || 'ZIP import failed');
    } finally {
      setBgUploading(false);
    }
  };

  const classCard = (kind: 'objects' | 'backgrounds', item: { class: string; count: number }) => {
    const open = previewClass?.kind === kind && previewClass?.cls === item.class;
    const accent = kind === 'objects' ? 'text-primary' : 'text-emerald-400';
    return (
      <motion.div
        key={`${kind}-${item.class}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-dark-border bg-dark-bg overflow-hidden hover:border-primary/30 transition-colors"
      >
        <div className="flex items-center justify-between p-3">
          <button
            onClick={() => (open ? setPreviewClass(null) : togglePreview(kind, item.class))}
            className="flex items-center gap-2 min-w-0 text-left flex-1"
          >
            <Icon
              name="chevronRight"
              className={`w-3.5 h-3.5 text-dark-text/40 transition-transform shrink-0 ${open ? 'rotate-90' : ''}`}
            />
            <div className="min-w-0">
              <p className={`text-sm font-medium truncate capitalize ${accent}`}>{item.class}</p>
              <p className="text-[10px] text-dark-text/50 mt-0.5">{item.count.toLocaleString()} crops</p>
            </div>
          </button>
          <div className="flex items-center gap-0.5 shrink-0">
            <a
              href={getSplitZipUrl(kind, item.class)}
              download
              className="p-1.5 rounded-lg text-dark-text/40 hover:text-primary hover:bg-primary/10 transition-colors"
              title="Download ZIP"
            >
              <Icon name="download" className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={() => handleDelete(kind, item.class)}
              className="p-1.5 rounded-lg text-dark-text/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Delete class"
            >
              <Icon name="trash" className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-dark-border"
            >
              <div className="px-3 pb-3">
                {previewLoading ? (
                  <p className="text-[10px] text-dark-text/50 mt-2">Loading crops…</p>
                ) : previewFiles.length === 0 ? (
                  <p className="text-[10px] text-dark-text/50 mt-2">No crops found.</p>
                ) : (
                  <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5 mt-2">
                    {previewFiles.slice(0, 32).map((f) => (
                      <img
                        key={f}
                        src={getSplitImageUrl(kind, item.class, f)}
                        alt={f}
                        loading="lazy"
                        className="w-full aspect-square object-cover rounded-md border border-dark-border hover:border-primary/50 cursor-zoom-in transition-colors"
                        onClick={(e) => (e.target as HTMLImageElement).requestFullscreen?.()}
                      />
                    ))}
                    {previewFiles.length > 32 && (
                      <div className="w-full aspect-square rounded-md border border-dark-border flex items-center justify-center text-[10px] text-dark-text/50">
                        +{previewFiles.length - 32}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="rounded-2xl border border-dark-border bg-gradient-to-br from-primary/10 via-transparent to-emerald-500/10 p-5 sm:p-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-dark-heading flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
            <Icon name="detection" className="w-5 h-5 text-primary" />
          </span>
          Data Splitter
        </h1>
        <p className="text-sm text-dark-text/80 mt-2 max-w-2xl">
          Mixed image (object + background) theke <span className="text-primary font-medium">object crop</span> ar{' '}
          <span className="text-emerald-400 font-medium">background crop</span> alada — training er ready dataset,
          kono model training charai.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <GlassPanel>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                <Icon name="box" className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold text-dark-heading leading-none">{stats.total_objects.toLocaleString()}</p>
                <p className="text-[11px] text-dark-text mt-1">Object crops · {stats.objects.length} classes</p>
              </div>
            </div>
            {stats.objects.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                {stats.objects.map((i) => classCard('objects', i))}
              </div>
            )}
          </GlassPanel>
          <GlassPanel>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <Icon name="images" className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold text-dark-heading leading-none">{stats.total_backgrounds.toLocaleString()}</p>
                <p className="text-[11px] text-dark-text mt-1">Background crops · {stats.backgrounds.length} classes</p>
              </div>
            </div>
            {stats.backgrounds.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                {stats.backgrounds.map((i) => classCard('backgrounds', i))}
              </div>
            )}
          </GlassPanel>
        </div>
      )}

      {/* Split form */}
      <GlassPanel>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-sm font-semibold text-dark-heading">Split Images</h2>
            <p className="text-[11px] text-dark-text/60 mt-0.5">Folder dile class auto-detect hoy ("object and bg")</p>
          </div>
          <div className="flex rounded-lg border border-dark-border overflow-hidden w-fit">
            <button
              onClick={() => fileRef.current?.click()}
              className="px-3 py-1.5 text-xs text-dark-heading bg-dark-surface hover:bg-dark-bg transition-colors flex items-center gap-1.5"
            >
              <Icon name="upload" className="w-3.5 h-3.5" /> Images
            </button>
            <button
              onClick={() => folderRef.current?.click()}
              className="px-3 py-1.5 text-xs text-primary bg-primary/10 border-l border-dark-border hover:bg-primary/20 transition-colors flex items-center gap-1.5"
            >
              <Icon name="datasets" className="w-3.5 h-3.5" /> Folder
            </button>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) pickFiles(Array.from(e.target.files), false);
            e.target.value = '';
          }}
        />
        <input
          ref={folderRef}
          type="file"
          // @ts-expect-error non-standard but supported in all major browsers
          webkitdirectory=""
          directory=""
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) pickFiles(Array.from(e.target.files), true);
            e.target.value = '';
          }}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="flex items-center gap-1.5 text-xs text-dark-text mb-1.5">
              <Icon name="box" className="w-3.5 h-3.5 text-primary" /> Object Class
            </label>
            <input
              type="text"
              value={objectClass}
              onChange={(e) => setObjectClass(e.target.value)}
              placeholder="e.g. guitar"
              className="w-full px-3 py-2.5 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary transition-colors"
            />
            <p className="text-[10px] text-dark-text/40 mt-1.5">
              Object crop ei class e jabe → <code className="text-primary/70">datasets/objects/</code>
            </p>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs text-dark-text mb-1.5">
              <Icon name="images" className="w-3.5 h-3.5 text-emerald-400" /> BG Class
            </label>
            <input
              type="text"
              value={bgClass}
              onChange={(e) => setBgClass(e.target.value)}
              placeholder="e.g. castle"
              className="w-full px-3 py-2.5 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-emerald-400/60 transition-colors"
            />
            <p className="text-[10px] text-dark-text/40 mt-1.5">
              Background crop ei class e jabe → <code className="text-emerald-400/70">datasets/backgrounds/</code>
            </p>
          </div>
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
            files.length > 0
              ? 'border-primary/50 bg-primary/5'
              : 'border-dark-border hover:border-primary/50 hover:bg-dark-surface'
          }`}
        >
          <Icon name="upload" className="w-7 h-7 text-primary mx-auto mb-2" />
          <p className="text-sm text-dark-heading font-medium">
            {files.length > 0 ? `${files.length} image(s) selected` : 'Click to select images'}
          </p>
          <p className="text-xs text-dark-text/50 mt-1">Prottek image theke 1 object crop + 4 bg crop auto hobe</p>
        </div>

        {groups.length > 0 && (
          <div className="mt-3 rounded-xl bg-dark-surface/60 border border-dark-border p-3">
            <p className="text-[10px] uppercase tracking-wide text-dark-text/50 mb-2">
              Auto-detected combos ({groups.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <span
                  key={g.key}
                  className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20"
                >
                  <strong>{g.object}</strong>
                  <span className="text-dark-text/40">+</span>
                  <strong>{g.bg}</strong>
                  <span className="text-dark-text/40">· {g.files.length} img</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleSplit}
          disabled={splitting || files.length === 0}
          className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-primary/25"
        >
          <Icon name="detection" className={`w-4 h-4 ${splitting ? 'animate-pulse' : ''}`} />
          {splitting ? 'Splitting...' : 'Split Now'}
        </button>

        {result && (
          <div className="mt-4 rounded-xl bg-dark-surface/60 border border-dark-border overflow-hidden">
            <div className="px-3 py-2 border-b border-dark-border text-xs font-medium text-dark-heading flex items-center justify-between">
              <span>Last split — {result.processed} processed</span>
              {result.errors.length > 0 && <span className="text-red-400">{result.errors.length} errors</span>}
            </div>
            <div className="max-h-56 overflow-y-auto divide-y divide-dark-border">
              {result.results.map((r) => (
                <div key={r.file} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                  <span className="text-dark-text truncate flex-1">{r.file}</span>
                  <span className="shrink-0 text-dark-heading">
                    {r.method === 'detector' ? (
                      <><span className="text-primary font-medium">{r.label}</span> ({(r.confidence * 100).toFixed(0)}%)</>
                    ) : r.method === 'grabcut' ? (
                      <span className="text-emerald-400 font-medium">auto-split ✓</span>
                    ) : (
                      <span className="text-yellow-400 font-medium">center-crop</span>
                    )}{' '}
                    → {r.object_crops.length} obj + {r.bg_crops.length} bg
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </GlassPanel>

      {/* BG ZIP import — pure background images direct add */}
      <GlassPanel>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-dark-heading flex items-center gap-2">
              <Icon name="upload" className="w-4 h-4 text-emerald-400" />
              Smart ZIP Upload — auto sab kichu
            </h2>
            <p className="text-[11px] text-dark-text/60 mt-0.5">
              Ekta ZIP e sob image den — folder name er upor base kore automatic decide hoy (niche dekhen)
            </p>
          </div>
        </div>

        <div
          onClick={() => bgZipRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
            bgZip ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-dark-border hover:border-emerald-500/40'
          }`}
        >
          <input
            ref={bgZipRef}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={(e) => {
              setBgZip(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
          <Icon name="upload" className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm text-dark-heading font-medium">
            {bgZip ? bgZip.name : 'Click to select ZIP'}
          </p>
          <div className="text-[11px] text-dark-text/60 mt-2 space-y-1 text-left inline-block">
            <p>📁 <code className="text-primary">deer and beach/</code> → auto <span className="text-primary font-medium">split</span>: object → deer, bg → beach</p>
            <p>📁 <code className="text-emerald-400">castle/</code> → direct <span className="text-emerald-400 font-medium">bg import</span> (pure background)</p>
          </div>
        </div>

        <div className="mt-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-dark-text cursor-pointer select-none">
            <input
              type="checkbox"
              checked={bgReplace}
              onChange={(e) => setBgReplace(e.target.checked)}
              className="accent-emerald-500 w-4 h-4"
            />
            Replace mode — same class er purano crops muchhe notun boshabe
          </label>
          <button
            onClick={handleBgZip}
            disabled={bgUploading || !bgZip}
            className="sm:ml-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-emerald-500/25"
          >
            <Icon name="upload" className={`w-4 h-4 ${bgUploading ? 'animate-bounce' : ''}`} />
            {bgUploading ? 'Processing...' : 'Upload & Auto Process'}
          </button>
        </div>

        {autoResult && (
          <div className="mt-3 rounded-xl bg-dark-surface/60 border border-dark-border p-3 text-[11px] space-y-1">
            {Object.entries(autoResult.split).map(([combo, c]) => (
              <p key={combo} className="text-dark-heading">
                <Icon name="check" className="w-3 h-3 inline text-primary mr-1" />
                {combo}: <span className="text-primary">{c.obj} object</span> + <span className="text-emerald-400">{c.bg} bg</span> crops
              </p>
            ))}
            {Object.entries(autoResult.imported_bg).map(([cls, n]) => (
              <p key={cls} className="text-dark-heading">
                <Icon name="check" className="w-3 h-3 inline text-emerald-400 mr-1" />
                {cls}: {n} bg images imported
              </p>
            ))}
            {autoResult.errors.length > 0 && (
              <p className="text-red-400">{autoResult.errors.length} errors (first: {autoResult.errors[0]})</p>
            )}
          </div>
        )}
      </GlassPanel>

      {/* Step guide */}
      <GlassPanel>
        <h2 className="text-sm font-semibold text-dark-heading mb-4 flex items-center gap-2">
          <Icon name="info" className="w-4 h-4 text-primary" />
          Full Workflow — Step by Step
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[
            {
              n: 1,
              title: 'Split Images',
              desc: 'Mixed image folder ("deer and beach") upload → Split Now. Prottek image theke 1 object + 4 bg crop.',
              color: 'bg-primary/10 border-primary/30 text-primary',
            },
            {
              n: 2,
              title: 'Add More BG (ZIP)',
              desc: 'Sudhu-bg wala image (jemon castle er solo image) ZIP kore Import — 4 tar limit nai, joto khushi.',
              color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
            },
            {
              n: 3,
              title: 'BG Training',
              desc: 'BG Training page e train → scene_efficientnet.pt save hobe (auto-load hoy KB-L e).',
              color: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
            },
            {
              n: 4,
              title: 'Detector Test',
              desc: 'Detector Test page e image din → bg + object result dekhen, accuracy check korun.',
              color: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
            },
          ].map((s) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-dark-border bg-dark-bg p-3.5"
            >
              <div className={`w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-bold mb-2.5 ${s.color}`}>
                {s.n}
              </div>
              <p className="text-xs font-semibold text-dark-heading">{s.title}</p>
              <p className="text-[10px] text-dark-text/60 leading-relaxed mt-1">{s.desc}</p>
            </motion.div>
          ))}
        </div>
        <div className="mt-4 rounded-lg bg-dark-surface border border-dark-border p-3 text-[11px] text-dark-text/70">
          <span className="text-dark-heading font-medium">Example:</span> apnar kase{" "}
          <code className="text-primary">castle/</code> folder e 200 ta sudhu-castle image ase? Tarpor{" "}
          <code className="text-primary">castle.zip</code> baniye Step 2 te import korun →{" "}
          <code className="text-emerald-400">datasets/backgrounds/castle/</code> e 200 ta image chole jabe, split kora
          4-ta crop er sathe merge hoye onek bhalo training hobe.
        </div>
      </GlassPanel>
    </div>
  );
}
