import type { DetectionObject } from '../../types';

interface ResultOverlayProps {
  imageUrl: string;
  detections: DetectionObject[];
  imageWidth?: number;
  imageHeight?: number;
}

export default function ResultOverlay({ imageUrl, detections, imageWidth = 640, imageHeight = 480 }: ResultOverlayProps) {
  return (
    <div className="relative inline-block rounded-xl overflow-hidden">
      <img src={imageUrl} alt="Detection" className="max-w-full h-auto" />
      {/* Scan line animation */}
      <div className="absolute inset-x-0 h-0.5 bg-primary/60 shadow-[0_0_8px_rgba(99,102,241,0.6)] animate-scan" />
      {/* Bounding boxes */}
      {detections.map((det, i) => (
        <div
          key={i}
          className="absolute border-2 border-primary rounded"
          style={{
            left: `${(det.box[0] / imageWidth) * 100}%`,
            top: `${(det.box[1] / imageHeight) * 100}%`,
            width: `${((det.box[2] - det.box[0]) / imageWidth) * 100}%`,
            height: `${((det.box[3] - det.box[1]) / imageHeight) * 100}%`,
          }}
        >
          <span className="absolute -top-5 left-0 bg-primary text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
            {det.label} {(det.confidence * 100).toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  );
}
