import { useState, useEffect, useCallback } from 'react';
import GlassPanel from '../components/common/GlassPanel';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import EmptyState from '../components/common/EmptyState';
import Modal from '../components/common/Modal';
import { getLogs, readLogFile, deleteLogSession, type LogSession } from '../services/logService';
import toast from 'react-hot-toast';

function formatDuration(seconds?: number | null): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds} sec`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min} min`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr} hr`;
}

export default function Logs() {
  const [sessions, setSessions] = useState<LogSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getLogs();
      setSessions(res.logs);
      if (res.logs.length > 0 && !selectedId) {
        setSelectedId(res.logs[0].id);
      }
    } catch {
      setError('Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { fetchLogs(); }, []);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteLogSession(confirmDelete);
      toast.success('Log session deleted');
      if (selectedId === confirmDelete) setSelectedId(null);
      setConfirmDelete(null);
      fetchLogs();
    } catch {
      toast.error('Failed to delete log session');
    }
  };

  if (loading) return <LoadingSpinner text="Loading logs..." />;
  if (error) return <ErrorMessage message={error} onRetry={fetchLogs} />;
  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No logs available"
        description="Log files will appear here after training runs"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6 h-[calc(100vh-160px)] lg:h-[calc(100vh-140px)]">
      <GlassPanel className="lg:col-span-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-dark-heading">Log Sessions</h3>
          <span className="text-xs text-dark-text/60">{sessions.length}</span>
        </div>
        <div className="space-y-1.5">
          {sessions.map((s) => {
            const isRunning = s.status === 'running';
            const isFailed = s.status === 'failed';
            const isSelected = selectedId === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors border ${
                  isSelected
                    ? 'bg-primary/10 text-primary border-primary/20'
                    : 'text-dark-text hover:bg-dark-surface hover:text-dark-heading border-transparent'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">{s.name}</span>
                  <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                    isRunning ? 'bg-warning/10 text-warning' : isFailed ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
                  }`}>
                    {s.status}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-dark-border overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isFailed ? 'bg-danger' : 'bg-primary'}`}
                      style={{ width: `${Math.min(s.progress || 0, 100)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-dark-text/60 shrink-0">{s.progress}%</span>
                </div>
                <p className="mt-1 text-[9px] text-dark-text/40 truncate">
                  {s.training_type} · {s.line_count} lines
                  {s.duration_seconds != null && s.status === 'completed' && (
                    <span className="text-success/80"> · ⏱ {formatDuration(s.duration_seconds)}</span>
                  )}
                </p>
              </button>
            );
          })}
        </div>
      </GlassPanel>

      <GlassPanel className="lg:col-span-3 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-dark-heading truncate">
            {sessions.find((s) => s.id === selectedId)?.name || 'Select a session'}
          </h3>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {selectedId && (() => {
              const s = sessions.find((x) => x.id === selectedId);
              return s?.duration_seconds != null && s.status === 'completed' ? (
                <span className="text-[11px] px-2.5 py-1 rounded-lg bg-success/10 text-success border border-success/20 flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                  {formatDuration(s.duration_seconds)}
                </span>
              ) : null;
            })()}
            {selectedId && (
              <button
                onClick={() => setConfirmDelete(selectedId)}
                className="text-[11px] text-danger px-2 py-1 rounded hover:bg-danger/10 transition-colors flex items-center gap-1"
              >
                Delete
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 bg-dark-surface rounded-lg p-4 overflow-y-auto font-mono text-xs text-dark-text leading-relaxed">
          {selectedId ? (
            <LogViewer sessionId={selectedId} />
          ) : (
            <p className="text-dark-text/40 text-center py-8">Select a session to view logs</p>
          )}
        </div>
      </GlassPanel>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Log Session"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-dark-text">
            Delete this log session? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              className="flex-1 py-2.5 rounded-lg bg-danger text-white text-sm font-medium hover:opacity-90 transition-all"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmDelete(null)}
              className="px-4 py-2.5 rounded-lg border border-dark-border text-dark-text text-sm hover:bg-dark-surface transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function LogViewer({ sessionId }: { sessionId: string }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    readLogFile(sessionId)
      .then((res) => setContent(res.content))
      .catch(() => setContent('Failed to load log content'))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) return <p className="text-dark-text/40">Loading...</p>;
  if (!content) return <p className="text-dark-text/40 text-center py-8">No log content yet</p>;

  return (
    <pre className="whitespace-pre-wrap break-all">
      {content.split('\n').map((line, i) => (
        <div key={i} className="hover:bg-dark-border/30">
          <span className="text-dark-text/30 mr-4 select-none">{String(i + 1).padStart(4, '0')}</span>
          {line || ' '}
        </div>
      ))}
    </pre>
  );
}
