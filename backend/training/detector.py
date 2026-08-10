import os
os.environ['ULTRALYTICS_DISABLE_AUTOUPDATE'] = '1'

import logging
from ultralytics import YOLO
from PIL import Image
import io
import torch
from typing import List, Dict, Any, Optional
import asyncio
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger("captchamaster.training")

class CaptchaDetector:
    def __init__(self, model_path: str = "backend/model/best.pt"):
        """Initialize the YOLO model detector for captcha detection."""
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        logger.info("Using device: %s", self.device)
        self.model_path = model_path
        
        self.synonym_map = {
            'clock': ['clock', 'watch'],
            'bag': ['handbag', 'backpack', 'suitcase'],
            'hat': ['cap', 'helmet'],
            'car': ['taxi', 'toy car']
        }
        
        self.label_map = {}
        for canonical, synonyms in self.synonym_map.items():
            for syn in synonyms:
                self.label_map[syn.lower()] = canonical
                
        self.executor = ThreadPoolExecutor(max_workers=4)
        
        self.reload_model()
    
    def reload_model(self):
        """Reload the model from disk."""
        try:
            self.model = YOLO(self.model_path)
            self.model_name = os.path.basename(self.model_path)
            logger.info("Successfully loaded model from %s", self.model_path)
        except Exception as e:
            logger.warning("Failed to load custom model from %s: %s", self.model_path, e)
            logger.info("Falling back to yolov8n.pt...")
            self.model = YOLO("yolov8n.pt")
            self.model_name = "YOLOv8n Fallback"
    
    def _normalize_label(self, label: str) -> str:
        """Normalize detected label using synonym mapping."""
        return self.label_map.get(label.lower(), label.lower())
    
    async def detect_objects(self, image_data: bytes, conf_threshold: float = 0.5) -> List[Dict[str, Any]]:
        """Perform captcha detection on image data."""
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(
            self.executor, 
            self._inference_sync, 
            image_data, 
            conf_threshold
        )
        return results
    
    def _inference_sync(self, image_data: bytes, conf_threshold: float) -> List[Dict[str, Any]]:
        """Synchronous inference function."""
        image = Image.open(io.BytesIO(image_data))
        results = self.model(image, conf=conf_threshold, device=self.device)
        
        detected_objects = []
        if results and len(results) > 0:
            result = results[0]
            if result.boxes is not None:
                for box, conf, cls in zip(result.boxes.xyxy, result.boxes.conf, result.boxes.cls):
                    label = self.model.names[int(cls)]
                    normalized_label = self._normalize_label(label)
                    
                    detected_objects.append({
                        "label": normalized_label,
                        "confidence": float(conf),
                        "box": [float(x) for x in box.tolist()]
                    })
        
        detected_objects.sort(key=lambda x: x['confidence'], reverse=True)
        return detected_objects
    
    async def detect_batch(self, image_list: List[bytes], conf_threshold: float = 0.80) -> List[List[Dict[str, Any]]]:
        """Perform batch captcha detection on multiple images."""
        tasks = [self.detect_objects(img, conf_threshold) for img in image_list]
        results = await asyncio.gather(*tasks)
        return results


