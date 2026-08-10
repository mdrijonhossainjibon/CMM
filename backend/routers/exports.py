import os
import tempfile
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from backend.core.config import settings

router = APIRouter(prefix="/api/exports", tags=["Exports"])

_cloud_classes_cache: dict[str, list[str]] = {}


async def _get_cloud_classes(r2_service, obj_key: str, filename: str) -> list[str]:
    """Extract class names from a cloud .pt export by downloading to a temp cache."""
    if not filename.endswith(".pt"):
        return []
    if filename in _cloud_classes_cache:
        return _cloud_classes_cache[filename]

    from backend.routers.models import _get_model_classes

    try:
        tmp_dir = os.path.join(tempfile.gettempdir(), "cm_export_cache")
        os.makedirs(tmp_dir, exist_ok=True)
        tmp_path = os.path.join(tmp_dir, filename)

        # Reuse cached file if it exists
        if not os.path.exists(tmp_path):
            ok = await r2_service.download_file(obj_key, tmp_path)
            if not ok:
                return []
        classes = _get_model_classes(tmp_path)
        _cloud_classes_cache[filename] = classes
        return classes
    except Exception:
        return []


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

    # Cloud exports from R2
    try:
        from backend.services.r2_service import r2_service
        if await r2_service._is_configured():
            objects = await r2_service.list_objects("models")
            for obj in objects:
                filename = os.path.basename(obj["key"])
                if not filename:
                    continue
                exists = filename in exports
                class_names = exports[filename]["classes"] if exists else []
                if not class_names:
                    class_names = await _get_cloud_classes(r2_service, obj["key"], filename)
                exports[filename] = {
                    "filename": filename,
                    "size": f"{obj['size'] / (1024 * 1024):.1f} MB",
                    "path": obj["key"],
                    "classes": class_names,
                    "created_at": obj.get("last_modified"),
                    "source": "cloud",
                    "is_system": False,
                    "is_cloud": True,
                }
    except Exception:
        pass

    result = sorted(exports.values(), key=lambda e: e.get("created_at") or "", reverse=True)
    return {"success": True, "exports": result}


@router.get("/download/{filename}")
async def download_export(filename: str):
    filepath = os.path.join(settings.EXPORTS_DIR, filename)
    if os.path.exists(filepath):
        return FileResponse(path=filepath, filename=filename)

    # Try downloading from R2 cloud
    try:
        from backend.services.r2_service import r2_service
        if await r2_service._is_configured():
            objects = await r2_service.list_objects("models")
            for obj in objects:
                if os.path.basename(obj["key"]) == filename:
                    tmp = os.path.join(tempfile.gettempdir(), filename)
                    ok = await r2_service.download_file(obj["key"], tmp)
                    if ok:
                        return FileResponse(path=tmp, filename=filename)
    except Exception:
        pass

    raise HTTPException(status_code=404, detail="Export not found locally or in cloud")
