import os
import time
from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import JSONResponse, FileResponse

from backend.core.config import settings
from backend.utils.validators import validate_image_file, validate_file_size

router = APIRouter(prefix="/api/datasets", tags=["Datasets"])


def _scan_images(directory: str) -> list[dict]:
    if not os.path.exists(directory) or not os.path.isdir(directory):
        return []
    result = []
    for f in sorted(os.listdir(directory)):
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            class_name = f.split("_")[0] if "_" in f else "unknown"
            result.append({"filename": f, "class": class_name})
    return result


def _serve_file(directory: str, file: str, fallback_dir: str = None):
    filepath = os.path.join(directory, file)
    if os.path.isfile(filepath):
        return FileResponse(filepath)
    if fallback_dir:
        filepath = os.path.join(fallback_dir, file)
        if os.path.isfile(filepath):
            return FileResponse(filepath)
    raise HTTPException(status_code=404, detail="File not found")


@router.get("/train")
async def get_train_images(file: str = Query(None)):
    train_dir = os.path.join(settings.DATASET_DIR, "train", "images")
    if file:
        return _serve_file(train_dir, file, settings.TRAINING_DATA_DIR)
    images = _scan_images(train_dir)
    source = "dataset"
    if not images:
        images = _scan_images(settings.TRAINING_DATA_DIR)
        source = "training_data"
    return JSONResponse({
        "images": [i["filename"] for i in images],
        "classes": list({i["class"] for i in images}),
        "count": len(images),
        "path": train_dir,
        "source": source,
    })


@router.get("/val")
async def get_val_images(file: str = Query(None)):
    val_dir = os.path.join(settings.DATASET_DIR, "val", "images")
    if file:
        return _serve_file(val_dir, file, settings.TRAINING_DATA_DIR)
    images = _scan_images(val_dir)
    source = "dataset"
    if not images:
        images = _scan_images(settings.TRAINING_DATA_DIR)
        source = "training_data"
    return JSONResponse({
        "images": [i["filename"] for i in images],
        "classes": list({i["class"] for i in images}),
        "count": len(images),
        "path": val_dir,
        "source": source,
    })


@router.get("/uploaded")
async def get_uploaded_images():
    images = _scan_images(settings.TRAINING_DATA_DIR)
    return JSONResponse({
        "images": [i["filename"] for i in images],
        "classes": list({i["class"] for i in images}),
        "count": len(images),
        "path": settings.TRAINING_DATA_DIR,
        "source": "training_data",
    })


@router.post("/upload")
async def upload_dataset(file: UploadFile = File(...), dataset_type: str = "train"):
    validate_image_file(file)

    if dataset_type not in ("train", "val"):
        raise HTTPException(status_code=400, detail="dataset_type must be 'train' or 'val'")

    target_dir = os.path.join(settings.DATASET_DIR, dataset_type, "images")
    os.makedirs(target_dir, exist_ok=True)

    try:
        content = await file.read()
        validate_file_size(content)
        timestamp = int(time.time() * 1000)
        filename = f"{timestamp}_{file.filename}"
        filepath = os.path.join(target_dir, filename)
        with open(filepath, "wb") as f:
            f.write(content)
        return {"success": True, "saved_as": filename}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{dataset_type}")
async def delete_dataset(dataset_type: str):
    if dataset_type not in ("train", "val"):
        raise HTTPException(status_code=400, detail="dataset_type must be 'train' or 'val'")

    target_dir = os.path.join(settings.DATASET_DIR, dataset_type, "images")
    if not os.path.exists(target_dir):
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_type}' not found")

    deleted = 0
    for f in os.listdir(target_dir):
        filepath = os.path.join(target_dir, f)
        if os.path.isfile(filepath):
            os.remove(filepath)
            deleted += 1

    return {"success": True, "deleted_count": deleted, "type": dataset_type}
