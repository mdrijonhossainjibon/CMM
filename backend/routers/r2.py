import os
from fastapi import APIRouter, HTTPException

from backend.core.config import settings
from backend.services.r2_service import r2_service

router = APIRouter(prefix="/api/r2", tags=["R2 Storage"])


@router.get("/status")
async def r2_status():
    configured = await r2_service._is_configured()
    cfg = await r2_service._load_config()
    stats = {"objects": 0, "total_size_bytes": 0, "total_size_mb": 0}
    if configured:
        all_objects = await r2_service.list_objects()
        total_bytes = sum(o["size"] for o in all_objects)
        stats = {
            "objects": len(all_objects),
            "total_size_bytes": total_bytes,
            "total_size_mb": round(total_bytes / (1024 * 1024), 2),
        }
    return {
        "enabled": configured,
        "configured": configured,
        "bucket": cfg.get("r2_bucket_name", ""),
        "endpoint": cfg.get("r2_endpoint_url", ""),
        "stats": stats,
    }


@router.get("/stats")
async def r2_stats():
    if not await r2_service._is_configured():
        raise HTTPException(status_code=400, detail="R2 storage is not configured")

    all_objects = await r2_service.list_objects()
    total_bytes = sum(o["size"] for o in all_objects)
    by_prefix = {}
    for o in all_objects:
        prefix = o["key"].split("/")[0] if "/" in o["key"] else "root"
        if prefix not in by_prefix:
            by_prefix[prefix] = {"objects": 0, "size_bytes": 0}
        by_prefix[prefix]["objects"] += 1
        by_prefix[prefix]["size_bytes"] += o["size"]

    return {
        "success": True,
        "objects": len(all_objects),
        "total_size_bytes": total_bytes,
        "total_size_mb": round(total_bytes / (1024 * 1024), 2),
        "total_size_gb": round(total_bytes / (1024 * 1024 * 1024), 2),
        "by_prefix": {
            k: {
                "objects": v["objects"],
                "size_mb": round(v["size_bytes"] / (1024 * 1024), 2),
            }
            for k, v in sorted(by_prefix.items())
        },
    }


@router.get("/list")
async def list_r2_objects(prefix: str = ""):
    if not await r2_service._is_configured():
        raise HTTPException(status_code=400, detail="R2 storage is not configured")
    objects = await r2_service.list_objects(prefix)
    total_size = sum(o["size"] for o in objects)
    return {
        "success": True,
        "prefix": prefix,
        "objects": objects,
        "count": len(objects),
        "total_size_mb": round(total_size / (1024 * 1024), 2),
    }


@router.post("/push/training-data")
async def push_training_data():
    if not await r2_service._is_configured():
        raise HTTPException(status_code=400, detail="R2 storage is not configured")

    data_dir = settings.TRAINING_DATA_DIR
    if not os.path.exists(data_dir) or not os.listdir(data_dir):
        return {"success": False, "message": "No training data found to upload"}

    result = await r2_service.upload_directory(data_dir, "training-data")
    return {"success": result["success"], "uploaded": result["uploaded"], "failed": result["failed"]}


@router.post("/pull/training-data")
async def pull_training_data():
    if not await r2_service._is_configured():
        raise HTTPException(status_code=400, detail="R2 storage is not configured")

    objects = await r2_service.list_objects("training-data")
    if not objects:
        return {"success": False, "message": "No training data found in R2"}

    data_dir = settings.TRAINING_DATA_DIR
    result = await r2_service.download_directory("training-data", data_dir)
    return {"success": result["success"], "downloaded": result["downloaded"], "failed": result["failed"]}


@router.post("/push/models")
async def push_models():
    if not await r2_service._is_configured():
        raise HTTPException(status_code=400, detail="R2 storage is not configured")

    exports_dir = settings.EXPORTS_DIR
    if not os.path.exists(exports_dir):
        return {"success": False, "message": "No exported models found"}

    result = await r2_service.upload_directory(exports_dir, "models")
    return {"success": result["success"], "uploaded": result["uploaded"], "failed": result["failed"]}


@router.post("/pull/models")
async def pull_models():
    if not await r2_service._is_configured():
        raise HTTPException(status_code=400, detail="R2 storage is not configured")

    objects = await r2_service.list_objects("models")
    if not objects:
        return {"success": False, "message": "No models found in R2"}

    exports_dir = settings.EXPORTS_DIR
    result = await r2_service.download_directory("models", exports_dir)
    return {"success": result["success"], "downloaded": result["downloaded"], "failed": result["failed"]}


@router.post("/push/run/{run_name}")
async def push_training_run(run_name: str):
    if not await r2_service._is_configured():
        raise HTTPException(status_code=400, detail="R2 storage is not configured")

    if ".." in run_name or "/" in run_name or "\\" in run_name:
        raise HTTPException(status_code=400, detail="Invalid run name")

    run_dir = os.path.join("runs", "detect", run_name)
    if not os.path.exists(run_dir):
        raise HTTPException(status_code=404, detail=f"Training run '{run_name}' not found")

    result = await r2_service.upload_directory(run_dir, f"runs/{run_name}")
    return {"success": result["success"], "uploaded": result["uploaded"], "failed": result["failed"]}


@router.delete("/delete")
async def delete_r2_object(key: str):
    if not await r2_service._is_configured():
        raise HTTPException(status_code=400, detail="R2 storage is not configured")

    ok = await r2_service.delete_object(key)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Failed to delete: {key}")
    return {"success": True, "deleted": key}


@router.delete("/delete-prefix")
async def delete_r2_prefix(prefix: str):
    if not await r2_service._is_configured():
        raise HTTPException(status_code=400, detail="R2 storage is not configured")

    count = await r2_service.delete_prefix(prefix)
    return {"success": True, "deleted_count": count, "prefix": prefix}
