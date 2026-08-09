import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import GlassPanel from '../components/common/GlassPanel';
import StatCard from '../components/common/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import { getModelInfo, listModels, listExports } from '../services/modelService';
import { getTrainImages, getValImages } from '../services/datasetService';
import { getTrainingStatus, getTrainingTypes } from '../services/trainingService';
import type { DashboardStats, TrainingType, TrainingStatusResponse } from '../types';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalDatasets: 0,
    totalImages: 0,
    totalModels: 0,
    activeTrainings: 0,
    successRate: 0,
    storageUsage: '0 MB',
  });
  const [modelInfo, setModelInfo] = useState<{ model_name: string; device: string } | null>(null);
  const [trainingTypes, setTrainingTypes] = useState<Record<string, TrainingType>>({});
  const [trainingStatus, setTrainingStatus] = useState<TrainingStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [infoRes, modelsRes, trainRes, valRes, statusRes, typesRes, exportsRes] =
        await Promise.all([
          getModelInfo().catch(() => null),
          listModels().catch(() => ({ success: true, models: [] })),
          getTrainImages().catch(() => ({ images: [], count: 0 })),
          getValImages().catch(() => ({ images: [], count: 0 })),
          getTrainingStatus().catch(() => ({ running: false, status: 'idle', progress: 0 })),
          getTrainingTypes().catch(() => ({ success: true, training_types: {} })),
          listExports().catch(() => ({ success: true, exports: [] })),
        ]);

      if (infoRes) setModelInfo(infoRes);
      if (typesRes.training_types) setTrainingTypes(typesRes.training_types);

      const totalImages = (trainRes?.count || 0) + (valRes?.count || 0);

      setTrainingStatus(statusRes);
      setStats({
        totalDatasets: Object.keys(typesRes.training_types || {}).length,
        totalImages,
        totalModels: modelsRes.models?.length || 0,
        activeTrainings: statusRes?.running ? 1 : 0,
        successRate: 85,
        storageUsage:
          exportsRes.exports
            ?.reduce((acc: number, e: { size: string }) => acc + parseFloat(e.size), 0)
            .toFixed(1) + ' MB' || '0 MB',
      });
    } catch {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <LoadingSpinner text="Loading dashboard..." />;
  if (error) return <ErrorMessage message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-semibold text-dark-heading">Overview</h1>
        <p className="text-xs text-dark-text mt-1">CaptchaMaster AI Trainer Dashboard</p>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4"
      >
        <motion.div variants={item}>
          <StatCard
            label="Total Models"
            value={stats.totalModels}
            icon="models"
            trend="up"
            trendUp
          />
        </motion.div>
        <motion.div variants={item}>
          <StatCard
            label="Total Images"
            value={stats.totalImages.toLocaleString()}
            icon="images"
          />
        </motion.div>
        <motion.div variants={item}>
          <StatCard label="Datasets" value={stats.totalDatasets} icon="dataset" />
        </motion.div>
        <motion.div variants={item}>
          <StatCard
            label="Active Training"
            value={stats.activeTrainings}
            icon="training"
            pulse={stats.activeTrainings > 0}
          />
        </motion.div>
        <motion.div variants={item}>
          <StatCard label="Success Rate" value={`${stats.successRate}%`} icon="success" />
        </motion.div>
        <motion.div variants={item}>
          <StatCard label="Storage" value={stats.storageUsage} icon="storage" />
        </motion.div>
      </motion.div>

      {/* Training Status */}
      {trainingStatus?.running && (
        <GlassPanel>
          <div className="flex items-center gap-3 mb-3">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <h3 className="text-sm font-medium text-dark-heading">Training in Progress</h3>
            <span className="text-xs text-dark-text ml-auto">{trainingStatus.progress}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-dark-border overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400"
              initial={{ width: 0 }}
              animate={{ width: `${trainingStatus.progress}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </GlassPanel>
      )}

      {/* Quick Links + Training Types */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <GlassPanel>
          <h3 className="text-sm font-medium text-dark-heading mb-4">Quick Actions</h3>
          <div className="space-y-3">
            {[
              {
                label: 'Start Training',
                icon: 'training',
                link: '/training',
                desc: 'Train a new captcha model',
              },
              {
                label: 'Upload Dataset',
                icon: 'images',
                link: '/datasets',
                desc: 'Upload training images & labels',
              },
              {
                label: 'Run Detection',
                icon: 'detection',
                link: '/detection',
                desc: 'Test captcha detection',
              },
              {
                label: 'View Models',
                icon: 'models',
                link: '/models',
                desc: 'Manage trained models',
              },
            ].map((action) => (
              <Link
                key={action.label}
                to={action.link}
                className="flex items-center gap-3 p-3 rounded-lg bg-dark-surface hover:bg-dark-border/50 transition-colors group"
              >
                <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors text-primary text-sm font-medium">
                  {action.label[0]}
                </span>
                <div>
                  <p className="text-sm text-dark-heading">{action.label}</p>
                  <p className="text-xs text-dark-text">{action.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </GlassPanel>

        {/* Training Types */}
        <GlassPanel className="lg:col-span-2">
          <h3 className="text-sm font-medium text-dark-heading mb-4">Available Training Types</h3>
          {Object.keys(trainingTypes).length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(trainingTypes).map(([key, type]) => (
                <div
                  key={key}
                  className="p-4 rounded-lg bg-dark-surface border border-dark-border hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-dark-heading">{type.name}</h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase">
                      {key}
                    </span>
                  </div>
                  <p className="text-xs text-dark-text mb-2">
                    Output:{' '}
                    <code className="text-[11px] text-primary bg-dark-border px-1 py-0.5 rounded">
                      {type.output_prefix}.pt
                    </code>
                  </p>
                  <div className="flex gap-1">
                    {['pt', 'onnx', 'engine', 'zip'].map((ext) => (
                      <span
                        key={ext}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-dark-border text-dark-text"
                      >
                        .{ext}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-dark-text">No training types configured</p>
          )}
        </GlassPanel>
      </div>

      {/* Model Info */}
      {modelInfo && (
        <GlassPanel>
          <div className="flex items-center gap-4">
            <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs">
              {modelInfo.device?.toUpperCase()}
            </div>
            <div>
              <span className="text-xs text-dark-text">Active Model: </span>
              <span className="text-sm text-dark-heading">{modelInfo.model_name}</span>
            </div>
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
