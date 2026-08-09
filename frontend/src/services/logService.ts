import client from './apiClient';
import type { LogEntry } from '../types';

export async function getLogs(): Promise<LogEntry> {
  const res = await client.get<LogEntry>('/logs', {
    timeout: 5000,
  });
  return res.data;
}

export async function readLogFile(filename: string): Promise<string> {
  const res = await client.get<string>('/logs/read', {
    params: { file: filename },
    responseType: 'text',
    timeout: 10000,
  });
  return res.data;
}
