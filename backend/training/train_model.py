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


class MongoLogSession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self._client = None
        self._db = None

    def _connect(self):
        if self._db is None:
            from pymongo import MongoClient
            mongo_uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
            db_name = os.environ.get("MONGODB_DB_NAME", "captchamaster")
            self._client = MongoClient(mongo_uri, serverSelectionTimeoutMS=3000)
            self._db = self._client[db_name]

    def log(self, message: str, *args):
        if not self.session_id:
            return
        try:
            self._connect()
            from bson import ObjectId
            text = message % args if args else message
            self._db["logs"].update_one(
                {"_id": ObjectId(self.session_id)},
                {"$push": {"lines": text}},
            )
        except Exception:
            pass

    def progress(self, percent: int):
        if not self.session_id:
            return
        try:
            self._connect()
            from bson import ObjectId
            self._db["logs"].update_one(
                {"_id": ObjectId(self.session_id)},
                {"$set": {"progress": percent}},
            )
        except Exception:
            pass

    def complete(self, status: str):
        if not self.session_id:
            return
        try:
            self._connect()
            from bson import ObjectId
            from datetime import datetime as _dt, timezone as _tz
            self._db["logs"].update_one(
                {"_id": ObjectId(self.session_id)},
                {
                    "$set": {
                        "status": status,
                        "progress": 100 if status == "completed" else None,
                        "ended_at": _dt.now(_tz.utc),
                    }
                },
            )
        except Exception:
            pass
        finally:
            if self._client:
                try:
                    self._client.close()
                except Exception:
                    pass


def _safe_copy_file(src: Path, dst: str):
    """Copy src to dst safely on Windows, handling locked destination files."""
    import tempfile as _tempfile

    dst_path = Path(dst)
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = dst_path.parent / f".{dst_path.name}.tmp"

    for attempt in range(5):
        try:
            shutil.copyfile(src, tmp_path)
            break
        except OSError as e:
            if attempt == 4:
                logger.error("Failed to stage temp copy to %s: %s", tmp_path, e)
                raise
            time.sleep(0.5)

    for attempt in range(5):
        try:
            if dst_path.exists():
                os.remove(dst_path)
            os.replace(tmp_path, dst_path)
            logger.info("Safe copy complete: %s", dst_path)
            return
        except OSError as e:
            if attempt == 4:
                # Last resort: plain copy to a fallback file
                fallback = dst_path.parent / f"{dst_path.name}.new"
                try:
                    shutil.copyfile(src, fallback)
                    logger.warning("Destination locked, saved fallback: %s", fallback)
                except OSError:
                    logger.error("Final copy to %s failed: %s", dst_path, e)
                    raise
                return
            time.sleep(1.0)


def _upload_to_r2(local_path: str, r2_key: str):
    try:
        cfg = _get_r2_config_from_db()
        if not cfg or not cfg.get("r2_enabled") or not cfg.get("r2_endpoint_url"):
            logger.debug("R2 not configured — skipping upload for %s", r2_key)
            return

        import boto3
        from botocore.config import Config

        client = boto3.client(
            "s3",
            endpoint_url=cfg["r2_endpoint_url"],
            aws_access_key_id=cfg["r2_access_key_id"],
            aws_secret_access_key=cfg["r2_secret_access_key"],
            config=Config(region_name=cfg.get("r2_region", "auto"), signature_version="s3v4"),
        )
        client.upload_file(local_path, cfg.get("r2_bucket_name", "captchamaster"), r2_key)
        logger.info("R2 upload complete: %s", r2_key)
    except Exception as e:
        logger.warning("R2 upload skipped [%s]: %s", r2_key, e)


def _get_r2_config_from_db() -> dict | None:
    try:
        from pymongo import MongoClient

        mongo_uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
        db_name = os.environ.get("MONGODB_DB_NAME", "captchamaster")

        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=3000)
        db = client[db_name]
        doc = db["app_settings"].find_one({"_id": "app_config"})
        client.close()

        if not doc:
            return None
        return {
            "r2_enabled": doc.get("r2_enabled", False),
            "r2_endpoint_url": doc.get("r2_endpoint_url", ""),
            "r2_access_key_id": doc.get("r2_access_key_id", ""),
            "r2_secret_access_key": doc.get("r2_secret_access_key", ""),
            "r2_bucket_name": doc.get("r2_bucket_name", "captchamaster"),
            "r2_region": doc.get("r2_region", "auto"),
        }
    except Exception as e:
        logger.debug("Could not read R2 config from MongoDB: %s", e)
        return None


def _resolve_class(filename: str) -> str:
    """Resolve class name from manifest first, fallback to filename split."""
    try:
        import json
        manifest = Path("training_data") / "classes.json"
        if manifest.exists():
            data = json.loads(manifest.read_text(encoding="utf-8"))
            if filename in data:
                return data[filename]
    except Exception:
        pass
    return filename.split("_")[0]


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
            images = [img for img in images if _resolve_class(img.name).lower() in filter_set]
            logger.info("Filtered to classes: %s — %d images", filter_classes, len(images))

    if not images:
        logger.error("No images found in training_data/")
        return None

    classes = sorted(list(set([_resolve_class(img.name) for img in images])))
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
            cls_name = _resolve_class(img_path.name)
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
    session_id = os.environ.get("TRAIN_SESSION_ID", "")
    selected_classes_raw = os.environ.get("TRAIN_SELECTED_CLASSES", "")
    selected_classes = [c.strip() for c in selected_classes_raw.split(",") if c.strip()] if selected_classes_raw else None

    db_session = MongoLogSession(session_id)

    import torch
    if device != "cpu" and not torch.cuda.is_available():
        logger.warning("CUDA not available — falling back to CPU (training will be slower)")
        device = "cpu"
    logger.info("Using device: %s", device)
    db_session.log("Using device: %s", device)

    data_yaml = prepare_yolo_data(selected_classes)

    if data_yaml is None:
        logger.error("Training aborted: No data available.")
        db_session.log("ERROR: Training aborted - no data available.")
        db_session.complete("failed")
        return

    output_name = get_output_name(dataset_type)

    logger.info("Dataset: %s", data_yaml)
    logger.info("Training Type: %s", dataset_type)
    logger.info("Output Name: %s", output_name)
    logger.info("Epochs: %d, Batch: %d, ImgSize: %d, Workers: %d", epochs, batch_size, image_size, workers)
    logger.info("Starting YOLO training...")
    db_session.log("Dataset: %s | Type: %s | Epochs: %d, Batch: %d, ImgSize: %d, Workers: %d", data_yaml, dataset_type, epochs, batch_size, image_size, workers)

    model = YOLO("yolov8n.pt")

    with open(data_yaml, "r") as f:
        data_config = yaml.safe_load(f)
    num_classes = data_config.get("nc", 1)

    for cache_file in Path("dataset").rglob("*.cache"):
        try:
            cache_file.unlink()
        except OSError:
            pass
    for cache_file in Path("dataset").rglob("*.npy"):
        try:
            cache_file.unlink()
        except OSError:
            pass
    logger.info("Cleared label caches for fresh training")

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
        db_session.progress(percent)
        if current_epoch % 10 == 0 or current_epoch == epochs:
            db_session.log("Epoch %d/%d completed (%d%%)", current_epoch, epochs, percent)

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
            cache=os.environ.get("TRAIN_CACHE", "ram"),
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
        _safe_copy_file(best_model, "backend/model/best.pt")

        os.makedirs("exports", exist_ok=True)
        _safe_copy_file(best_model, f"exports/{output_name}.pt")
        logger.info("Model saved: backend/model/best.pt and exports/%s.pt", output_name)
        db_session.log("Model saved: backend/model/best.pt and exports/%s.pt", output_name)

        _upload_to_r2(f"exports/{output_name}.pt", f"models/{output_name}.pt")

        try:
            logger.info("Exporting to ONNX...")
            model.export(format="onnx", imgsz=image_size)
            onnx_export = save_dir / "weights/best.onnx"
            if onnx_export.exists():
                _safe_copy_file(onnx_export, f"exports/{output_name}.onnx")
                logger.info("ONNX exported: exports/%s.onnx", output_name)
                _upload_to_r2(f"exports/{output_name}.onnx", f"models/{output_name}.onnx")
        except Exception as e:
            logger.warning("ONNX export failed: %s", e)
        db_session.log("Training completed successfully")
        db_session.complete("completed")
    else:
        logger.error("Training failed - best.pt not found at %s", best_model)
        db_session.log("ERROR: Training failed - best.pt not found at %s", best_model)
        db_session.complete("failed")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    train()
