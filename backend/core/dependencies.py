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

_active_model_path: str = "backend/model/best.pt"


def _get_model_path(model_type: str) -> str:
    if model_type == "auto":
        return _active_model_path
    return _model_paths.get(model_type, _active_model_path)


def set_active_model(path: str):
    global _active_model_path, _detectors
    _active_model_path = path
    _detectors.clear()


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
