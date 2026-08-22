import io
import json
import os
import shutil
import zipfile
import uuid
import time
from pathlib import Path

from fastapi import HTTPException

from backend.core.config import settings

METADATA_FILENAME = "metadata.json"
# Dataset statuses
STATUS_VALID = "valid"
STATUS_EMPTY = "empty"

_ALLOWED_EXTS = settings.ALLOWED_IMAGE_EXTS
_MAX_ZIP_BYTES = settings.MAX_ZIP_SIZE_MB * 1024 * 1024


def backups_dir() -> str:
    return settings.BACKUPS_DIR


def datasets_dir() -> str:
    return settings.ZIP_TRAINING_DATA_DIR


def _ensure_base_dirs():
    os.makedirs(backups_dir(), exist_ok=True)
    os.makedirs(datasets_dir(), exist_ok=True)


def backup_path(dataset_id: str) -> str:
    return os.path.join(backups_dir(), f"{dataset_id}.zip")


def dataset_dir(dataset_id: str) -> str:
    return os.path.join(datasets_dir(), dataset_id)


def metadata_path(dataset_id: str) -> str:
    return os.path.join(dataset_dir(dataset_id), METADATA_FILENAME)


def _is_safe_ext(name: str) -> bool:
    return Path(name).suffix.lower() in _ALLOWED_EXTS


def _is_within(directory: str, target: str) -> bool:
    dir_path = os.path.realpath(directory)
    target_path = os.path.realpath(target)
    return target_path == dir_path or target_path.startswith(dir_path + os.sep)


def generate_dataset_id() -> str:
    return uuid.uuid4().hex[:12]


def save_backup(dataset_id: str, content: bytes) -> str:
    _ensure_base_dirs()
    path = backup_path(dataset_id)
    with open(path, "wb") as f:
        f.write(content)
    return path


def extract_zip(dataset_id: str, content: bytes) -> int:
    """Extract ZIP into storage/training_data/{dataset_id}/.

    Top-level folders become class labels. Nested sub-folders under each class
    are flattened into the class folder. Returns number of images extracted.
    Raises HTTPException on corrupt/unsafe archives.
    """
    try:
        archive = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Corrupted ZIP file: not a valid ZIP archive")

    target = dataset_dir(dataset_id)
    os.makedirs(target, exist_ok=True)

    image_count = 0
    # Normalized-name -> (real class dir, real file path) for collision handling
    written: dict[str, str] = {}

    try:
        for info in archive.infolist():
            name = info.filename.replace("\\", "/")
            # Skip directories / top-level files / macOS junk
            if name.endswith("/") or not name or name.startswith(("__MACOSX/", ".DS_Store")):
                continue

            parts = [p for p in name.split("/") if p]
            if len(parts) < 2:
                # file directly at zip root (no class folder) -> ignore
                continue

            class_name = parts[0]
            if class_name.startswith(".") or not _is_safe_ext(parts[-1]):
                # class folders with unsupported files are ignored
                continue

            class_dir = os.path.join(target, class_name)
            os.makedirs(class_dir, exist_ok=True)

            file_name = parts[-1]
            final_path = os.path.join(class_dir, file_name)

            # Handle duplicate filenames inside a class by dedup prefix
            if final_path in written.values():
                stem, ext = os.path.splitext(file_name)
                final_path = os.path.join(class_dir, f"{stem}__{len(written)}_dup{ext}")

            if not _is_within(target, final_path):
                raise HTTPException(status_code=400, detail="ZIP contains unsafe paths (zip-slip attempt)")

            with archive.open(info) as src, open(final_path, "wb") as dst:
                shutil.copyfileobj(src, dst)

            written[info.filename] = final_path
            image_count += 1
    except HTTPException:
        shutil.rmtree(target, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(target, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Failed to extract ZIP: {str(e)}")
    finally:
        archive.close()

    return image_count


def _clean_dir_empties(dataset_id: str):
    """Remove empty class folders left after scanning."""
    target = dataset_dir(dataset_id)
    if not os.path.isdir(target):
        return
    for entry in os.scandir(target):
        if entry.is_dir() and not any(entry for entry in os.scandir(entry.path)):
            try:
                shutil.rmtree(entry.path)
            except OSError:
                pass


def is_empty(dataset_id: str) -> bool:
    target = dataset_dir(dataset_id)
    if not os.path.isdir(target):
        return True
    for entry in os.scandir(target):
        if entry.is_dir() and any(os.scandir(entry.path)):
            return False
    return True


def scan_dataset(dataset_id: str) -> dict:
    """Walk extracted dataset, return class->image_path map + unordered image list."""
    target = dataset_dir(dataset_id)
    classes: dict[str, list[str]] = {}
    if not os.path.isdir(target):
        return {"classes": classes, "images": []

        }

    for entry in sorted(os.scandir(target), key=lambda e: e.name.lower()):
        if not entry.is_dir():
            continue
        class_name = entry.name
        images = []
        for f in sorted(os.scandir(entry.path), key=lambda e: e.name.lower()):
            if f.is_file() and _is_safe_ext(f.name):
                images.append(f.path)
        if images:
            classes[class_name] = images

    _clean_dir_empties(dataset_id)
    all_images = [p for lst in classes.values() for p in lst]
    return {"classes": classes, "images": all_images}


def build_metadata(dataset_id: str) -> dict:
    scan = scan_dataset(dataset_id)
    classes = scan["classes"]
    total_images = len(scan["images"])

    status = STATUS_VALID if total_images > 0 and classes else STATUS_EMPTY
    class_info = [
        {"name": class_name, "images": len(images)}
        for class_name, images in sorted(classes.items())
    ]

    metadata = {
        "datasetId": dataset_id,
        "totalClasses": len(class_info),
        "totalImages": total_images,
        "classes": class_info,
        "backup": backup_path(dataset_id),
        "status": status,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }

    os.makedirs(dataset_dir(dataset_id), exist_ok=True)
    with open(metadata_path(dataset_id), "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    return metadata


def load_metadata(dataset_id: str) -> dict:
    path = metadata_path(dataset_id)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' metadata is unreadable")


def create_dataset(
    content: bytes,
    original_filename: str = "dataset.zip",
    class_name: str | None = None,
) -> dict:
    """Full upload pipeline: validate -> backup -> extract -> scan -> metadata."""
    if len(content) > _MAX_ZIP_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"ZIP too large. Maximum size is {settings.MAX_ZIP_SIZE_MB}MB",
        )

    if not original_filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only ZIP files are allowed")

    dataset_id = generate_dataset_id()

    # 1. Permanent backup first
    save_backup(dataset_id, content)

    # 2. Extract
    image_count = extract_zip(dataset_id, content)
    if image_count == 0:
        shutil.rmtree(dataset_dir(dataset_id), ignore_errors=True)
        raise HTTPException(
            status_code=400,
            detail="ZIP contains no valid images (supported: jpg, jpeg, png, webp, bmp)",
        )

    # 3. Build metadata
    metadata = build_metadata(dataset_id)
    if metadata["totalClasses"] == 0:
        raise HTTPException(
            status_code=400,
            detail="ZIP contains no class folders (expected folder per class at the top level)",
        )

    if class_name:
        metadata["className"] = class_name.strip()

    return metadata


def list_datasets() -> list[dict]:
    result = []
    if not os.path.isdir(datasets_dir()):
        return result
    for entry in sorted(os.scandir(datasets_dir()), key=lambda e: e.name):
        if not entry.is_dir():
            continue
        try:
            meta = load_metadata(entry.name)
        except HTTPException:
            continue
        result.append({
            "datasetId": entry.name,
            "totalClasses": meta.get("totalClasses", 0),
            "totalImages": meta.get("totalImages", 0),
            "className": meta.get("className"),
            "backup": meta.get("backup"),
            "status": meta.get("status", STATUS_EMPTY),
            "created_at": meta.get("created_at"),
        })
    return result


def delete_dataset(dataset_id: str) -> dict:
    target = dataset_dir(dataset_id)
    backup = backup_path(dataset_id)
    removed_dir = removed_backup = False

    if os.path.isdir(target):
        shutil.rmtree(target, ignore_errors=True)
        removed_dir = True
    if os.path.isfile(backup):
        os.remove(backup)
        removed_backup = True

    if not removed_dir and not removed_backup:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found")

    return {"success": True, "datasetId": dataset_id, "deleted_backup": removed_backup}


def _record_relative_path(img_path: str) -> str:
    """Return path relative to the storage root (parent of storage/training_data)."""
    storage_root = os.path.realpath(os.path.join(datasets_dir(), "..", ".."))
    return os.path.relpath(os.path.realpath(img_path), start=storage_root).replace("\\", "/")


def training_records(dataset_id: str) -> list[dict]:
    """Flatten extracted folders into training records (image path + label).

    Paths are relative to the storage root, e.g.
    ``storage/training_data/{dataset_id}/{class}/{filename}`` so they stay
    valid regardless of filesystem drive or application cwd.
    """
    scan = scan_dataset(dataset_id)
    records = []
    for class_name, images in sorted(scan["classes"].items()):
        for img_path in images:
            records.append({"image": _record_relative_path(img_path), "label": class_name})
    return records
