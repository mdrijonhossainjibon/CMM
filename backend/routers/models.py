import os
import time
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse

from backend.core.config import settings
from backend.core.dependencies import reload_detector_instance, set_active_model, get_model_path_for_type, reload_all_models
from backend.services.detection_service import DetectionService

router = APIRouter(prefix="/api", tags=["Models"])

SYSTEM_MODEL_PATHS = {
    "backend/model/best.pt",
    "backend/model/best.onnx",
    "yolov8n.pt",
    "yolov8n.onnx",
    "app/model/best.pt",
}


def _get_model_classes(model_path: str) -> list[str]:
    try:
        from ultralytics import YOLO
        model = YOLO(model_path)
        names = model.names
        if isinstance(names, dict):
            return list(names.values())
        elif isinstance(names, list):
            return names
        return []
    except Exception:
        pass
    # Non-YOLO models (e.g. EfficientNet scene weights) keep their classes
    # in a sibling scene_classes.json written by BG Training.
    import json
    stem = os.path.splitext(os.path.basename(model_path))[0]
    for sidecar_name in ("scene_classes.json", f"{stem}_classes.json"):
        sidecar = os.path.join(os.path.dirname(model_path), sidecar_name)
        if not os.path.exists(sidecar):
            continue
        try:
            with open(sidecar, "r", encoding="utf-8") as f:
                payload = json.load(f)
            classes = payload.get("classes")
            if isinstance(classes, list) and classes:
                return [str(c) for c in classes]
        except (json.JSONDecodeError, OSError):
            continue
    return []


def _is_system_path(norm_path: str) -> bool:
    norm = norm_path.replace("\\", "/")
    return norm in SYSTEM_MODEL_PATHS


@router.get("/models")
async def list_models():
    models = []
    search_dirs = ["app/model", "backend/model", ".", "runs"]
    seen_paths = set()
    for s_dir in search_dirs:
        if not os.path.exists(s_dir):
            continue
        for root, dirs, files in os.walk(s_dir):
            if any(x in root for x in ["venv", ".git", "__pycache__", ".ipynb_checkpoints"]):
                continue
            for file in files:
                if file.endswith(".pt"):
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, ".")
                    norm = rel_path.replace("\\", "/")
                    if norm in seen_paths:
                        continue
                    seen_paths.add(norm)
                    size_mb = os.path.getsize(full_path) / (1024 * 1024)
                    class_names = _get_model_classes(full_path)
                    mtime = os.path.getmtime(full_path)
                    created_at = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
                    models.append(
                        {
                            "filename": file,
                            "path": norm,
                            "size": f"{size_mb:.1f} MB",
                            "classes": class_names,
                            "created_at": created_at,
                            "source": "system" if _is_system_path(norm) else "local",
                            "is_system": _is_system_path(norm),
                        }
                    )
    return {"success": True, "models": models}


@router.post("/models/use")
async def use_model(body: dict):
    path = (body or {}).get("path", "")
    if not path:
        raise HTTPException(status_code=400, detail="Model path is required")
    if not os.path.exists(path) or not path.endswith(".pt"):
        raise HTTPException(status_code=404, detail="Model file not found")
    try:
        set_active_model(path)
        return {"success": True, "message": f"Model '{os.path.basename(path)}' is now active"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/models/{model_path:path}")
async def delete_model(model_path: str):
    norm = model_path.replace("\\", "/")
    if _is_system_path(norm):
        raise HTTPException(status_code=403, detail="System model cannot be deleted")
    abs_path = os.path.abspath(model_path)
    base_dir = os.path.abspath(".")
    if not abs_path.startswith(base_dir):
        raise HTTPException(status_code=403, detail="Access denied")
    if not os.path.exists(abs_path) or not abs_path.endswith(".pt"):
        raise HTTPException(status_code=404, detail="Model file not found")
    try:
        os.remove(abs_path)
        return {"success": True, "deleted": model_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models/download/{model_path:path}")
async def download_model(
    model_path: str,
):
    abs_path = os.path.abspath(model_path)
    base_dir = os.path.abspath(".")
    if not abs_path.startswith(base_dir):
        raise HTTPException(status_code=403, detail="Access denied")
    if not os.path.exists(abs_path) or not abs_path.endswith(".pt"):
        raise HTTPException(status_code=404, detail="Model file not found")
    return FileResponse(path=abs_path, filename=os.path.basename(abs_path))


@router.post("/reload")
async def reload_model():
    try:
        reload_detector_instance()
        return {"success": True, "message": "Model reloaded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/models/reload-all")
async def reload_all():
    """Warm-load all available models after training finishes."""
    try:
        report = reload_all_models()
        return {"success": True, "models": report}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/info")
async def get_info():
    from backend.core.dependencies import get_default_detector

    try:
        detector = get_default_detector()
        return {"model_name": detector.model_name, "device": detector.device}
    except Exception:
        return {"model_name": "Not Initialized", "device": "N/A"}


@router.get("/models/status")
async def get_model_status():
    """Report whether each model type's file exists and is loaded."""
    from backend.core.dependencies import _detectors

    statuses = {}
    for model_type, path in {
        "auto": _get_model_path_for_type("auto"),
        "aws": _get_model_path_for_type("aws"),
        "kbs": _get_model_path_for_type("kbs"),
        "kb-l": _get_model_path_for_type("kb-l"),
        "custom": _get_model_path_for_type("custom"),
    }.items():
        exists = os.path.exists(path) and path.endswith(".pt")
        key = f"{model_type}:{path}"
        statuses[model_type] = {
            "path": path,
            "available": exists,
            "loaded": key in _detectors,
        }
    return {"success": True, "models": statuses}


def _get_model_path_for_type(model_type: str) -> str:
    if model_type == "auto":
        from backend.core.dependencies import _active_model_path
        return _active_model_path
    return get_model_path_for_type(model_type)
