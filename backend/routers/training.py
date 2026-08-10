import os
import time
import hashlib
import base64
import asyncio
import logging
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request

from backend.schemas.detection import ImageRequest
from backend.schemas.training import TrainingStartResponse, TrainingStatusResponse, TrainingRequest
from backend.services.training_service import TrainingService
from backend.core.config import settings

logger = logging.getLogger("captchamaster.training_router")


async def _auto_sync_training_data():
    """Background task: mirror-sync training_data/ to R2 if configured. Never blocks uploads."""
    try:
        from backend.services.r2_service import r2_service
        if not await r2_service._is_configured():
            return
        result = await r2_service.sync_directory(settings.TRAINING_DATA_DIR, "training-data")
        logger.info("R2 auto-sync training-data: %s", result)
    except Exception as e:
        logger.warning("R2 auto-sync failed: %s", e)
from backend.utils.validators import validate_image_file, validate_file_size

router = APIRouter(prefix="/api", tags=["Training"])

# Singleton training service
_training_service = TrainingService()


@router.post("/save-training-data")
async def save_training_data(
    file: UploadFile = File(...),
    label: str = Form("unknown"),
):
    validate_image_file(file)
    try:
        content = await file.read()
        validate_file_size(content)
        os.makedirs(settings.TRAINING_DATA_DIR, exist_ok=True)
        timestamp = int(time.time())
        filename = f"{label}_{timestamp}_{file.filename}"
        filepath = os.path.join(settings.TRAINING_DATA_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(content)
        asyncio.create_task(_auto_sync_training_data())
        return {"success": True, "saved_as": filename}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/training-data/batch")
async def upload_training_data_batch(
    files: list[UploadFile] = File(...),
    class_name: str = Form(...),
):
    if not class_name.strip():
        raise HTTPException(status_code=400, detail="Class name is required")

    safe_class = class_name.strip().lower().replace(" ", "_")
    os.makedirs(settings.TRAINING_DATA_DIR, exist_ok=True)

    saved = []
    errors = []
    base_ts = int(time.time() * 1000)
    for idx, f in enumerate(files):
        try:
            validate_image_file(f)
            ext = os.path.splitext(f.filename or "image.jpg")[1] or ".jpg"
            filename = f"{safe_class}_{base_ts}_{idx}{ext}"
            filepath = os.path.join(settings.TRAINING_DATA_DIR, filename)
            content = await f.read()
            validate_file_size(content)
            with open(filepath, "wb") as out:
                out.write(content)
            saved.append(filename)
        except HTTPException:
            raise
        except Exception as e:
            errors.append(f"{f.filename}: {str(e)}")

    if saved:
        asyncio.create_task(_auto_sync_training_data())

    return {
        "success": len(errors) == 0,
        "saved_count": len(saved),
        "error_count": len(errors),
        "saved_files": saved,
        "errors": errors,
    }


@router.get("/training-data/classes")
async def list_training_classes():
    data_dir = settings.TRAINING_DATA_DIR
    if not os.path.exists(data_dir):
        return {"classes": [], "total_images": 0}

    classes = {}
    for f in os.listdir(data_dir):
        full = os.path.join(data_dir, f)
        if not os.path.isfile(full):
            continue
        cls = f.split("_")[0]
        if cls not in classes:
            classes[cls] = 0
        classes[cls] += 1

    result = [{"name": k, "count": v} for k, v in sorted(classes.items())]
    return {"classes": result, "total_images": sum(c["count"] for c in result)}


@router.get("/training-data/images")
async def list_training_images(request: Request, class_name: str = ""):
    data_dir = settings.TRAINING_DATA_DIR
    if not os.path.exists(data_dir):
        return {"images": []}

    base = str(request.base_url).rstrip("/")
    images = []
    for f in sorted(os.listdir(data_dir)):
        full = os.path.join(data_dir, f)
        if not os.path.isfile(full):
            continue
        if class_name and not f.startswith(class_name.lower()):
            continue
        images.append({
            "filename": f,
            "class": f.split("_")[0],
            "url": f"{base}/api/datasets/train?file={f}",
        })

    return {"images": images}


@router.delete("/training-data/delete")
async def delete_training_image(filename: str):
    filepath = os.path.join(settings.TRAINING_DATA_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    os.remove(filepath)
    asyncio.create_task(_auto_sync_training_data())
    return {"success": True, "deleted": filename}


@router.delete("/training-data/delete-class")
async def delete_training_class(class_name: str):
    data_dir = settings.TRAINING_DATA_DIR
    if not os.path.exists(data_dir):
        raise HTTPException(status_code=404, detail="Training data directory not found")

    deleted = 0
    for f in os.listdir(data_dir):
        if f.startswith(class_name.lower()):
            os.remove(os.path.join(data_dir, f))
            deleted += 1

    if deleted:
        asyncio.create_task(_auto_sync_training_data())
    return {"success": True, "deleted_count": deleted, "class": class_name}


@router.put("/training-data/rename")
async def rename_training_image(filename: str, new_class: str):
    if not new_class.strip():
        raise HTTPException(status_code=400, detail="New class name is required")
    safe_new = new_class.strip().lower().replace(" ", "_")

    data_dir = settings.TRAINING_DATA_DIR
    old_path = os.path.join(data_dir, filename)
    if not os.path.exists(old_path):
        raise HTTPException(status_code=404, detail="File not found")

    parts = filename.split("_", 1)
    new_filename = f"{safe_new}_{parts[1]}" if len(parts) > 1 else f"{safe_new}_{filename}"
    new_path = os.path.join(data_dir, new_filename)

    if os.path.exists(new_path):
        raise HTTPException(status_code=409, detail=f"File '{new_filename}' already exists")

    os.rename(old_path, new_path)
    asyncio.create_task(_auto_sync_training_data())
    return {"success": True, "old_name": filename, "new_name": new_filename, "class": safe_new}


@router.post("/upload-multiple")
async def upload_multiple_images(
    request: ImageRequest,
):
    upload_dir = settings.UPLOAD_DIR
    os.makedirs(upload_dir, exist_ok=True)

    saved_files = []
    skipped_count = 0

    existing_hashes = set()
    if os.path.exists(upload_dir):
        for f in os.listdir(upload_dir):
            full = os.path.join(upload_dir, f)
            if os.path.isfile(full) and "_" in f:
                existing_hashes.add(f.split("_")[0])

    try:
        for idx, b64_str in enumerate(request.imageData):
            if "," in b64_str:
                b64_str = b64_str.split(",")[1]
            img_data = base64.b64decode(b64_str)
            img_hash = hashlib.md5(img_data).hexdigest()

            if img_hash in existing_hashes:
                skipped_count += 1
                continue

            timestamp = int(time.time() * 1000)
            filename = f"{img_hash}_{timestamp}_{idx}.jpg"
            filepath = os.path.join(upload_dir, filename)
            with open(filepath, "wb") as f:
                f.write(img_data)
            saved_files.append(filename)
            existing_hashes.add(img_hash)

        return {
            "success": True,
            "saved_count": len(saved_files),
            "skipped_count": skipped_count,
            "saved_files": saved_files,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/train", response_model=TrainingStartResponse)
async def start_training(request: TrainingRequest):
    if _training_service.is_running():
        return TrainingStartResponse(success=False, error="Training is already in progress")

    if request.training_type not in settings.TRAINING_TYPES:
        return TrainingStartResponse(
            success=False,
            error=f"Invalid training type: {request.training_type}. Valid: {list(settings.TRAINING_TYPES.keys())}",
        )

    try:
        session_id = None
        try:
            from backend.services.log_service import log_service
            session_id = await log_service.create_session(
                training_type=request.training_type,
                epochs=request.epochs,
                batch_size=request.batch_size,
                image_size=request.image_size,
                workers=request.workers,
                selected_classes=request.selected_classes,
            )
        except Exception:
            session_id = None

        _training_service.start_training(
            training_type=request.training_type,
            epochs=request.epochs,
            batch_size=request.batch_size,
            image_size=request.image_size,
            workers=request.workers,
            optimize=request.optimize,
            selected_classes=request.selected_classes,
            session_id=session_id,
        )
        asyncio.create_task(_auto_sync_training_data())
        return TrainingStartResponse(
            success=True, message=f"Training started for {request.training_type}", session_id=session_id
        )
    except Exception as e:
        return TrainingStartResponse(success=False, error=str(e))


@router.get("/train/hardware")
async def get_hardware_info():
    return {"success": True, "hardware": _training_service.get_hardware_info()}


@router.get("/train/optimize-preview")
async def get_optimize_preview(
    batch_size: int = 16,
    image_size: int = 640,
    workers: int = 8,
    optimize: bool = True,
):
    return {
        "success": True,
        "preview": _training_service.preview_optimize(batch_size, image_size, workers, optimize),
    }


@router.get("/training-types")
async def get_training_types():
    return {"success": True, "training_types": settings.TRAINING_TYPES}


@router.get("/train/status", response_model=TrainingStatusResponse)
async def get_training_status():
    return TrainingStatusResponse(**_training_service.get_status())
