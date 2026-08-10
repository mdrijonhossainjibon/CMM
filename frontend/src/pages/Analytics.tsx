import { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import GlassPanel from '../components/common/GlassPanel';
import StatCard from '../components/common/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import EmptyState from '../components/common/EmptyState';
import { getAnalytics, type AnalyticsResponse } from '../services/analyticsService';

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getAnalytics();
      setData(res);
    } catch {
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingSpinner text="Loading analytics..." />;
  if (error) return <ErrorMessage message={error} onRetry={fetchData} />;

  const stats = data?.stats;
  const history = data?.history ?? [];
  const classes = data?.class_distribution ?? [];
  const recent = data?.recent ?? [];

  const isEmpty = (stats?.total_detections ?? 0) === 0;

  const chartData = history.length > 0 ? history : [];
  const classData = classes.length > 0 ? classes : [];

  const tooltipStyle = {
    backgroundColor: 'var(--color-dark-surface, #1a1a24)',
    border: '1px solid var(--color-dark-border, #2c2c3a)',
    borderRadius: '8px',
    color: 'var(--color-dark-heading, #f5f5f7)',
    fontSize: '12px',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-dark-heading">Analytics</h1>
        <p className="text-xs text-dark-text mt-1">Detection performance & history</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        <StatCard label="Total Detections" value={(stats?.total_detections ?? 0).toLocaleString()} icon="detection" trend="up" trendUp />
        <StatCard label="Total Images" value={(stats?.total_images ?? 0).toLocaleString()} icon="images" />
        <StatCard label="Objects Found" value={(stats?.total_objects ?? 0).toLocaleString()} icon="activity" />
        <StatCard label="Avg Confidence" value={`${stats?.avg_confidence ?? 0}%`} icon="success" trend="up" trendValue="avg" />
        <StatCard label="Models Used" value={stats?.models_used ?? 0} icon="models" />
        <StatCard label="Avg Time" value={`${stats?.avg_processing_ms ?? 0}ms`} icon="clock" trend="down" trendValue="per batch" />
      </div>

      {isEmpty ? (
        <EmptyState
          title="No detection data yet"
          description="Run a detection on the Detection page — analytics will appear here automatically."
        />
      ) : (
        <>
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <GlassPanel>
              <h3 className="text-sm font-medium text-dark-heading mb-3">Detection History (24h)</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-dark-border, #2c2c3a)" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--color-dark-text, #8b8b98)', fontSize: 10 }} />
                    <YAxis tick={{ fill: 'var(--color-dark-text, #8b8b98)', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="count" name="Detections" stroke="#2563EB" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="objects" name="Objects" stroke="#10B981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </GlassPanel>

            <GlassPanel>
              <h3 className="text-sm font-medium text-dark-heading mb-3">Class Distribution</h3>
              <div className="h-56">
                {classData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={classData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-dark-border, #2c2c3a)" />
                      <XAxis dataKey="class" tick={{ fill: 'var(--color-dark-text, #8b8b98)', fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={50} />
                      <YAxis tick={{ fill: 'var(--color-dark-text, #8b8b98)', fontSize: 10 }} allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="count" name="Occurrences" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-dark-text/40 text-center py-10">No class data yet</p>
                )}
              </div>
            </GlassPanel>
          </div>

          {/* Recent Activity */}
          <GlassPanel>
            <h3 className="text-sm font-medium text-dark-heading mb-3">Recent Activity</h3>
            {recent.length === 0 ? (
              <p className="text-xs text-dark-text/40 text-center py-6">No recent detections</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="text-left text-[10px] sm:text-xs text-dark-text border-b border-dark-border">
                      <th className="pb-2 font-medium">Time</th>
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 font-medium">Images</th>
                      <th className="pb-2 font-medium">Objects</th>
                      <th className="pb-2 font-medium">Confidence</th>
                      <th className="pb-2 font-medium hidden sm:table-cell">Model</th>
                    </tr>
                  </thead>
                  <tbody className="text-dark-text">
                    {recent.map((r) => (
                      <tr key={r.id} className="border-b border-dark-border/50">
                        <td className="py-2">{formatTime(r.created_at)}</td>
                        <td className="py-2">{r.type}</td>
                        <td className="py-2">{r.images}</td>
                        <td className="py-2">{r.objects}</td>
                        <td className="py-2">{(r.confidence * 100).toFixed(1)}%</td>
                        <td className="py-2 hidden sm:table-cell text-[10px] text-primary break-all">{r.model}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassPanel>
        </>
      )}
    </div>
  );
}
