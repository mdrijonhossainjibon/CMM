import os
import json
import math
import subprocess
import sys
import time as time_module
from typing import Optional
from backend.core.config import settings

GPU_STATUS_FILE = "runs/gpu_status.json"


def estimate_vram_mb(batch_size: int, image_size: int) -> int:
    """Estimate VRAM usage in MB for YOLOv8 training."""
    per_image_mb = (image_size ** 2) / 40000
    model_base_mb = 100
    total = int(batch_size * per_image_mb + model_base_mb)
    return max(total, 1)


def detect_hardware():
    info = {"device_type": "cpu", "gpu_name": None, "gpu_vram_mb": 0}
    try:
        import torch
        if torch.cuda.is_available():
            info["device_type"] = "gpu"
            info["gpu_name"] = torch.cuda.get_device_name(0)
            info["gpu_vram_mb"] = torch.cuda.get_device_properties(0).total_mem // (1024 * 1024)
    except ImportError:
        pass
    return info


def optimize_training_config(batch_size: int, image_size: int, workers: int, hardware: dict) -> tuple:
    """Auto-tune training parameters targeting ~30% GPU VRAM for balanced speed."""
    if hardware["device_type"] == "gpu":
        gpu_vram = hardware.get("gpu_vram_mb", 0)
        if gpu_vram > 0:
            target_vram = int(gpu_vram * 0.30)
            per_img = estimate_vram_mb(1, image_size)
            model_base = 100
            available_per_batch = max(target_vram - model_base, per_img)
            optimal_bs = min(available_per_batch // per_img, 128)
            optimized_bs = max(optimal_bs, batch_size)
        else:
            optimized_bs = min(batch_size * 2, 64)
        optimized_workers = min(workers, 16)
    else:
        optimized_bs = max(batch_size // 2, 4)
        optimized_workers = min(workers, 4)
    return optimized_bs, image_size, optimized_workers


class TrainingService:
    def __init__(self):
        self._process: Optional[subprocess.Popen] = None
        self._current_type: str = "auto"
        self._started_at: Optional[float] = None
        self._hardware: dict = {"device_type": "cpu", "gpu_name": None, "gpu_vram_mb": 0}
        self._batch_size: Optional[int] = None
        self._workers: Optional[int] = None
        self._vram_estimate_mb: int = 0

    def start_training(
        self,
        training_type: str = "aws",
        epochs: int = 100,
        batch_size: int = 16,
        image_size: int = 640,
        workers: int = 8,
        optimize: bool = True,
        selected_classes: list[str] | None = None,
    ) -> None:
        self._hardware = detect_hardware()

        if optimize:
            batch_size, image_size, workers = optimize_training_config(
                batch_size, image_size, workers, self._hardware
            )

        self._batch_size = batch_size
        self._workers = workers
        self._vram_estimate_mb = estimate_vram_mb(batch_size, image_size)

        script_path = settings.TRAINING_SCRIPT_PATH
        env = os.environ.copy()
        env["TRAIN_DATASET_TYPE"] = training_type
        env["TRAIN_EPOCHS"] = str(epochs)
        env["TRAIN_BATCH_SIZE"] = str(batch_size)
        env["TRAIN_IMAGE_SIZE"] = str(image_size)
        env["TRAIN_WORKERS"] = str(workers)
        if selected_classes:
            env["TRAIN_SELECTED_CLASSES"] = ",".join(selected_classes)

        if self._hardware["device_type"] == "gpu":
            env["TRAINING_DEVICE"] = "0"
        else:
            env["TRAINING_DEVICE"] = "cpu"

        self._process = subprocess.Popen([sys.executable, script_path], env=env)
        self._current_type = training_type
        self._started_at = time_module.time()

    def is_running(self) -> bool:
        if self._process is None:
            return False
        return self._process.poll() is None

    def get_status(self) -> dict:
        if self._process is None:
            return {
                "running": False,
                "status": "idle",
                "progress": 0,
                "training_type": self._current_type,
                "device_type": self._hardware.get("device_type"),
                "gpu_name": self._hardware.get("gpu_name"),
                "gpu_vram_mb": self._hardware.get("gpu_vram_mb", 0),
                "batch_size": self._batch_size,
                "workers": self._workers,
                "vram_estimate_mb": self._vram_estimate_mb,
            }

        progress = 0
        progress_file = settings.PROGRESS_FILE_PATH
        if os.path.exists(progress_file):
            try:
                with open(progress_file, "r") as f:
                    content = f.read().strip()
                    if content:
                        progress = int(content)
            except (ValueError, OSError):
                progress = 0

        poll = self._process.poll()
        result = {
            "progress": max(progress, 0),
            "training_type": self._current_type,
            "device_type": self._hardware.get("device_type"),
            "gpu_name": self._hardware.get("gpu_name"),
            "gpu_vram_mb": self._hardware.get("gpu_vram_mb", 0),
            "batch_size": self._batch_size,
            "workers": self._workers,
            "vram_estimate_mb": self._vram_estimate_mb,
        }

        gpu_status = {"gpu_util": 0, "gpu_mem_used": 0, "gpu_mem_total": 0, "gpu_temperature": 0}
        if os.path.exists(GPU_STATUS_FILE):
            try:
                with open(GPU_STATUS_FILE, "r") as f:
                    gpu_status = json.load(f)
            except (json.JSONDecodeError, OSError):
                pass
        result.update(gpu_status)

        if poll is None:
            result.update({"running": True, "status": "training"})
        elif poll == 0:
            result.update({"running": False, "status": "completed", "progress": 100})
        else:
            result.update({"running": False, "status": f"failed (code {poll})"})

        return result

    def get_current_type(self) -> str:
        return self._current_type

    def get_hardware_info(self) -> dict:
        return self._hardware

    def preview_optimize(self, batch_size: int, image_size: int, workers: int, optimize: bool) -> dict:
        hw = detect_hardware()
        if optimize:
            opt_bs, opt_imgsz, opt_w = optimize_training_config(batch_size, image_size, workers, hw)
        else:
            opt_bs, opt_imgsz, opt_w = batch_size, image_size, workers

        vram_est = estimate_vram_mb(opt_bs, opt_imgsz)
        gpu_vram = hw.get("gpu_vram_mb", 0)
        vram_pct = round((vram_est / gpu_vram) * 100) if gpu_vram > 0 else 0

        return {
            "device_type": hw["device_type"],
            "gpu_name": hw["gpu_name"],
            "gpu_vram_mb": gpu_vram,
            "optimized_batch_size": opt_bs,
            "optimized_workers": opt_w,
            "vram_estimate_mb": vram_est,
            "vram_percent": vram_pct,
            "speed_factor": round(opt_bs / max(batch_size, 1), 1),
        }
