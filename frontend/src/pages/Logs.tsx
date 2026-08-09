import { useState, useEffect, useCallback } from 'react';
import GlassPanel from '../components/common/GlassPanel';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import EmptyState from '../components/common/EmptyState';
import { getLogs, readLogFile } from '../services/logService';
import type { LogEntry } from '../types';

export default function Logs() {
  const [data, setData] = useState<LogEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLog, setSelectedLog] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getLogs();
      setData(res);
      if (res.logs.length > 0 && !selectedLog) {
        setSelectedLog(res.logs[0]);
      }
    } catch {
      setError('Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [selectedLog]);

  useEffect(() => { fetchLogs(); }, []);

  if (loading) return <LoadingSpinner text="Loading logs..." />;
  if (error) return <ErrorMessage message={error} onRetry={fetchLogs} />;
  if (!data || data.logs.length === 0) {
    return <EmptyState title="No logs available" description="Log files will appear here after training runs" />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6 h-[calc(100vh-160px)] lg:h-[calc(100vh-140px)]">
      <GlassPanel className="lg:col-span-1 overflow-y-auto">
        <h3 className="text-sm font-medium text-dark-heading mb-3">Log Files</h3>
        <div className="space-y-1">
          {data.logs.map((log) => (
            <button
              key={log}
              onClick={() => setSelectedLog(log)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedLog === log
                  ? 'bg-primary/10 text-primary'
                  : 'text-dark-text hover:bg-dark-surface hover:text-dark-heading'
              }`}
            >
              {log}
            </button>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel className="lg:col-span-3 overflow-hidden flex flex-col">
        <h3 className="text-sm font-medium text-dark-heading mb-3">
          {selectedLog || 'Select a log file'}
        </h3>
        <div className="flex-1 bg-dark-surface rounded-lg p-4 overflow-y-auto font-mono text-xs text-dark-text leading-relaxed">
          {selectedLog ? (
            <LogViewer filename={selectedLog} />
          ) : (
            <p className="text-dark-text/40 text-center py-8">Select a log file to view</p>
          )}
        </div>
      </GlassPanel>
    </div>
  );
}

function LogViewer({ filename }: { filename: string }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    readLogFile(filename)
      .then(setContent)
      .catch(() => setContent('Failed to load log content'))
      .finally(() => setLoading(false));
  }, [filename]);

  if (loading) return <p className="text-dark-text/40">Loading...</p>;

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
