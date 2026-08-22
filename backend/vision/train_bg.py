"""Background (scene) classifier training script.

Trains EfficientNet-B0 (transfer learning) on the Data Splitter's background
crops (folder-per-class):

    datasets/backgrounds/<class>/*.jpg

Outputs (auto-loaded by backend.vision.scene.SceneClassifier):
    backend/vision/models/scene_efficientnet.pt
    backend/vision/models/scene_classes.json

Env vars:
    BG_TRAIN_DATASET       default: datasets/backgrounds
    BG_TRAIN_EPOCHS        default: 25
    BG_TRAIN_BATCH_SIZE    default: 32
    BG_TRAIN_IMAGE_SIZE    default: 224
    BG_TRAIN_WORKERS       default: 4
    BG_TRAIN_DEVICE        default: auto (cuda if available)
    BG_TRAIN_PROGRESS_FILE default: runs/bg_train_progress.txt
"""
import os
import json
import logging
from pathlib import Path
from typing import List

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader, random_split
from torchvision import transforms
from torchvision.models import EfficientNet_B0_Weights, efficientnet_b0
from PIL import Image

logger = logging.getLogger("captchamaster.vision.bg_train")

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]
IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".bmp")


def _get_transforms(image_size: int = 224):
    return {
        "train": transforms.Compose([
            transforms.Resize((image_size, image_size)),
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


class BgDataset(Dataset):
    def __init__(self, root: str, transform, classes: List[str]):
        self.transform = transform
        self.classes = sorted(classes)
        self.class_to_idx = {c: i for i, c in enumerate(self.classes)}
        self.samples = []
        for cls in self.classes:
            cls_dir = Path(root) / cls
            if not cls_dir.is_dir():
                continue
            for f in sorted(cls_dir.iterdir()):
                if f.is_file() and f.suffix.lower() in IMAGE_EXTS:
                    self.samples.append((str(f), self.class_to_idx[cls]))

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        img = Image.open(path).convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, label


def train_bg():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    dataset_root = os.environ.get("BG_TRAIN_DATASET", "datasets/backgrounds")
    epochs = int(os.environ.get("BG_TRAIN_EPOCHS", "25"))
    batch_size = int(os.environ.get("BG_TRAIN_BATCH_SIZE", "32"))
    image_size = int(os.environ.get("BG_TRAIN_IMAGE_SIZE", "224"))
    workers = int(os.environ.get("BG_TRAIN_WORKERS", "4"))
    device = "cuda" if os.environ.get("BG_TRAIN_DEVICE", "auto") != "cpu" and torch.cuda.is_available() else "cpu"
    progress_file = Path(os.environ.get("BG_TRAIN_PROGRESS_FILE", "runs/bg_train_progress.txt"))
    progress_file.parent.mkdir(parents=True, exist_ok=True)

    logger.info("BG training device: %s", device)

    root = Path(dataset_root)
    if not root.is_dir():
        logger.error("No dataset dir at %s", dataset_root)
        with open(progress_file, "w") as f:
            f.write("0")
        return
    classes = sorted([d.name for d in root.iterdir() if d.is_dir()])
    if len(classes) < 2:
        logger.error("Need at least 2 bg classes, found %d in %s", len(classes), dataset_root)
        return

    transforms_map = _get_transforms(image_size)
    full = BgDataset(dataset_root, transforms_map["train"], classes)
    if len(full) < 4:
        logger.error("Not enough bg crops (%d) to train", len(full))
        return

    val_size = max(1, int(len(full) * 0.2))
    train_size = len(full) - val_size
    train_ds, val_ds = random_split(full, [train_size, val_size])
    val_ds.dataset.transform = transforms_map["val"]  # type: ignore

    logger.info("BG classes (%d): %s — %d crops", len(classes), classes, len(full))

    pin = device == "cuda"
    train_loader = DataLoader(train_ds, batch_size=min(batch_size, len(train_ds)), shuffle=True, num_workers=workers, pin_memory=pin)
    val_loader = DataLoader(val_ds, batch_size=max(1, batch_size // 2), shuffle=False, num_workers=min(workers, 2), pin_memory=pin)

    model = efficientnet_b0(weights=EfficientNet_B0_Weights.IMAGENET1K_V1)
    model.classifier[1] = nn.Linear(model.classifier[1].in_features, len(classes))
    model = model.to(device)

    criterion = nn.CrossEntropyLoss()
    optimizer = optim.AdamW(model.parameters(), lr=3e-4, weight_decay=1e-5)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    best_acc = 0.0
    best_state = None
    try:
        for epoch in range(epochs):
            model.train()
            correct = total = 0
            for imgs, labels in train_loader:
                imgs = imgs.to(device, non_blocking=True)
                labels = labels.to(device, non_blocking=True)
                optimizer.zero_grad()
                out = model(imgs)
                loss = criterion(out, labels)
                loss.backward()
                nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()
                correct += (out.argmax(1) == labels).sum().item()
                total += labels.size(0)
            train_acc = correct / max(total, 1)
            scheduler.step()

            model.eval()
            v_correct = v_total = 0
            with torch.no_grad():
                for imgs, labels in val_loader:
                    imgs = imgs.to(device, non_blocking=True)
                    labels = labels.to(device, non_blocking=True)
                    out = model(imgs)
                    v_correct += (out.argmax(1) == labels).sum().item()
                    v_total += labels.size(0)
            val_acc = v_correct / max(v_total, 1)

            combined = max(train_acc, val_acc)
            if combined > best_acc:
                best_acc = combined
                best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}

            percent = int(((epoch + 1) / epochs) * 100)
            try:
                with open(progress_file, "w") as f:
                    f.write(str(percent))
            except OSError:
                pass
            logger.info("Epoch %d/%d — train_acc=%.3f val_acc=%.3f best=%.3f", epoch + 1, epochs, train_acc, val_acc, best_acc)
    finally:
        pass

    with open(progress_file, "w") as f:
        f.write("100")

    if best_state is None:
        logger.error("BG training produced no model state")
        return

    out_dir = Path("backend/vision/models")
    out_dir.mkdir(parents=True, exist_ok=True)
    model_path = out_dir / "scene_efficientnet.pt"
    torch.save(best_state, model_path)
    logger.info("Saved best BG model: %s (acc=%.3f)", model_path, best_acc)

    classes_path = out_dir / "scene_classes.json"
    with open(classes_path, "w", encoding="utf-8") as f:
        json.dump({"classes": classes, "num_classes": len(classes), "image_size": image_size}, f, indent=2)
    logger.info("Saved BG classes: %s", classes_path)

    print(f"BG_TRAIN_DONE: model={model_path} classes={classes_path} acc={best_acc:.4f}")


if __name__ == "__main__":
    train_bg()
