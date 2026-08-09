import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse

from backend.core.dependencies import reload_detector_instance
from backend.services.detection_service import DetectionService

router = APIRouter(prefix="/api", tags=["Models"])


@router.get("/models")
async def list_models():
    models = []
    search_dirs = ["app/model", ".", "runs"]
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
                    size_mb = os.path.getsize(full_path) / (1024 * 1024)
                    models.append(
                        {
                            "filename": file,
                            "path": rel_path.replace("\\", "/"),
                            "size": f"{size_mb:.1f} MB",
                        }
                    )
    return {"success": True, "models": models}


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
    from backend.core.dependencies import _detector

    if _detector is None:
        return {"model_name": "Not Initialized", "device": "N/A"}
    return {"model_name": _detector.model_name, "device": _detector.device}
