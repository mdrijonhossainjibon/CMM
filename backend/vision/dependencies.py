"""Vision singleton model loaders (detector, scene, segmenter)."""
import logging

from backend.training.detector import CaptchaDetector
from backend.vision.scene import SceneClassifier
from backend.vision.segmenter import Segmenter

logger = logging.getLogger("captchamaster.vision.deps")

_detector: CaptchaDetector | None = None
_scene: SceneClassifier | None = None
_segmenter: Segmenter | None = None


def get_detector() -> CaptchaDetector:
    global _detector
    if _detector is None:
        _detector = CaptchaDetector()
    return _detector


def get_scene_classifier() -> SceneClassifier:
    global _scene
    if _scene is None:
        _scene = SceneClassifier()
    return _scene


def get_segmenter() -> Segmenter:
    global _segmenter
    if _segmenter is None:
        _segmenter = Segmenter()
    return _segmenter


def reset_vision_models():
    global _detector, _scene, _segmenter
    _detector = None
    _scene = None
    _segmenter = None
    logger.info("Vision models reset")
