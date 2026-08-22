from fastapi import APIRouter, HTTPException
from typing import List, Optional
import os

from backend.core.config import settings
from backend.schemas.vision import (
    AnalyzeImageRequest,
    VisionAnalysis,
    AnalyzeGridRequest,
    AnalyzeGridResponse,
    SegmentResponse,
    VisionModelInfo,
    ObjectPrediction,
    ScenePrediction,
    BgTrainStartRequest,
    BgTrainStartResponse,
    BgTrainStatusResponse,
)
from backend.vision import pipeline
from backend.services.bg_training_service import bg_training_service
from backend.vision.scene import SCENE_CLASSES
from backend.vision.dependencies import get_detector, get_scene_classifier, get_segmenter

router = APIRouter(prefix="/api", tags=["Vision"])


@router.post("/analyze", response_model=VisionAnalysis)
async def analyze_image(req: AnalyzeImageRequest):
    try:
        image = pipeline.decode_image(req.image)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {str(e)}")

    try:
        result = await pipeline.analyze_image(
            image,
            conf_threshold=req.conf_threshold,
            include_masks=req.include_masks,
        )
        return VisionAnalysis(
            success=True,
            objects=[ObjectPrediction(**o) for o in result["objects"]],
            scene=result["scene"],
            scene_confidence=result["scene_confidence"],
            scene_top=[ScenePrediction(**s) for s in result["scene_top"]],
            masks=[m["mask_png_b64"] for m in result["masks"]],
            elapsed_ms=result["elapsed_ms"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/analyze-grid", response_model=AnalyzeGridResponse)
async def analyze_grid(req: AnalyzeGridRequest):
    try:
        result = await pipeline.analyze_grid(
            req.image,
            object_classes=req.object_classes or None,
            scene_classes=req.scene_classes or None,
            query=req.query,
            conf_threshold=req.conf_threshold,
        )
        from backend.schemas.vision import TileResult
        return AnalyzeGridResponse(
            success=True,
            tiles=[TileResult(**t) for t in result["tiles"]],
            selected=result["selected"],
            statement=result["statement"],
            elapsed_ms=result["elapsed_ms"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Grid analysis failed: {str(e)}")


@router.post("/segment", response_model=SegmentResponse)
async def segment_image(req: AnalyzeImageRequest):
    try:
        result = await pipeline.segment_image(req.image, conf_threshold=req.conf_threshold)
        return SegmentResponse(
            success=True,
            masks=[m["mask_png_b64"] for m in result["masks"]],
            count=result["count"],
            elapsed_ms=result["elapsed_ms"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Segmentation failed: {str(e)}")


@router.get("/vision/info", response_model=VisionModelInfo)
async def vision_info():
    detector = get_detector()
    scene_clf = get_scene_classifier()
    segmenter = get_segmenter()
    return VisionModelInfo(
        object_model=detector.model_name,
        scene_model=scene_clf.model_name,
        seg_model=segmenter.model_name,
        device=detector.device if hasattr(detector, "device") else "cpu",
        scene_classes=SCENE_CLASSES,
    )


@router.post("/vision/export/onnx")
async def export_onnx():
    """Export the active object detector to ONNX for Tauri/edge deployment."""
    try:
        detector = get_detector()
        if not hasattr(detector, "model") or detector.model is None:
            raise HTTPException(status_code=400, detail="No detector model loaded")
        os.makedirs(settings.EXPORTS_DIR, exist_ok=True)
        exported = detector.model.export(format="onnx", imgsz=640, simplify=True, verbose=False)
        path = str(exported)
        if not os.path.exists(path):
            base, _ = os.path.splitext(detector.model_path)
            alt = f"{base}.onnx"
            if os.path.exists(alt):
                path = alt
            else:
                raise HTTPException(status_code=500, detail="ONNX export produced no file")
        size_mb = os.path.getsize(path) / (1024 * 1024)
        return {
            "success": True,
            "filename": os.path.basename(path),
            "path": path,
            "size": f"{size_mb:.1f} MB",
            "message": f"Exported {detector.model_name} to ONNX",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ONNX export failed: {str(e)}")


# ------------------------------------------------------------------
# BG (background) classifier training
# ------------------------------------------------------------------

@router.post("/vision/bg-train", response_model=BgTrainStartResponse)
async def start_bg_training(req: BgTrainStartRequest):
    if bg_training_service.is_running():
        return BgTrainStartResponse(success=False, error="BG training is already in progress")
    try:
        bg_training_service.start_training(
            epochs=req.epochs,
            batch_size=req.batch_size,
            image_size=req.image_size,
            workers=req.workers,
        )
        return BgTrainStartResponse(success=True, message="BG training started")
    except Exception as e:
        return BgTrainStartResponse(success=False, error=str(e))


@router.get("/vision/bg-train/status", response_model=BgTrainStatusResponse)
async def get_bg_training_status():
    return BgTrainStatusResponse(**bg_training_service.get_status())
