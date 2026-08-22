import os
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from backend.core.config import settings

router = APIRouter(prefix="/api/exports", tags=["Exports"])


@router.get("")
async def list_exports():
    from backend.routers.models import _get_model_classes

    exports = {}

    # Local exports
    exports_dir = settings.EXPORTS_DIR
    if os.path.exists(exports_dir):
        for f in sorted(os.listdir(exports_dir), reverse=True):
            full = os.path.join(exports_dir, f)
            if os.path.isfile(full):
                size_mb = os.path.getsize(full) / (1024 * 1024)
                class_names = []
                if f.endswith(".pt"):
                    class_names = _get_model_classes(full)
                mtime = os.path.getmtime(full)
                created_at = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
                exports[f] = {
                    "filename": f,
                    "size": f"{size_mb:.1f} MB",
                    "path": f,
                    "classes": class_names,
                    "created_at": created_at,
                    "source": "local",
                    "is_system": False,
                    "is_cloud": False,
                }

    result = sorted(exports.values(), key=lambda e: e.get("created_at") or "", reverse=True)
    return {"success": True, "exports": result}


@router.get("/download/{filename}")
async def download_export(filename: str):
    if os.path.basename(filename) != filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    filepath = os.path.join(settings.EXPORTS_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Export not found locally")
    return FileResponse(path=filepath, filename=filename)
