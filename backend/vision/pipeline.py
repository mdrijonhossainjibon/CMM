"""Unified KB-L vision inference pipeline.

Combines object detection, scene classification and optional segmentation on a
single image or a 3x3 grid of tiles, and applies the rule engine to decide
which captcha tiles should be selected.
"""
import base64
import io
import logging
import time
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image

from backend.vision.dependencies import get_detector, get_scene_classifier, get_segmenter
from backend.vision.scene import SCENE_CLASSES
from backend.vision.rule_engine import parse_query, evaluate_tile
from backend.vision.segmenter import Segmenter

logger = logging.getLogger("captchamaster.vision.pipeline")

GRID_SIZE = 3  # 3x3 = 9 tiles


def decode_image(image_b64: str) -> Image.Image:
    if "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]
    raw = base64.b64decode(image_b64)
    return Image.open(io.BytesIO(raw)).convert("RGB")


def split_grid(image: Image.Image, grid: int = GRID_SIZE) -> List[Tuple[Image.Image, int, int]]:
    """Split image into grid x grid tiles. Returns (tile_img, row, col)."""
    w, h = image.size
    tw, th = w // grid, h // grid
    tiles = []
    for r in range(grid):
        for c in range(grid):
            box = (c * tw, r * th, (c + 1) * tw, (r + 1) * th)
            tiles.append((image.crop(box), r, c))
    return tiles


async def analyze_image(
    image: Image.Image,
    conf_threshold: float = 0.5,
    include_masks: bool = False,
) -> Dict[str, Any]:
    """Single-image pipeline: objects + scene (+ masks)."""
    detector = get_detector()
    scene_clf = get_scene_classifier()
    segmenter: Optional[Segmenter] = get_segmenter() if include_masks else None

    start = time.perf_counter()
    detections = await detector.detect_objects(
        _pil_to_bytes(image), conf_threshold
    )
    scene = scene_clf.classify(image, detections)

    masks: List[Dict[str, Any]] = []
    if segmenter is not None:
        masks = segmenter.segment(image, detections, conf_threshold)

    elapsed_ms = (time.perf_counter() - start) * 1000

    return {
        "objects": detections,
        "scene": scene["scene"],
        "scene_confidence": scene["confidence"],
        "scene_top": scene["top"],
        "masks": masks,
        "elapsed_ms": elapsed_ms,
    }


async def analyze_grid(
    image_b64: str,
    object_classes: Optional[List[str]] = None,
    scene_classes: Optional[List[str]] = None,
    query: Optional[str] = None,
    conf_threshold: float = 0.5,
) -> Dict[str, Any]:
    """3x3 grid captcha analysis with rule engine."""
    image = decode_image(image_b64)
    detector = get_detector()
    scene_clf = get_scene_classifier()

    start = time.perf_counter()
    tiles = split_grid(image, GRID_SIZE)
    rule = parse_query(query) if query else None

    results: List[Dict[str, Any]] = []
    for idx, (tile_img, r, c) in enumerate(tiles):
        tile_bytes = _pil_to_bytes(tile_img)
        detections = await detector.detect_objects(tile_bytes, conf_threshold)
        # primary object = highest confidence detection
        primary_obj = None
        obj_conf = 0.0
        if object_classes:
            for d in detections:
                lbl = d.get("label", "").lower()
                if any(lbl in o.lower() or o.lower() in lbl for o in object_classes):
                    if d.get("confidence", 0) > obj_conf:
                        primary_obj = d["label"]
                        obj_conf = d["confidence"]
        if primary_obj is None and detections:
            primary_obj = detections[0]["label"]
            obj_conf = detections[0]["confidence"]

        scene = scene_clf.classify(tile_img, detections)
        # scene_classes optional hint — always use the classifier's best prediction
        scene_label = scene["scene"]

        selected, reasons = evaluate_tile(rule, primary_obj, scene_label)
        results.append({
            "index": idx,
            "row": r,
            "col": c,
            "object": primary_obj,
            "object_confidence": obj_conf,
            "scene": scene_label,
            "scene_confidence": scene["confidence"] if scene_label else 0.0,
            "selected": selected,
            "match_reason": reasons,
        })

    selected_indices = [t["index"] for t in results if t["selected"]]
    elapsed_ms = (time.perf_counter() - start) * 1000
    return {
        "tiles": results,
        "selected": selected_indices,
        "statement": query,
        "elapsed_ms": elapsed_ms,
    }


async def segment_image(
    image_b64: str,
    conf_threshold: float = 0.5,
) -> Dict[str, Any]:
    """Return segmentation masks for an image (white=object, black=bg)."""
    image = decode_image(image_b64)
    detector = get_detector()
    segmenter = get_segmenter()
    start = time.perf_counter()
    detections = await detector.detect_objects(_pil_to_bytes(image), conf_threshold)
    masks = segmenter.segment(image, detections, conf_threshold)
    elapsed_ms = (time.perf_counter() - start) * 1000
    return {
        "masks": masks,
        "count": len(masks),
        "elapsed_ms": elapsed_ms,
    }


def _pil_to_bytes(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()
