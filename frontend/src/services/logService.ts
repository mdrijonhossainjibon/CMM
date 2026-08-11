import client from './apiClient';

export interface LogSession {
  id: string;
  name: string;
  training_type: string;
  status: string;
  progress: number;
  line_count: number;
  started_at?: string;
  ended_at?: string;
  duration_seconds?: number | null;
}

export interface LogSessionDetail {
  id: string;
  name: string;
  status: string;
  progress: number;
  content: string;
}

export async function getLogs(): Promise<{ logs: LogSession[]; count: number }> {
  const res = await client.get('/logs', {
    timeout: 5000,
  });
  return res.data;
}

export async function readLogFile(sessionId: string): Promise<LogSessionDetail> {
  const res = await client.get('/logs/read', {
    params: { session_id: sessionId },
    timeout: 10000,
  });
  return res.data;
}

export async function deleteLogSession(sessionId: string) {
  const res = await client.delete(`/logs/session/${sessionId}`, {
    timeout: 5000,
  });
  return res.data;
}
