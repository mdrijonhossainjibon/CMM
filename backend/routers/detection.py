import base64
from typing import List
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query

from backend.schemas.detection import (
    ImageRequest,
    DetectionObject,
    DetectResponse,
    BatchDetectResponse,
)
from backend.services.detection_service import DetectionService
from backend.core.dependencies import get_detector

router = APIRouter(prefix="/api", tags=["Detection"])


@router.post("/detect", response_model=DetectResponse)
async def detect_objects(
    file: UploadFile = File(...),
    conf_threshold: float = Form(0.5),
    model_type: str = Form("auto"),
):
    if not file.filename or not file.filename.lower().endswith(
        (".jpg", ".jpeg", ".png", ".bmp", ".tiff")
    ):
        raise HTTPException(status_code=400, detail="Unsupported file format")

    try:
        detector = get_detector(model_type)
        service = DetectionService(detector)
        image_data = await file.read()
        detected_objects = await service.detect(image_data, conf_threshold)
        return DetectResponse(
            success=True,
            detected_objects=[DetectionObject(**obj) for obj in detected_objects],
            count=len(detected_objects),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


@router.post("/detect-batch", response_model=BatchDetectResponse)
async def detect_batch(
    request: ImageRequest,
    model_type: str = Query("auto"),
):
    if not request.imageData:
        raise HTTPException(status_code=400, detail="No images provided")

    try:
        detector = get_detector(model_type)
        service = DetectionService(detector)

        image_data_list = []
        valid_indices = []

        for idx, b64_str in enumerate(request.imageData):
            if "," in b64_str:
                b64_str = b64_str.split(",")[1]
            try:
                img_bytes = base64.b64decode(b64_str)
                image_data_list.append(img_bytes)
                valid_indices.append(idx)
            except Exception:
                continue

        if not image_data_list:
            return BatchDetectResponse(success=False, results=[])

        detected_batch = await service.detect_batch(image_data_list, request.conf_threshold)

        batch_results: List[List[dict]] = [[] for _ in range(len(request.imageData))]
        for i, val_idx in enumerate(valid_indices):
            batch_results[val_idx] = detected_batch[i]

        solution = []
        target = request.question.strip().lower() if request.question else None
        target_list = []
        if target:
            for t in target.split(","):
                t = t.strip()
                if t.startswith("the "):
                    t = t[4:].strip()
                if t:
                    target_list.append(t)

        if target_list:
            for idx, detections in enumerate(batch_results):
                for obj in detections:
                    label = obj.get("label", "").lower()
                    match = any(t in label or label in t for t in target_list)
                    if match:
                        solution.append(idx)
                        break

        return BatchDetectResponse(
            success=True,
            results=[
                [DetectionObject(**obj) for obj in result_list]
                for result_list in batch_results
            ],
            solution=solution or None,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch detection failed: {str(e)}")
