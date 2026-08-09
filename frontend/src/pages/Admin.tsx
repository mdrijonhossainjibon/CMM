import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import GlassPanel from '../components/common/GlassPanel';
import StatCard from '../components/common/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import { Icon } from '../components/common/Icons';
import { getUsers, getStats, getGpuStatus, getStorageStatus } from '../services/adminService';
import type { AdminUserInfo, AdminStatsResponse, AdminGpuResponse, AdminStorageResponse } from '../types';

function safePercent(value: number, total: number): string {
  if (!total || total <= 0) return '0';
  return Math.min((value / total) * 100, 100).toFixed(0);
}

function formatMemory(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}GB`;
  return `${mb}MB`;
}

function getUsageColor(percent: number): string {
  if (percent >= 90) return 'bg-red-500';
  if (percent >= 70) return 'bg-amber-400';
  return 'bg-primary';
}

const coreOpacities: number[] = [];
function getCoreOpacity(i: number): number {
  if (coreOpacities[i] === undefined) {
    coreOpacities[i] = 0.35 + ((i * 17) % 100) / 143;
  }
  return coreOpacities[i];
}

function CpuCoresRow({ utilization }: { utilization: number }) {
  const cores = navigator.hardwareConcurrency || 4;
  const displayCores = cores > 32 ? 32 : cores;

  return (
    <div className="p-3 sm:p-4 rounded-lg bg-dark-surface border border-dark-border">
      <p className="text-[10px] sm:text-xs text-dark-text mb-2 sm:mb-3">CPU Cores</p>
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5 sm:gap-1 overflow-x-auto flex-1 min-w-0 pb-1">
          {Array.from({ length: displayCores }).map((_, i) => (
            <div
              key={i}
              className="w-1.5 sm:w-2 h-5 sm:h-6 rounded-sm flex-shrink-0"
              style={{
                backgroundColor: `rgb(${Math.min(255, 50 + (utilization / 100) * 205)}, ${Math.max(30, 220 - (utilization / 100) * 190)}, 80)`,
                opacity: getCoreOpacity(i),
              }}
            />
          ))}
        </div>
        <span className="text-[10px] sm:text-xs text-dark-text whitespace-nowrap flex-shrink-0">
          {cores} {cores > 1 ? 'cores' : 'core'}
        </span>
      </div>
    </div>
  );
}

function GpuCpuPanel({ data }: { data: AdminGpuResponse }) {
  const isGpu = data.type === 'gpu';
  const memPercent = Number(safePercent(data.memory_used, data.memory_total));

  return (
    <GlassPanel>
      <div className="flex items-center gap-2 mb-4">
        <Icon name="gpu" className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
        <h3 className="text-xs sm:text-sm font-medium text-dark-heading">
          {isGpu ? 'GPU Status' : 'System Status'}
        </h3>
        <span
          className={`ml-auto px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-medium uppercase ${
            isGpu
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-primary/10 text-primary'
          }`}
        >
          {isGpu ? 'GPU' : 'CPU'}
        </span>
      </div>

      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] sm:text-sm text-dark-text whitespace-nowrap">Device</span>
          <span className="text-[10px] sm:text-sm text-dark-heading font-medium truncate text-right max-w-[180px] sm:max-w-none">
            {data.name}
          </span>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] sm:text-xs text-dark-text">
              {isGpu ? 'VRAM' : 'System RAM'}
            </span>
            <span className="text-[10px] sm:text-xs text-dark-text">
              {formatMemory(data.memory_used)} / {formatMemory(data.memory_total)}
            </span>
          </div>
          <div className="w-full h-1.5 sm:h-2 rounded-full bg-dark-border overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${getUsageColor(memPercent)}`}
              initial={{ width: 0 }}
              animate={{ width: `${memPercent}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="p-2.5 sm:p-3 rounded-lg bg-dark-surface border border-dark-border">
            <p className="text-[10px] sm:text-xs text-dark-text">Utilization</p>
            <div className="flex items-end gap-1">
              <p className="text-base sm:text-lg font-semibold text-dark-heading">{data.utilization}</p>
              <p className="text-[10px] sm:text-xs text-dark-text mb-0.5">%</p>
            </div>
            <div className="w-full h-1 rounded-full bg-dark-border mt-1.5 sm:mt-2 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${getUsageColor(data.utilization)}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(data.utilization, 100)}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </div>

          <div className="p-2.5 sm:p-3 rounded-lg bg-dark-surface border border-dark-border">
            <p className="text-[10px] sm:text-xs text-dark-text">Temperature</p>
            {isGpu && data.temperature > 0 ? (
              <div className="flex items-end gap-1">
                <p className="text-base sm:text-lg font-semibold text-dark-heading">{data.temperature}</p>
                <p className="text-[10px] sm:text-xs text-dark-text mb-0.5">°C</p>
              </div>
            ) : (
              <p className="text-base sm:text-lg font-semibold text-dark-text/40">
                {isGpu ? '--' : 'N/A'}
              </p>
            )}
            {isGpu && data.temperature > 0 && (
              <div className="w-full h-1 rounded-full bg-dark-border mt-1.5 sm:mt-2 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${data.temperature >= 80 ? 'bg-red-500' : data.temperature >= 65 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(data.temperature, 100)}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            )}
          </div>
        </div>

        {!isGpu && data.utilization > 0 && (
          <CpuCoresRow utilization={data.utilization} />
        )}
      </div>
    </GlassPanel>
  );
}

export default function Admin() {
  const [users, setUsers] = useState<AdminUserInfo[]>([]);
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [gpu, setGpu] = useState<AdminGpuResponse | null>(null);
  const [storage, setStorage] = useState<AdminStorageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'gpu' | 'storage'>('overview');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, statsRes, gpuRes, storageRes] = await Promise.allSettled([
        getUsers(),
        getStats(),
        getGpuStatus(),
        getStorageStatus(),
      ]);

      const getValue = <T,>(result: PromiseSettledResult<T>, fallback: T): T =>
        result.status === 'fulfilled' ? result.value : fallback;

      const usersData = getValue(usersRes, { users: [] as AdminUserInfo[] });
      setUsers(usersData.users || []);

      const statsData = getValue(statsRes, null as AdminStatsResponse | null);
      setStats(statsData);

      const gpuData = getValue(gpuRes, null as AdminGpuResponse | null);
      setGpu(gpuData);

      const storageData = getValue(storageRes, null as AdminStorageResponse | null);
      setStorage(storageData);

      const allFailed = [usersRes, statsRes, gpuRes, storageRes].every(
        (r) => r.status === 'rejected'
      );
      if (allFailed) {
        setError('Could not connect to server. Check your connection and try again.');
      }
    } catch {
      setError('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingSpinner text="Loading admin data..." />;
  if (error) return <ErrorMessage message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6">
      <GlassPanel padding={false}>
        <div className="flex border-b border-dark-border overflow-x-auto">
          {(['overview', 'users', 'gpu', 'storage'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab ? 'text-primary border-b-2 border-primary' : 'text-dark-text hover:text-dark-heading'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </GlassPanel>

      {activeTab === 'overview' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <StatCard label="Total Users" value={stats?.total_users ?? 0} icon="users" />
          <StatCard label="Total Models" value={stats?.total_models ?? 0} icon="models" />
          <StatCard label="Total Datasets" value={stats?.total_datasets ?? 0} icon="datasets" />
          <StatCard label="Version" value={stats?.version ?? 'N/A'} icon="info" />
        </motion.div>
      )}

      {activeTab === 'users' && (
        <GlassPanel>
          <h3 className="text-sm font-medium text-dark-heading mb-4">User Management</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-dark-text border-b border-dark-border">
                <th className="pb-2 font-medium">Username</th>
                <th className="pb-2 font-medium">Role</th>
              </tr>
            </thead>
            <tbody className="text-dark-text">
              {users.map((user) => (
                <tr key={user.username} className="border-b border-dark-border/50">
                  <td className="py-2 flex items-center gap-2">
                    <Icon name="users" className="w-4 h-4 text-dark-text" />
                    {user.username}
                  </td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      user.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-dark-surface text-dark-text'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={2} className="py-4 text-center text-dark-text/40">No users found</td></tr>
              )}
            </tbody>
          </table>
        </GlassPanel>
      )}

      {activeTab === 'gpu' && gpu && <GpuCpuPanel data={gpu} />}

      {activeTab === 'storage' && (
        <GlassPanel>
          <h3 className="text-sm font-medium text-dark-heading mb-4">Storage Monitoring</h3>
          {storage ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-dark-text">Disk Usage</span>
                  <span className="text-xs text-dark-text">
                    {(storage.used_space / (1024 * 1024 * 1024)).toFixed(1)}GB / {(storage.total_space / (1024 * 1024 * 1024)).toFixed(1)}GB
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-dark-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${safePercent(storage.used_space, storage.total_space)}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="p-3 rounded-lg bg-dark-surface border border-dark-border">
                  <p className="text-xs text-dark-text">Training Data</p>
                  <p className="text-lg font-semibold text-dark-heading">
                    {(storage.training_data_size / (1024 * 1024)).toFixed(1)}MB
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-dark-surface border border-dark-border">
                  <p className="text-xs text-dark-text">Models</p>
                  <p className="text-lg font-semibold text-dark-heading">
                    {(storage.models_size / (1024 * 1024)).toFixed(1)}MB
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-dark-text/40 text-center py-8">Storage information not available</p>
          )}
        </GlassPanel>
      )}
    </div>
  );
}
