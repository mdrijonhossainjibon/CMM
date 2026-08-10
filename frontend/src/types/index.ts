export interface LoginRequest {
  username: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type?: string;
  username: string;
  role: string;
}

export interface UserResponse {
  username: string;
  role: string;
}

export interface DetectionObject {
  label: string;
  confidence: number;
  box: number[];
}

export interface DetectResponse {
  success: boolean;
  detected_objects: DetectionObject[];
  count: number;
  model_name?: string;
  model_type?: string;
  model_classes?: string[];
}

export interface BatchDetectRequest {
  imageData: string[];
  conf_threshold: number;
  question?: string;
}

export interface BatchDetectResponse {
  success: boolean;
  results: DetectionObject[][];
  solution?: number[];
}

export interface TrainingStartResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface TrainingStatusResponse {
  running: boolean;
  status: string;
  progress: number;
  training_type?: string;
  device_type?: 'gpu' | 'cpu';
  gpu_name?: string;
  batch_size?: number;
  workers?: number;
  gpu_util?: number;
  gpu_mem_used?: number;
  gpu_mem_total?: number;
  gpu_temperature?: number;
}

export interface ModelInfo {
  filename: string;
  path: string;
  size: string;
  classes: string[];
  created_at?: string;
  source?: 'system' | 'local' | 'cloud';
  is_system?: boolean;
}

export interface ModelListResponse {
  success: boolean;
  models: ModelInfo[];
}

export interface ModelInfoResponse {
  model_name: string;
  device: string;
}

export interface DatasetImageResponse {
  images: string[];
  count: number;
  path: string;
  source?: string;
  classes?: string[];
}

export interface SaveTrainingDataResponse {
  success: boolean;
  saved_as?: string;
  error?: string;
}

export interface UploadMultipleResponse {
  success: boolean;
  saved_count: number;
  skipped_count: number;
  saved_files: string[];
}

export interface TrainingClass {
  name: string;
  count: number;
}

export interface TrainingClassesResponse {
  classes: TrainingClass[];
  total_images: number;
}

export interface TrainingImage {
  filename: string;
  class: string;
}

export interface TrainingImagesResponse {
  images: TrainingImage[];
}

export interface BatchUploadResponse {
  success: boolean;
  saved_count: number;
  error_count: number;
  saved_files: string[];
  errors: string[];
}

export interface AdminUserInfo {
  username: string;
  role: string;
  created_at?: string;
}

export interface AdminUsersResponse {
  users: AdminUserInfo[];
}

export interface AdminStatsResponse {
  total_users: number;
  total_models: number;
  total_datasets: number;
  total_detections: number;
  uptime?: string;
  version?: string;
}

export interface AdminGpuResponse {
  type: 'gpu' | 'cpu';
  name: string;
  memory_used: number;
  memory_total: number;
  utilization: number;
  temperature: number;
}

export interface AdminStorageResponse {
  total_space: number;
  used_space: number;
  free_space: number;
  training_data_size: number;
  models_size: number;
}

export type IconName =
  | 'dashboard' | 'detection' | 'training' | 'models'
  | 'analytics' | 'datasets' | 'logs' | 'settings'
  | 'sun' | 'moon' | 'chevronLeft' | 'chevronRight'
  | 'empty' | 'device' | 'images' | 'clock'
  | 'detectionCount' | 'brain' | 'activity' | 'upload'
  | 'shield' | 'database' | 'box' | 'fileText'
  | 'layout' | 'users' | 'gpu' | 'hardDrive'
  | 'refresh' | 'download' | 'trash' | 'search'
  | 'plus' | 'x' | 'check' | 'alertTriangle'
  | 'wifi' | 'wifiOff' | 'power' | 'info'
  | 'dataset' | 'success' | 'storage';

export interface TrainingType {
  name: string;
  output_prefix: string;
}

export interface TrainingTypesResponse {
  success: boolean;
  training_types: Record<string, TrainingType>;
}

export interface TrainingConfig {
  training_type: string;
  epochs: number;
  batch_size: number;
  image_size: number;
  workers: number;
  optimize?: boolean;
  selected_classes?: string[];
}

export interface TrainingMetricsResponse {
  epoch: number;
  loss: number;
  accuracy: number;
  precision: number;
  recall: number;
  mAP50: number;
  mAP50_95: number;
}

export interface ExportItem {
  filename: string;
  size: string;
  path: string;
  classes: string[];
  created_at?: string;
  source?: 'system' | 'local' | 'cloud';
  is_system?: boolean;
}

export interface ExportsResponse {
  success: boolean;
  exports: ExportItem[];
}

export interface DashboardStats {
  totalDatasets: number;
  totalImages: number;
  totalModels: number;
  activeTrainings: number;
  successRate: number;
  storageUsage: string;
}
