import client from './apiClient';

export interface AnalyticsStats {
  total_detections: number;
  total_images: number;
  total_objects: number;
  avg_confidence: number;
  avg_processing_ms: number;
  models_used: number;
  today_detections: number;
}

export interface HistoryPoint {
  label: string;
  count: number;
  objects: number;
}

export interface ClassDistItem {
  class: string;
  count: number;
}

export interface RecentActivity {
  id: string;
  type: string;
  images: number;
  objects: number;
  confidence: number;
  model: string;
  created_at: string | null;
}

export interface AnalyticsResponse {
  success: boolean;
  stats: AnalyticsStats;
  history: HistoryPoint[];
  class_distribution: ClassDistItem[];
  recent: RecentActivity[];
}

export async function getAnalytics(): Promise<AnalyticsResponse> {
  const res = await client.get<AnalyticsResponse>('/analytics', { timeout: 10000 });
  return res.data;
}
