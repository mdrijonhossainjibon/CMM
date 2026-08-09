import os
import shutil
import json
import time
import yaml
import logging
import random
import threading
import subprocess
from pathlib import Path
from ultralytics import YOLO

logger = logging.getLogger("captchamaster.training")


def prepare_yolo_data(filter_classes=None):
    """Prepare YOLO dataset from training_data/ directory.
    If filter_classes is provided, only include images from those classes.
    """
    base_path = Path("dataset")
    train_path = base_path / "train"
    val_path = base_path / "val"

    for p in [train_path, val_path]:
        (p / "images").mkdir(parents=True, exist_ok=True)
        (p / "labels").mkdir(parents=True, exist_ok=True)

    source_dir = Path("training_data")
    images = []
    for ext in ['*.jpg', '*.jpeg', '*.png', '*.JPG', '*.JPEG', '*.PNG']:
        images.extend(list(source_dir.glob(ext)))

    if filter_classes:
        filter_set = set(c.strip().lower() for c in filter_classes if c.strip())
        if filter_set:
            images = [img for img in images if img.name.split('_')[0].lower() in filter_set]
            logger.info("Filtered to classes: %s — %d images", filter_classes, len(images))

    if not images:
        logger.error("No images found in training_data/")
        return None

    classes = sorted(list(set([img.name.split('_')[0] for img in images])))
    class_to_id = {cls: i for i, cls in enumerate(classes)}
    logger.info("Found classes: %s", classes)

    random.shuffle(images)
    split_idx = int(len(images) * 0.8)
    train_images = images[:split_idx]
    val_images = images[split_idx:]

    if len(val_images) == 0 and len(train_images) > 0:
        val_images = train_images

    def process_set(img_list, target_path):
        for img_path in img_list:
            cls_name = img_path.name.split('_')[0]
            cls_id = class_to_id[cls_name]
            shutil.copy(img_path, target_path / "images" / img_path.name)
            label_file = target_path / "labels" / f"{img_path.stem}.txt"
            with open(label_file, "w") as f:
                f.write(f"{cls_id} 0.5 0.5 0.8 0.8\n")

    process_set(train_images, train_path)
    process_set(val_images, val_path)

    data_yaml = {
        'train': str(train_path.absolute() / "images"),
        'val': str(val_path.absolute() / "images"),
        'nc': len(classes),
        'names': classes,
    }

    yaml_path = Path("data.yaml")
    with open(yaml_path, "w") as f:
        yaml.dump(data_yaml, f)

    logger.info("Dataset prepared: %d train, %d val", len(train_images), len(val_images))
    return yaml_path


def get_output_name(training_type: str) -> str:
    """Get output filename based on training type."""
    output_map = {
        "aws": "aws",
        "kbs": "kbs",
        "kb-l": "kb-l",
        "auto": "captcha-model",
        "custom": "captcha-model",
    }
    return output_map.get(training_type, "captcha-model")


GPU_STATUS_FILE = Path("runs/gpu_status.json")
GPU_POLL_INTERVAL = 2


def _query_gpu_stats():
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True, text=True, timeout=2,
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
    GPU_STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)

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

    if GPU_STATUS_FILE.exists():
        try:
            GPU_STATUS_FILE.unlink()
        except OSError:
            pass


def train():
    logger.info("=" * 50)
    logger.info("  CaptchaMaster AI Trainer - Model Training")
    logger.info("=" * 50)

    dataset_type = os.environ.get("TRAIN_DATASET_TYPE", "auto")
    epochs = int(os.environ.get("TRAIN_EPOCHS", "100"))
    batch_size = int(os.environ.get("TRAIN_BATCH_SIZE", "16"))
    image_size = int(os.environ.get("TRAIN_IMAGE_SIZE", "640"))
    workers = int(os.environ.get("TRAIN_WORKERS", "8"))
    device = os.environ.get("TRAINING_DEVICE", "auto")
    selected_classes_raw = os.environ.get("TRAIN_SELECTED_CLASSES", "")
    selected_classes = [c.strip() for c in selected_classes_raw.split(",") if c.strip()] if selected_classes_raw else None

    import torch
    if device != "cpu" and not torch.cuda.is_available():
        logger.warning("CUDA not available — falling back to CPU (training will be slower)")
        device = "cpu"
    logger.info("Using device: %s", device)

    data_yaml = prepare_yolo_data(selected_classes)

    if data_yaml is None:
        logger.error("Training aborted: No data available.")
        return

    output_name = get_output_name(dataset_type)

    logger.info("Dataset: %s", data_yaml)
    logger.info("Training Type: %s", dataset_type)
    logger.info("Output Name: %s", output_name)
    logger.info("Epochs: %d, Batch: %d, ImgSize: %d, Workers: %d", epochs, batch_size, image_size, workers)
    logger.info("Starting YOLO training...")

    model = YOLO("yolov8n.pt")

    progress_file = Path("runs/train_progress.txt")
    progress_file.parent.mkdir(parents=True, exist_ok=True)

    def on_train_epoch_end(trainer):
        current_epoch = trainer.epoch + 1
        percent = int((current_epoch / epochs) * 100)
        try:
            with open(progress_file, "w") as f:
                f.write(str(percent))
        except OSError:
            pass

    model.add_callback("on_train_epoch_end", on_train_epoch_end)

    gpu_stop = threading.Event()
    gpu_thread = threading.Thread(target=_gpu_monitor_thread, args=(gpu_stop,), daemon=True)
    gpu_thread.start()
    logger.info("GPU monitor started (interval: %ds)", GPU_POLL_INTERVAL)

    try:
        results = model.train(
            data=str(data_yaml),
            epochs=epochs,
            imgsz=image_size,
            batch=batch_size,
            device=device,
            amp=True,
            workers=workers,
            project="runs/detect",
            name=output_name,
            exist_ok=True,
            mosaic=0.0,
            mixup=0.0,
            degrees=0.0,
            translate=0.0,
            scale=0.0,
            fliplr=0.0,
            hsv_h=0.0,
            hsv_s=0.0,
            hsv_v=0.0,
        )
    finally:
        gpu_stop.set()
        gpu_thread.join(timeout=3)
        logger.info("GPU monitor stopped")

    with open(progress_file, "w") as f:
        f.write("100")

    save_dir = Path(results.save_dir)
    best_model = save_dir / "weights" / "best.pt"

    if best_model.exists():
        os.makedirs("backend/model", exist_ok=True)
        shutil.copy(best_model, "backend/model/best.pt")

        os.makedirs("exports", exist_ok=True)
        shutil.copy(best_model, f"exports/{output_name}.pt")
        logger.info("Model saved: backend/model/best.pt and exports/%s.pt", output_name)

        try:
            logger.info("Exporting to ONNX...")
            model.export(format="onnx", imgsz=image_size)
            onnx_export = save_dir / "weights/best.onnx"
            if onnx_export.exists():
                shutil.copy(onnx_export, f"exports/{output_name}.onnx")
                logger.info("ONNX exported: exports/%s.onnx", output_name)
        except Exception as e:
            logger.warning("ONNX export failed: %s", e)
    else:
        logger.error("Training failed - best.pt not found at %s", best_model)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    train()
