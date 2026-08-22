"""Object segmentation module.

Produces binary masks (white = object, black = background) for each detected
object. Uses a YOLO segmentation model when available, otherwise falls back to
a lightweight clustering-based mask from the detection bounding box.
"""
import os
import logging
import base64
import io
from typing import List, Dict, Any, Optional

from PIL import Image

logger = logging.getLogger("captchamaster.vision.segment")

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
SEG_MODEL_PATH = os.path.join(MODELS_DIR, "yolov8-seg.pt")


class Segmenter:
    def __init__(self, seg_model_path: Optional[str] = SEG_MODEL_PATH):
        self.device = "cpu"
        self.model = None
        self.model_name = "fallback"
        if os.path.exists(seg_model_path):
            try:
                import torch
                if torch.cuda.is_available():
                    self.device = "cuda"
                from ultralytics import YOLO
                self.model = YOLO(seg_model_path)
                self.model_name = os.path.basename(seg_model_path)
                logger.info("Loaded segmentation model: %s (%s)", seg_model_path, self.device)
            except Exception as e:
                logger.warning("Failed to load segmentation model %s: %s", seg_model_path, e)
                self.model = None
        else:
            logger.info("No segmentation model at %s — using detection-box fallback masks", seg_model_path)

    def segment(self, image: Image.Image, detections: List[Dict[str, Any]],
                conf_threshold: float = 0.5) -> List[Dict[str, Any]]:
        """Return list of mask dicts: {mask_png_b64, label, confidence, box}."""
        if self.model is not None:
            try:
                return self._segment_yolo(image, conf_threshold)
            except Exception as e:  # pragma: no cover
                logger.warning("YOLO segmentation failed (%s), falling back", e)
        return self._segment_from_boxes(image, detections, conf_threshold)

    def _segment_yolo(self, image: Image.Image, conf_threshold: float):
        import torch
        res = self.model.predict(image, conf=conf_threshold, device=self.device, verbose=False)
        masks_out: List[Dict[str, Any]] = []
        if res and len(res) > 0 and res[0].masks is not None:
            masks = res[0].masks
            boxes = res[0].boxes
            for i, m in enumerate(masks.data):
                mask_np = m.cpu().numpy()
                mask_img = (mask_np * 255).astype("uint8")
                pil = Image.fromarray(mask_img, mode="L")
                buf = io.BytesIO()
                pil.save(buf, format="PNG")
                b64 = base64.b64encode(buf.getvalue()).decode()
                cls = int(boxes.cls[i]) if boxes is not None else 0
                conf = float(boxes.conf[i]) if boxes is not None else 0.0
                box = boxes.xyxy[i].tolist() if boxes is not None else []
                label = self.model.names[cls] if hasattr(self.model, "names") else str(cls)
                masks_out.append({
                    "mask_png_b64": b64,
                    "label": label,
                    "confidence": conf,
                    "box": [float(x) for x in box],
                })
        return masks_out

    def _segment_from_boxes(self, image: Image.Image, detections: List[Dict[str, Any]],
                            conf_threshold: float) -> List[Dict[str, Any]]:
        """Approximate masks with filled bounding-rectangle alpha blobs."""
        masks_out: List[Dict[str, Any]] = []
        w, h = image.size
        for det in detections:
            conf = det.get("confidence", 0)
            if conf < conf_threshold:
                continue
            box = det.get("box")
            if not box or len(box) < 4:
                continue
            x1, y1, x2, y2 = [float(v) for v in box[:4]]
            x1, y1, x2, y2 = max(0, x1), max(0, y1), min(w, x2), min(h, y2)
            mask = Image.new("L", (w, h), 0)
            from PIL import ImageDraw
            d = ImageDraw.Draw(mask)
            d.rectangle([x1, y1, x2, y2], fill=255)
            buf = io.BytesIO()
            mask.save(buf, format="PNG")
            masks_out.append({
                "mask_png_b64": base64.b64encode(buf.getvalue()).decode(),
                "label": det.get("label", ""),
                "confidence": conf,
                "box": [x1, y1, x2, y2],
            })
        return masks_out
