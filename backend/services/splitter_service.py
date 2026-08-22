"""Dataset Splitter Service.

Splits mixed images (object + background in the same picture) into two
separate dataset trees using the existing YOLO detector:

    datasets/objects/<object_class>/   — cropped object bbox (with padding)
    datasets/backgrounds/<bg_class>/   — strips/corners OUTSIDE the bbox

Boss trains both datasets himself; this service only prepares the data.
"""
import io
import os
import time
import logging
from typing import Any, Dict, List

from PIL import Image

logger = logging.getLogger("captchamaster.services.splitter")

OBJECTS_DIR = os.path.join("datasets", "objects")
BACKGROUNDS_DIR = os.path.join("datasets", "backgrounds")

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".bmp")
MAX_FILE_BYTES = 50 * 1024 * 1024

# A bg strip is only kept when it is at least this fraction of the image
# area and both dimensions >= 15% of the smaller image side (captcha tiles
# are small — a fixed pixel floor would skip everything).
MIN_BG_AREA_RATIO = 0.03
MIN_SIDE_RATIO = 0.15
# Expand the detected bbox by this fraction on each side so the object
# crop keeps a little context instead of cutting the object tight.
BBOX_PADDING = 0.05


def _safe_class(name: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in name.strip().lower()) or "unknown"


def _bg_regions(w: int, h: int, x1: int, y1: int, x2: int, y2: int):
    """Rectangular regions outside the bbox: top, bottom, left, right."""
    regions = {
        "top": (0, 0, w, y1),
        "bottom": (0, y2, w, h),
        "left": (0, y1, x1, y2),
        "right": (x2, y1, w, y2),
    }
    img_area = w * h
    min_px = max(16, int(MIN_SIDE_RATIO * min(w, h)))
    for name, box in regions.items():
        bx1, by1, bx2, by2 = box
        bw, bh = bx2 - bx1, by2 - by1
        if bw >= min_px and bh >= min_px and (bw * bh) >= img_area * MIN_BG_AREA_RATIO:
            yield name, box


def _grabcut_object_bbox(image: Image.Image):
    """Training-less object localization: GrabCut with a center rect prior.

    Captcha tiles keep the object roughly centered; GrabCut separates it from
    the background using color models only — no trained weights needed.
    Returns (x1, y1, x2, y2) or None on failure.
    """
    try:
        import cv2
        import numpy as np
    except ImportError:
        return None

    img = np.array(image.convert("RGB"))[:, :, ::-1].copy()  # RGB -> BGR
    h, w = img.shape[:2]
    m = 0.22  # center-prior margin
    rect = (int(w * m), int(h * m), int(w * (1 - 2 * m)), int(h * (1 - 2 * m)))
    mask = np.zeros((h, w), np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(img, mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
    except Exception:
        return None
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)
    contours, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    c = max(contours, key=cv2.contourArea)
    if cv2.contourArea(c) < h * w * 0.02:
        return None  # blob too small to trust
    x, y, bw, bh = cv2.boundingRect(c)
    return x, y, x + bw, y + bh


async def split_image(
    content: bytes,
    object_class: str,
    bg_class: str,
    conf_threshold: float = 0.35,
    padding: float = BBOX_PADDING,
) -> Dict[str, Any]:
    """Split a mixed image into object crop + background crops.

    Object localization chain (no training needed to start):
      1. YOLO detector — kicks in once Boss trains a real model
      2. GrabCut center-prior — training-less, works out of the box
      3. Center-crop fallback — middle 55% treated as the object
    """
    from backend.vision.dependencies import get_detector

    if len(content) > MAX_FILE_BYTES:
        raise ValueError("File too large (max 50MB)")

    detector = get_detector()
    detections = await detector.detect_objects(content, conf_threshold)
    image = Image.open(io.BytesIO(content)).convert("RGB")
    w, h = image.size

    obj_cls = _safe_class(object_class)
    bg_cls = _safe_class(bg_class)
    obj_dir = os.path.join(OBJECTS_DIR, obj_cls)
    bg_dir = os.path.join(BACKGROUNDS_DIR, bg_cls)
    os.makedirs(obj_dir, exist_ok=True)
    os.makedirs(bg_dir, exist_ok=True)

    ts = int(time.time() * 1000)
    saved_objects: List[str] = []
    saved_bgs: List[str] = []

    if detections:
        det = detections[0]  # highest confidence
        x1, y1, x2, y2 = det["box"]
        label, confidence, method = det["label"], det["confidence"], "detector"
    else:
        box = _grabcut_object_bbox(image)
        if box is not None:
            x1, y1, x2, y2 = box
            label, confidence, method = None, 0.0, "grabcut"
        else:
            m = int(0.225 * min(w, h))
            x1, y1, x2, y2 = m, m, w - m, h - m
            label, confidence, method = None, 0.0, "center"

    # padding expand + clamp
    px, py = (x2 - x1) * padding, (y2 - y1) * padding
    x1, y1 = max(0, int(x1 - px)), max(0, int(y1 - py))
    x2, y2 = min(w, int(x2 + px)), min(h, int(y2 + py))

    # Object crop (padded bbox)
    obj_name = f"{obj_cls}_{ts}_obj.jpg"
    image.crop((x1, y1, x2, y2)).save(os.path.join(obj_dir, obj_name), quality=95)
    saved_objects.append(obj_name)

    # Background crops (outside the bbox)
    for region_name, box in _bg_regions(w, h, x1, y1, x2, y2):
        bg_name = f"{bg_cls}_{ts}_{region_name}.jpg"
        image.crop(box).save(os.path.join(bg_dir, bg_name), quality=95)
        saved_bgs.append(bg_name)

    return {
        "detected": method != "center",
        "method": method,
        "label": label,
        "confidence": confidence,
        "object_crops": saved_objects,
        "bg_crops": saved_bgs,
    }


def get_stats() -> Dict[str, Any]:
    """Count prepared crops per class for both trees."""
    def _tree(root: str) -> List[Dict[str, Any]]:
        items = []
        if os.path.isdir(root):
            for d in sorted(os.scandir(root), key=lambda e: e.name.lower()):
                if d.is_dir():
                    count = sum(
                        1 for f in os.listdir(d.path)
                        if f.lower().endswith(IMAGE_EXTS)
                    )
                    items.append({"class": d.name, "count": count})
        return items

    objects = _tree(OBJECTS_DIR)
    backgrounds = _tree(BACKGROUNDS_DIR)
    return {
        "objects": objects,
        "backgrounds": backgrounds,
        "total_objects": sum(i["count"] for i in objects),
        "total_backgrounds": sum(i["count"] for i in backgrounds),
    }


def delete_class(kind: str, class_name: str) -> int:
    root = OBJECTS_DIR if kind == "objects" else BACKGROUNDS_DIR
    target = os.path.join(root, _safe_class(class_name))
    if not os.path.isdir(target):
        raise FileNotFoundError(f"Class not found: {class_name}")
    import shutil
    count = sum(
        1 for f in os.listdir(target)
        if f.lower().endswith(IMAGE_EXTS)
    )
    shutil.rmtree(target)
    return count


def list_images(kind: str, class_name: str) -> List[str]:
    """List saved crop filenames for a class."""
    root = OBJECTS_DIR if kind == "objects" else BACKGROUNDS_DIR
    target = os.path.join(root, _safe_class(class_name))
    if not os.path.isdir(target):
        raise FileNotFoundError(f"Class not found: {class_name}")
    return sorted(f for f in os.listdir(target) if f.lower().endswith(IMAGE_EXTS))


def image_path(kind: str, class_name: str, filename: str) -> str:
    """Absolute-safe path for a single crop (path traversal guarded)."""
    root = OBJECTS_DIR if kind == "objects" else BACKGROUNDS_DIR
    target = os.path.join(root, _safe_class(class_name))
    path = os.path.normpath(os.path.join(target, os.path.basename(filename)))
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Image not found: {filename}")
    return path


def zip_class(kind: str, class_name: str) -> str:
    """Zip a whole class folder (folder-per-class layout inside) and return path."""
    import zipfile
    root = OBJECTS_DIR if kind == "objects" else BACKGROUNDS_DIR
    cls = _safe_class(class_name)
    target = os.path.join(root, cls)
    if not os.path.isdir(target):
        raise FileNotFoundError(f"Class not found: {class_name}")
    out_root = os.path.join("exports", "split")
    os.makedirs(out_root, exist_ok=True)
    out_path = os.path.join(out_root, f"{cls}.zip")
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(os.listdir(target)):
            if f.lower().endswith(IMAGE_EXTS):
                zf.write(os.path.join(target, f), arcname=os.path.join(cls, f))
    return out_path


def import_bg_zip(zip_bytes: bytes, replace: bool = False) -> Dict[str, Any]:
    """Import a ZIP of pure background images into datasets/backgrounds/.

    ZIP layout: folder-per-class (castle/1.jpg, castle/2.jpg ...) or a flat
    ZIP (all images go to class "extra"). Existing classes are merged;
    replace=True wipes each target class first.
    """
    import zipfile

    if len(zip_bytes) > 500 * 1024 * 1024:
        raise ValueError("ZIP too large (max 500MB)")

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        names = [n for n in zf.namelist() if n.lower().endswith(IMAGE_EXTS)]
        if not names:
            raise ValueError("ZIP e kono image nai (jpg/png/webp/bmp)")

        ts = int(time.time() * 1000)
        imported: Dict[str, int] = {}
        for i, name in enumerate(names):
            # top-level folder = class, na thakle "extra"
            parts = name.replace("\\", "/").split("/")
            cls = _safe_class(parts[0]) if len(parts) > 1 else "extra"
            if replace and cls not in imported:
                target_dir = os.path.join(BACKGROUNDS_DIR, cls)
                if os.path.isdir(target_dir):
                    import shutil
                    shutil.rmtree(target_dir)
            cls_dir = os.path.join(BACKGROUNDS_DIR, cls)
            os.makedirs(cls_dir, exist_ok=True)
            try:
                img = Image.open(io.BytesIO(zf.read(name))).convert("RGB")
            except Exception:
                continue
            out = os.path.join(cls_dir, f"{cls}_{ts}_{i}.jpg")
            img.save(out, quality=95)
            imported[cls] = imported.get(cls, 0) + 1

    return {
        "success": True,
        "classes": imported,
        "total": sum(imported.values()),
        "stats": get_stats(),
    }


def _parse_combo(name: str):
    """'deer and beach' → ('deer', 'beach') or None."""
    import re
    m = re.match(r"^(.+?)\s+and\s+(.+)$", name.strip(), re.IGNORECASE)
    if not m:
        return None
    obj = m.group(1).strip().lower().replace(" ", "_")
    bg = m.group(2).strip().lower().replace(" ", "_")
    if not obj or not bg:
        return None
    return obj, bg


async def auto_zip(zip_bytes: bytes, replace: bool = False) -> Dict[str, Any]:
    """Smart ZIP import.

    Folder names decide what happens, per folder:
      * "X and Y" (e.g. deer and beach) → images are MIXED; each one is
        auto-split into datasets/objects/X/ + datasets/backgrounds/Y/
      * plain name (e.g. castle) → pure background images; imported to
        datasets/backgrounds/castle/
    """
    import zipfile
    import asyncio

    if len(zip_bytes) > 500 * 1024 * 1024:
        raise ValueError("ZIP too large (max 500MB)")

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        names = [n for n in zf.namelist() if n.lower().endswith(IMAGE_EXTS)]
        if not names:
            raise ValueError("ZIP e kono image nai (jpg/png/webp/bmp)")

        # group by top-level folder
        folders: Dict[str, List[str]] = {}
        for n in names:
            parts = n.replace("\\", "/").split("/")
            folder = parts[0] if len(parts) > 1 else ""
            folders.setdefault(folder, []).append(n)

        ts = int(time.time() * 1000)
        imported_bg: Dict[str, int] = {}
        split_counts: Dict[str, Dict[str, int]] = {}
        errors: List[str] = []

        if replace:
            wiped = set()
            for folder in folders:
                combo = _parse_combo(folder)
                targets = (
                    [os.path.join(BACKGROUNDS_DIR, _safe_class(combo[1])),
                     os.path.join(OBJECTS_DIR, _safe_class(combo[0]))]
                    if combo else [os.path.join(BACKGROUNDS_DIR, _safe_class(folder))]
                )
                for t in targets:
                    if t not in wiped and os.path.isdir(t):
                        import shutil
                        shutil.rmtree(t)
                        wiped.add(t)

        for folder, files in folders.items():
            combo = _parse_combo(folder)
            if combo is None:
                # pure background folder
                cls = _safe_class(folder) if folder else "extra"
                cls_dir = os.path.join(BACKGROUNDS_DIR, cls)
                os.makedirs(cls_dir, exist_ok=True)
                for i, name in enumerate(files):
                    try:
                        img = Image.open(io.BytesIO(zf.read(name))).convert("RGB")
                    except Exception:
                        continue
                    img.save(os.path.join(cls_dir, f"{cls}_{ts}_{i}.jpg"), quality=95)
                    imported_bg[cls] = imported_bg.get(cls, 0) + 1
            else:
                obj_cls, bg_cls = combo
                counts = split_counts.setdefault(f"{obj_cls} and {bg_cls}", {"obj": 0, "bg": 0})
                for name in files:
                    try:
                        res = await split_image(zf.read(name), obj_cls, bg_cls)
                        counts["obj"] += len(res["object_crops"])
                        counts["bg"] += len(res["bg_crops"])
                    except Exception as e:
                        errors.append(f"{name}: {e}")

    return {
        "success": len(errors) == 0,
        "imported_bg": imported_bg,
        "split": split_counts,
        "total_bg": sum(imported_bg.values()) + sum(c["bg"] for c in split_counts.values()),
        "total_obj": sum(c["obj"] for c in split_counts.values()),
        "errors": errors[:20],
        "stats": get_stats(),
    }
