import base64
import time
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
from backend.services.detection_log_service import detection_log_service

router = APIRouter(prefix="/api", tags=["Detection"])


@router.post("/detect", response_model=DetectResponse)
async def detect_objects(
    file: UploadFile = File(...),
    conf_threshold: float = Form(0.5),
    model_type: str = Form("auto"),
):
    if not file.filename or not file.filename.lower().endswith(
        (".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".heic", ".heif")
    ):
        raise HTTPException(status_code=400, detail="Unsupported file format")

    try:
        detector = get_detector(model_type)
        service = DetectionService(detector)
        image_data = await file.read()
        start = time.perf_counter()
        detected_objects = await service.detect(image_data, conf_threshold)
        elapsed_ms = (time.perf_counter() - start) * 1000
        model_classes = list(detector.model.names.values()) if hasattr(detector.model, 'names') else []

        try:
            await detection_log_service.log_detection(
                image_count=1,
                total_objects=len(detected_objects),
                avg_confidence=sum(o.get("confidence", 0) for o in detected_objects) / len(detected_objects) if detected_objects else 0,
                model_type=model_type,
                model_name=detector.model_name,
                processing_ms=elapsed_ms,
                batch=False,
                detected_classes=[o.get("label", "") for o in detected_objects],
            )
        except Exception:
            pass

        return DetectResponse(
            success=True,
            detected_objects=[DetectionObject(**obj) for obj in detected_objects],
            count=len(detected_objects),
            model_name=detector.model_name,
            model_type=model_type,
            model_classes=model_classes,
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

        start = time.perf_counter()
        detected_batch = await service.detect_batch(image_data_list, request.conf_threshold)
        elapsed_ms = (time.perf_counter() - start) * 1000

        batch_results: List[List[dict]] = [[] for _ in range(len(request.imageData))]
        for i, val_idx in enumerate(valid_indices):
            batch_results[val_idx] = detected_batch[i]

        total_objects = sum(len(r) for r in batch_results)
        all_confs = [o.get("confidence", 0) for r in batch_results for o in r]
        detected_labels = [o.get("label", "") for r in batch_results for o in r]

        try:
            await detection_log_service.log_detection(
                image_count=len(image_data_list),
                total_objects=total_objects,
                avg_confidence=sum(all_confs) / len(all_confs) if all_confs else 0,
                model_type=model_type,
                model_name=detector.model_name,
                processing_ms=elapsed_ms,
                batch=True,
                detected_classes=detected_labels,
            )
        except Exception:
            pass

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
