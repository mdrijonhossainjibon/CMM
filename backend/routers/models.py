import os
import time
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse

from backend.core.config import settings
from backend.core.dependencies import reload_detector_instance, set_active_model
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
        detector = reload_detector_instance()
        return {"success": True, "message": "Model reloaded successfully"}
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
