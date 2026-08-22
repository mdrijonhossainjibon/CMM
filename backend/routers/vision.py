from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import List, Optional
import os
import shutil
import time

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
    SceneTrainStartRequest,
    SceneTrainStartResponse,
    SceneTrainStatusResponse,
)
from backend.vision import pipeline
from backend.vision.scene import SCENE_CLASSES
from backend.vision.dependencies import get_detector, get_scene_classifier, get_segmenter
from backend.services.scene_training_service import SceneTrainingService

router = APIRouter(prefix="/api", tags=["Vision"])

_scene_train_service = SceneTrainingService()


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
# Scene Classifier Training
# ------------------------------------------------------------------

@router.get("/vision/scene-classes", response_model=List[str])
async def list_scene_classes():
    root = settings.SCENE_DATASET_DIR
    if not os.path.isdir(root):
        return []
    classes = sorted([d.name for d in os.scandir(root) if d.is_dir()])
    return classes


@router.get("/vision/scene-dataset-stats")
async def scene_dataset_stats():
    root = settings.SCENE_DATASET_DIR
    stats = []
    total = 0
    if os.path.isdir(root):
        for cls_dir in sorted(os.scandir(root), key=lambda e: e.name.lower()):
            if not cls_dir.is_dir():
                continue
            count = sum(1 for f in os.scandir(cls_dir.path) if f.is_file() and os.path.splitext(f.name)[1].lower() in (".jpg", ".jpeg", ".png", ".webp", ".bmp"))
            stats.append({"class": cls_dir.name, "count": count})
            total += count
    return {"classes": stats, "total_images": total}


@router.post("/vision/scene-upload")
async def upload_scene_images(files: List[UploadFile] = File(...), class_name: str = Form(...)):
    if not class_name.strip():
        raise HTTPException(status_code=400, detail="Class name is required")
    safe_class = class_name.strip().lower().replace(" ", "_")
    target_dir = os.path.join(settings.SCENE_DATASET_DIR, safe_class)
    os.makedirs(target_dir, exist_ok=True)

    saved = []
    errors = []
    base_ts = int(time.time() * 1000)
    for idx, f in enumerate(files):
        try:
            ext = os.path.splitext(f.filename or "image.jpg")[1] or ".jpg"
            filename = f"{safe_class}_{base_ts}_{idx}{ext}"
            filepath = os.path.join(target_dir, filename)
            content = f.file.read()
            if len(content) > 50 * 1024 * 1024:
                raise ValueError("File too large (max 50MB)")
            with open(filepath, "wb") as out:
                out.write(content)
            saved.append(filename)
        except Exception as e:
            errors.append(f"{f.filename}: {str(e)}")

    return {"success": len(errors) == 0, "saved_count": len(saved), "error_count": len(errors), "saved_files": saved, "errors": errors}


@router.delete("/vision/scene-class/{class_name}")
async def delete_scene_class(class_name: str):
    target = os.path.join(settings.SCENE_DATASET_DIR, class_name)
    if not os.path.isdir(target):
        raise HTTPException(status_code=404, detail="Class not found")
    count = 0
    for f in os.listdir(target):
        fp = os.path.join(target, f)
        if os.path.isfile(fp):
            os.remove(fp)
            count += 1
    try:
        os.rmdir(target)
    except OSError:
        pass
    return {"success": True, "deleted_count": count, "class": class_name}


@router.post("/vision/scene-train", response_model=SceneTrainStartResponse)
async def start_scene_training(req: SceneTrainStartRequest):
    if _scene_train_service.is_running():
        return SceneTrainStartResponse(success=False, error="Scene training is already in progress")
    try:
        session_id = None
        try:
            from backend.services.log_service import log_service
            session_id = await log_service.create_session(
                training_type="scene",
                epochs=req.epochs,
                batch_size=req.batch_size,
                image_size=req.image_size,
                workers=req.workers,
                selected_classes=[],
            )
        except Exception:
            session_id = None

        _scene_train_service.start_training(
            epochs=req.epochs,
            batch_size=req.batch_size,
            image_size=req.image_size,
            workers=req.workers,
            session_id=session_id,
        )
        return SceneTrainStartResponse(success=True, message="Scene training started", session_id=session_id)
    except Exception as e:
        return SceneTrainStartResponse(success=False, error=str(e))


@router.get("/vision/scene-train/status", response_model=SceneTrainStatusResponse)
async def get_scene_training_status():
    status = _scene_train_service.get_status()
    return SceneTrainStatusResponse(**status)
