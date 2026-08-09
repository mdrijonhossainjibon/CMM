from typing import List, Dict, Any, Optional
from backend.training.detector import CaptchaDetector


class DetectionService:
    def __init__(self, detector: CaptchaDetector):
        self.detector = detector

    async def detect(self, image_data: bytes, conf_threshold: float = 0.5) -> List[Dict[str, Any]]:
        return await self.detector.detect_objects(image_data, conf_threshold)

    async def detect_batch(
        self, images_data: List[bytes], conf_threshold: float = 0.5
    ) -> List[List[Dict[str, Any]]]:
        return await self.detector.detect_batch(images_data, conf_threshold)

    def get_model_info(self) -> Dict[str, str]:
        return {
            "model_name": self.detector.model_name,
            "device": self.detector.device,
        }

    def reload_model(self):
        self.detector.reload_model()
