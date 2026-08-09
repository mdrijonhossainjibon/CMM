import os
from typing import List
from fastapi import UploadFile, HTTPException


ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}
ALLOWED_ARCHIVE_EXTENSIONS = {".zip"}
MAX_UPLOAD_SIZE_MB = 50
MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024


def validate_image_file(file: UploadFile) -> str:
    """Validate an uploaded image file. Returns the file extension."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}",
        )
    return ext


def validate_file_size(content: bytes) -> None:
    """Validate uploaded file size."""
    if len(content) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_UPLOAD_SIZE_MB}MB",
        )


def validate_archive_file(file: UploadFile) -> str:
    """Validate an uploaded ZIP archive. Returns the file extension."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_ARCHIVE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported archive type. Only ZIP files are allowed.",
        )
    return ext
