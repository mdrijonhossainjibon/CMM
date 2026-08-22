import os
import time
import hashlib
import base64
import logging
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request

from backend.schemas.detection import ImageRequest
from backend.schemas.training import TrainingStartResponse, TrainingStatusResponse, TrainingRequest
from backend.services.training_service import TrainingService
from backend.core.config import settings
from backend.services.class_manifest import (
    add_entries,
    remove_entries,
    remove_by_class,
    rename_entry,
    get_class,
)

logger = logging.getLogger("captchamaster.training_router")

_IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".bmp", ".tiff")


def _is_image_file(filename: str) -> bool:
    return os.path.splitext(filename)[1].lower() in _IMAGE_EXTS


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
        add_entries(settings.TRAINING_DATA_DIR, {filename: label.strip().lower()})
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
    entries = {}
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
            entries[filename] = class_name.strip().lower()
        except HTTPException:
            raise
        except Exception as e:
            errors.append(f"{f.filename}: {str(e)}")

    if entries:
        add_entries(settings.TRAINING_DATA_DIR, entries)

    return {
        "success": len(errors) == 0,
        "saved_count": len(saved),
        "error_count": len(errors),
        "saved_files": saved,
        "errors": errors,
    }


@router.get("/training-data/classes")
async def list_training_classes(dataset_id: str = ""):
    # ZIP dataset mode: each first-level folder = class
    if dataset_id:
        root = os.path.join(settings.ZIP_TRAINING_DATA_DIR, dataset_id)
        if not os.path.isdir(root):
            return {"classes": [], "total_images": 0}
        classes = {}
        for entry in sorted(os.scandir(root), key=lambda e: e.name.lower()):
            if not entry.is_dir():
                continue
            count = sum(
                1 for f in os.scandir(entry.path)
                if f.is_file() and _is_image_file(f.name)
            )
            if count > 0:
                classes[entry.name] = count
        result = [{"name": k, "count": v} for k, v in sorted(classes.items())]
        return {"classes": result, "total_images": sum(c["count"] for c in result)}

    data_dir = settings.TRAINING_DATA_DIR
    if not os.path.exists(data_dir):
        return {"classes": [], "total_images": 0}

    classes = {}
    for f in os.listdir(data_dir):
        full = os.path.join(data_dir, f)
        if not os.path.isfile(full) or not _is_image_file(f):
            continue
        cls = get_class(f, data_dir, f.split("_")[0])
        if cls not in classes:
            classes[cls] = 0
        classes[cls] += 1

    result = [{"name": k, "count": v} for k, v in sorted(classes.items())]
    return {"classes": result, "total_images": sum(c["count"] for c in result)}


@router.get("/training-data/images")
async def list_training_images(request: Request, class_name: str = "", page: int = 1, limit: int = 60, dataset_id: str = ""):
    page = max(page, 1)
    limit = min(max(limit, 1), 300)

    all_images = []

    if dataset_id:
        root = os.path.join(settings.ZIP_TRAINING_DATA_DIR, dataset_id)
        if os.path.isdir(root):
            for cls_dir in sorted(os.scandir(root), key=lambda e: e.name.lower()):
                if not cls_dir.is_dir():
                    continue
                if class_name and cls_dir.name.lower() != class_name.lower():
                    continue
                for f in sorted(os.scandir(cls_dir.path), key=lambda e: e.name.lower()):
                    if not f.is_file() or not _is_image_file(f.name):
                        continue
                    all_images.append({
                        "filename": f.name,
                        "class": cls_dir.name,
                        "url": f"api/datasets/zip/{dataset_id}/image?file={f.name}&class_name={cls_dir.name}",
                    })
    else:
        data_dir = settings.TRAINING_DATA_DIR
        if os.path.exists(data_dir):
            for f in sorted(os.listdir(data_dir)):
                full = os.path.join(data_dir, f)
                if not os.path.isfile(full) or not _is_image_file(f):
                    continue
                cls = get_class(f, data_dir, f.split("_")[0])
                if class_name and cls != class_name.lower():
                    continue
                all_images.append({
                    "filename": f,
                    "class": cls,
                    "url": f"api/datasets/train?file={f}",
                })

    total = len(all_images)
    start = (page - 1) * limit
    end = start + limit
    has_more = end < total
    images = all_images[start:end]

    return {"images": images, "total": total, "page": page, "limit": limit, "has_more": has_more}


@router.delete("/training-data/delete")
async def delete_training_image(filename: str):
    filepath = os.path.join(settings.TRAINING_DATA_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    os.remove(filepath)
    remove_entries(settings.TRAINING_DATA_DIR, [filename])
    return {"success": True, "deleted": filename}


@router.delete("/training-data/delete-class")
async def delete_training_class(class_name: str):
    data_dir = settings.TRAINING_DATA_DIR
    if not os.path.exists(data_dir):
        raise HTTPException(status_code=404, detail="Training data directory not found")

    target = class_name.strip().lower()
    deleted = 0
    removed = []
    for f in os.listdir(data_dir):
        full = os.path.join(data_dir, f)
        if not os.path.isfile(full):
            continue
        cls = get_class(f, data_dir, f.split("_")[0])
        if cls == target:
            os.remove(full)
            removed.append(f)
            deleted += 1

    if removed:
        remove_by_class(data_dir, target)
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

    # Original class manifest theke nibo, filename split na
    import re
    # Extract suffix like _1786..._0.jpg (base_ts_idx.ext) from filename
    m = re.search(r"_(\d{13}_\d+)(\.[A-Za-z0-9]+)$", filename)
    if m:
        suffix = f"_{m.group(1)}{m.group(2)}"
    else:
        suffix = os.path.splitext(filename)[1] or ".jpg"
    new_filename = f"{safe_new}{suffix}"
    new_path = os.path.join(data_dir, new_filename)

    if os.path.exists(new_path):
        raise HTTPException(status_code=409, detail=f"File '{new_filename}' already exists")

    os.rename(old_path, new_path)
    rename_entry(data_dir, filename, new_filename, safe_new)
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
            dataset_id=request.dataset_id,
        )
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
