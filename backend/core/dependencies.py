from fastapi import Depends
from typing import Optional
from backend.core.security import get_current_user
from backend.training.detector import CaptchaDetector

_model_paths = {
    "aws": "exports/aws.pt",
    "kbs": "exports/kbs.pt",
    "kb-l": "exports/kb-l.pt",
    "custom": "exports/custom.pt",
}

_detectors: dict[str, CaptchaDetector] = {}


def _get_model_path(model_type: str) -> str:
    return _model_paths.get(model_type, "backend/model/best.pt")


def get_detector(model_type: str = "auto") -> CaptchaDetector:
    global _detectors
    path = _get_model_path(model_type)
    key = f"{model_type}:{path}"
    if key not in _detectors:
        _detectors[key] = CaptchaDetector(model_path=path)
    return _detectors[key]


def get_default_detector() -> CaptchaDetector:
    return get_detector("auto")


def reload_detector_instance():
    global _detectors
    _detectors.clear()
    return get_default_detector()
