import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from backend.core.config import settings

router = APIRouter(prefix="/api/exports", tags=["Exports"])


@router.get("")
async def list_exports():
    exports_dir = settings.EXPORTS_DIR
    if not os.path.exists(exports_dir):
        return {"success": True, "exports": []}

    exports = []
    for f in sorted(os.listdir(exports_dir), reverse=True):
        full = os.path.join(exports_dir, f)
        if os.path.isfile(full):
            size_mb = os.path.getsize(full) / (1024 * 1024)
            exports.append(
                {
                    "filename": f,
                    "size": f"{size_mb:.1f} MB",
                    "path": f,
                }
            )
    return {"success": True, "exports": exports}


@router.get("/download/{filename}")
async def download_export(filename: str):
    filepath = os.path.join(settings.EXPORTS_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Export not found")
    return FileResponse(path=filepath, filename=filename)
