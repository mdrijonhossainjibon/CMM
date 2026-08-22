"""Scene Classifier Training Script.

Trains an EfficientNet-B0 (transfer learning) on folder-per-class scene images:
    datasets/scenes/<class>/*.jpg

Outputs:
    backend/vision/models/scene_efficientnet.pt
    backend/vision/models/scene_classes.json

Env vars:
    SCENE_TRAIN_DATASET      default: datasets/scenes
    SCENE_TRAIN_EPOCHS       default: 30
    SCENE_TRAIN_BATCH_SIZE   default: 32
    SCENE_TRAIN_IMAGE_SIZE   default: 224
    SCENE_TRAIN_WORKERS      default: 4
    SCENE_TRAIN_DEVICE       default: auto (cuda if available)
    SCENE_TRAIN_SESSION_ID   default: ""
    SCENE_TRAIN_PROGRESS_FILE default: runs/scene_train_progress.txt
"""
import os
import sys
import json
import time
import random
import logging
import threading
import subprocess
from pathlib import Path
from typing import List, Tuple

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader, random_split
from torchvision import datasets, transforms
from torchvision.models import EfficientNet_B0_Weights, efficientnet_b0
from PIL import Image

logger = logging.getLogger("captchamaster.vision.scene_train")

# Reuse existing Mongo log session for progress tracking
try:
    from backend.training.train_model import MongoLogSession
except ImportError:
    MongoLogSession = None  # type: ignore

GPU_STATUS_FILE = "runs/gpu_status.json"
GPU_POLL_INTERVAL = 2


def _query_gpu_stats():
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=2,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return None
        parts = [p.strip() for p in result.stdout.strip().split(",")]
        if len(parts) >= 4:
            return {
                "gpu_util": int(parts[0]),
                "gpu_mem_used": int(parts[1]),
                "gpu_mem_total": int(parts[2]),
                "gpu_temperature": int(parts[3]),
            }
    except (FileNotFoundError, subprocess.TimeoutExpired, ValueError, IndexError, OSError):
        pass
    return None


def _gpu_monitor_thread(stop_event: threading.Event):
    Path(GPU_STATUS_FILE).parent.mkdir(parents=True, exist_ok=True)

    def write_file(data: dict):
        try:
            with open(GPU_STATUS_FILE, "w") as f:
                json.dump(data, f)
        except OSError:
            pass

    write_file({"gpu_util": 0, "gpu_mem_used": 0, "gpu_mem_total": 0, "gpu_temperature": 0})

    while not stop_event.wait(GPU_POLL_INTERVAL):
        stats = _query_gpu_stats()
        if stats:
            write_file(stats)
        else:
            write_file({"gpu_util": 0, "gpu_mem_used": 0, "gpu_mem_total": 0, "gpu_temperature": 0})

    if Path(GPU_STATUS_FILE).exists():
        try:
            Path(GPU_STATUS_FILE).unlink()
        except OSError:
            pass


IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


def _get_transforms(image_size: int = 224):
    return {
        "train": transforms.Compose([
            transforms.Resize((image_size + 32, image_size + 32)),
            transforms.RandomResizedCrop(image_size, scale=(0.8, 1.0)),
            transforms.RandomHorizontalFlip(p=0.3),
            transforms.ColorJitter(brightness=0.15, contrast=0.1, saturation=0.05),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ]),
        "val": transforms.Compose([
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ]),
    }


class SceneDataset(Dataset):
    def __init__(self, root: str, transform, classes: List[str]):
        self.root = Path(root)
        self.transform = transform
        self.classes = sorted(classes)
        self.class_to_idx = {c: i for i, c in enumerate(self.classes)}
        self.samples: List[Tuple[str, int]] = []
        for cls in self.classes:
            cls_dir = self.root / cls
            if not cls_dir.is_dir():
                continue
            for f in sorted(cls_dir.iterdir()):
                if f.is_file() and f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".bmp"):
                    self.samples.append((str(f), self.class_to_idx[cls]))

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        img = Image.open(path).convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, label


def _prepare_scene_dataset(dataset_root: str, val_split: float = 0.2):
    classes = sorted([d.name for d in Path(dataset_root).iterdir() if d.is_dir()])
    if not classes:
        logger.error("No class folders found in %s", dataset_root)
        return None, None, None
    transforms_map = _get_transforms()
    full = SceneDataset(dataset_root, transforms_map["train"], classes)
    val_size = max(1, int(len(full) * val_split))
    train_size = len(full) - val_size
    if train_size == 0:
        train_size = len(full)
        val_size = 0
    train_ds, val_ds = random_split(full, [train_size, val_size])
    val_ds.dataset.transform = transforms_map["val"]  # type: ignore
    return train_ds, val_ds, classes


def _build_model(num_classes: int, device: str):
    weights = EfficientNet_B0_Weights.IMAGENET1K_V1
    model = efficientnet_b0(weights=weights)
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, num_classes)
    return model.to(device)


def train_scene():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    dataset_root = os.environ.get("SCENE_TRAIN_DATASET", "datasets/scenes")
    epochs = int(os.environ.get("SCENE_TRAIN_EPOCHS", "30"))
    batch_size = int(os.environ.get("SCENE_TRAIN_BATCH_SIZE", "32"))
    image_size = int(os.environ.get("SCENE_TRAIN_IMAGE_SIZE", "224"))
    workers = int(os.environ.get("SCENE_TRAIN_WORKERS", "4"))
    device_raw = os.environ.get("SCENE_TRAIN_DEVICE", "auto")
    session_id = os.environ.get("SCENE_TRAIN_SESSION_ID", "")
    progress_file = Path(os.environ.get("SCENE_TRAIN_PROGRESS_FILE", "runs/scene_train_progress.txt"))
    progress_file.parent.mkdir(parents=True, exist_ok=True)

    db_session = MongoLogSession(session_id) if MongoLogSession and session_id else None  # type: ignore

    if device_raw == "cpu" or not torch.cuda.is_available():
        device = "cpu"
    else:
        device = "cuda"
    logger.info("Using device: %s", device)
    if db_session:
        db_session.log("Scene training device: %s", device)

    train_ds, val_ds, classes = _prepare_scene_dataset(dataset_root)
    if train_ds is None or not classes:
        logger.error("Scene training aborted: no data at %s", dataset_root)
        if db_session:
            db_session.log("ERROR: no scene data at %s", dataset_root)
            db_session.complete("failed")
        return

    num_classes = len(classes)
    logger.info("Scene classes (%d): %s", num_classes, classes)
    if db_session:
        db_session.log("Scene classes (%d): %s", num_classes, ", ".join(classes))

    pin_memory = device == "cuda"
    train_batch = min(batch_size, len(train_ds))
    val_batch = max(1, min(batch_size // 2, len(val_ds))) if len(val_ds) > 0 else 1
    train_loader = DataLoader(train_ds, batch_size=train_batch, shuffle=True, num_workers=workers, pin_memory=pin_memory, drop_last=False)
    val_loader = DataLoader(val_ds, batch_size=val_batch, shuffle=False, num_workers=min(workers, 2), pin_memory=pin_memory) if len(val_ds) > 0 else None

    model = _build_model(num_classes, device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.AdamW(model.parameters(), lr=3e-4, weight_decay=1e-5)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    gpu_stop = threading.Event()
    gpu_thread = threading.Thread(target=_gpu_monitor_thread, args=(gpu_stop,), daemon=True)
    gpu_thread.start()
    logger.info("Scene GPU monitor started")

    best_acc = 0.0
    best_state = None
    try:
        for epoch in range(epochs):
            model.train()
            correct = 0
            total = 0
            for imgs, labels in train_loader:
                imgs = imgs.to(device, non_blocking=True)
                labels = labels.to(device, non_blocking=True)
                optimizer.zero_grad()
                outputs = model(imgs)
                loss = criterion(outputs, labels)
                loss.backward()
                nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()
                _, preds = outputs.max(1)
                correct += (preds == labels).sum().item()
                total += labels.size(0)
            train_acc = correct / max(total, 1)
            scheduler.step()

            val_acc = 0.0
            if val_loader is not None:
                model.eval()
                v_correct = 0
                v_total = 0
                with torch.no_grad():
                    for imgs, labels in val_loader:
                        imgs = imgs.to(device, non_blocking=True)
                        labels = labels.to(device, non_blocking=True)
                        outputs = model(imgs)
                        _, preds = outputs.max(1)
                        v_correct += (preds == labels).sum().item()
                        v_total += labels.size(0)
                val_acc = v_correct / max(v_total, 1)

            combined_acc = max(train_acc, val_acc) if val_loader else train_acc
            is_best = combined_acc > best_acc
            if is_best:
                best_acc = combined_acc
                best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}

            percent = int(((epoch + 1) / epochs) * 100)
            try:
                with open(progress_file, "w") as f:
                    f.write(str(percent))
            except OSError:
                pass
            if db_session:
                db_session.progress(percent)
                db_session.log("Epoch %d/%d — train_acc=%.2f val_acc=%.2f best=%.2f", epoch + 1, epochs, train_acc, val_acc, best_acc)

            logger.info("Epoch %d/%d — train_acc=%.3f val_acc=%.3f best=%.3f lr=%.5f", epoch + 1, epochs, train_acc, val_acc, best_acc, scheduler.get_last_lr()[0])
    finally:
        gpu_stop.set()
        gpu_thread.join(timeout=3)

    with open(progress_file, "w") as f:
        f.write("100")

    if best_state is None:
        logger.error("Scene training failed — no model state produced")
        if db_session:
            db_session.log("ERROR: no model state produced")
            db_session.complete("failed")
        return

    out_dir = Path("backend/vision/models")
    out_dir.mkdir(parents=True, exist_ok=True)
    model_path = out_dir / "scene_efficientnet.pt"
    torch.save(best_state, model_path)
    logger.info("Saved best scene model: %s (acc=%.3f)", model_path, best_acc)

    classes_path = out_dir / "scene_classes.json"
    with open(classes_path, "w", encoding="utf-8") as f:
        json.dump({"classes": classes, "num_classes": num_classes, "image_size": image_size}, f, indent=2)
    logger.info("Saved scene classes: %s", classes_path)

    if db_session:
        db_session.log("Scene training completed: %s (acc=%.3f) classes=%d", model_path, best_acc, num_classes)
        db_session.complete("completed")

    print(f"SCENE_TRAIN_DONE: model={model_path} classes={classes_path} acc={best_acc:.4f}")


if __name__ == "__main__":
    train_scene()
