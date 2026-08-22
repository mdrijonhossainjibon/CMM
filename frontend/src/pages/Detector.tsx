import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import GlassPanel from '../components/common/GlassPanel';
import { Icon } from '../components/common/Icons';
import toast from 'react-hot-toast';
import { analyzeImage, type DetectorResult } from '../services/detectorService';

export default function Detector() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<DetectorResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      toast.error('Image file din');
      return;
    }
    setFile(f);
    setResult(null);
    const url = URL.createObjectURL(f);
    setImageUrl(url);
    const img = new Image();
    img.onload = () => setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
  };

  const handleAnalyze = async () => {
    if (!file) {
      toast.error('Age ekta image select korun');
      return;
    }
    setAnalyzing(true);
    setResult(null);
    try {
      const res = await analyzeImage(file);
      setResult(res);
      if (res.scene) {
        toast.success(`BG: ${res.scene} (${(res.scene_confidence * 100).toFixed(0)}%) · Objects: ${res.objects.length}`);
      }
    } catch (e) {
      toast.error((e as Error).message || 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const maxSceneConf = result ? Math.max(...result.scene_top.map((s) => s.confidence), 0.01) : 1;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="rounded-2xl border border-dark-border bg-gradient-to-br from-primary/10 via-transparent to-emerald-500/10 p-5 sm:p-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-dark-heading flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
            <Icon name="detection" className="w-5 h-5 text-primary" />
          </span>
          Detector Test
        </h1>
        <p className="text-sm text-dark-text/80 mt-2 max-w-2xl">
          Image din — <span className="text-primary font-medium">object</span> (YOLO) ar{' '}
          <span className="text-emerald-400 font-medium">background/scene</span> (BG model) duitai ek sathe dekhabe.
          BG Training sesh hole ei khane e accuracy check korun.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Image + boxes */}
        <GlassPanel className="lg:col-span-3">
          <h2 className="text-sm font-semibold text-dark-heading mb-3">Image</h2>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all ${
              dragOver ? 'border-primary bg-primary/5' : 'border-dark-border hover:border-primary/40'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            {imageUrl ? (
              <div className="relative inline-block max-w-full">
                <img
                  src={imageUrl}
                  alt="detect"
                  className="max-w-full max-h-[420px] rounded-xl mx-auto select-none"
                  draggable={false}
                />
                {/* Object boxes overlay */}
                {result?.objects?.map((o, i) => {
                  if (!o.box || o.box.length < 4 || !imgSize) return null;
                  const [x1, y1, x2, y2] = o.box;
                  return (
                    <div
                      key={i}
                      className="absolute border-2 border-primary bg-primary/10 rounded-sm pointer-events-none"
                      style={{
                        left: `${(x1 / imgSize.w) * 100}%`,
                        top: `${(y1 / imgSize.h) * 100}%`,
                        width: `${((x2 - x1) / imgSize.w) * 100}%`,
                        height: `${((y2 - y1) / imgSize.h) * 100}%`,
                      }}
                    >
                      <span className="absolute -top-5 left-0 text-[10px] font-medium text-white bg-primary px-1.5 py-0.5 rounded whitespace-nowrap">
                        {o.label} {(o.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12">
                <Icon name="upload" className="w-8 h-8 text-primary mx-auto mb-2" />
                <p className="text-sm text-dark-heading font-medium">Drag & drop image, or click</p>
                <p className="text-xs text-dark-text/50 mt-1">JPG · PNG · WEBP</p>
              </div>
            )}
          </div>

          <button
            onClick={handleAnalyze}
            disabled={analyzing || !file}
            className="mt-4 w-full py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-primary/25"
          >
            <Icon name="detection" className={`w-4 h-4 ${analyzing ? 'animate-pulse' : ''}`} />
            {analyzing ? 'Analyzing...' : 'Analyze'}
          </button>
        </GlassPanel>

        {/* Results */}
        <div className="lg:col-span-2 space-y-5">
          {/* BG / Scene */}
          <GlassPanel>
            <h2 className="text-xs font-semibold text-dark-heading uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Icon name="images" className="w-4 h-4 text-emerald-400" /> Background
            </h2>
            {result ? (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-2xl font-semibold capitalize text-emerald-400">{result.scene || '—'}</p>
                  <p className="text-sm font-mono text-dark-text">{(result.scene_confidence * 100).toFixed(1)}%</p>
                </div>
                <div className="space-y-1.5">
                  {result.scene_top.slice(0, 5).map((s) => (
                    <div key={s.label}>
                      <div className="flex items-center justify-between text-[11px] mb-0.5">
                        <span className={s.label === result.scene ? 'text-dark-heading font-medium capitalize' : 'text-dark-text capitalize'}>
                          {s.label}
                        </span>
                        <span className="text-dark-text/60">{(s.confidence * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-dark-surface overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(s.confidence / maxSceneConf) * 100}%` }}
                          transition={{ duration: 0.5 }}
                          className={`h-full rounded-full ${s.label === result.scene ? 'bg-emerald-400' : 'bg-dark-text/30'}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-dark-text/50">Analyze chaple bg/scene result ashbe.</p>
            )}
          </GlassPanel>

          {/* Objects */}
          <GlassPanel>
            <h2 className="text-xs font-semibold text-dark-heading uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Icon name="box" className="w-4 h-4 text-primary" /> Objects
            </h2>
            {result ? (
              result.objects.length === 0 ? (
                <p className="text-xs text-dark-text/50">
                  Kono object detect hoy nai (object model ekhono trained na hole eta normal).
                </p>
              ) : (
                <div className="space-y-2">
                  {result.objects.map((o, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-dark-surface border border-dark-border"
                    >
                      <span className="text-sm text-dark-heading capitalize">{o.label}</span>
                      <span className="text-xs font-mono text-primary">{(o.confidence * 100).toFixed(1)}%</span>
                    </motion.div>
                  ))}
                </div>
              )
            ) : (
              <p className="text-xs text-dark-text/50">Analyze chaple object list ashbe.</p>
            )}
            {result && (
              <p className="text-[10px] text-dark-text/40 mt-2">⏱ {result.elapsed_ms.toFixed(0)} ms</p>
            )}
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
