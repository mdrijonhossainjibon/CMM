import client from './apiClient';

export interface DetectorObject {
  label: string;
  confidence: number;
  box?: number[] | null;
}

export interface DetectorSceneItem {
  label: string;
  confidence: number;
}

export interface DetectorResult {
  success: boolean;
  objects: DetectorObject[];
  scene: string | null;
  scene_confidence: number;
  scene_top: DetectorSceneItem[];
  elapsed_ms: number;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function analyzeImage(file: File, confThreshold = 0.35): Promise<DetectorResult> {
  const image = await fileToBase64(file);
  const res = await client.post<DetectorResult>('/analyze', {
    image,
    conf_threshold: confThreshold,
  });
  return res.data;
}
