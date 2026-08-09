import os
import json
import subprocess
import sys
import time as time_module
from typing import Optional
from backend.core.config import settings

GPU_STATUS_FILE = "runs/gpu_status.json"


def detect_hardware():
    info = {"device_type": "cpu", "gpu_name": None}
    try:
        import torch
        if torch.cuda.is_available():
            info["device_type"] = "gpu"
            info["gpu_name"] = torch.cuda.get_device_name(0)
    except ImportError:
        pass
    return info


def optimize_training_config(batch_size: int, image_size: int, workers: int, hardware: dict) -> tuple:
    """Auto-tune training parameters based on available hardware."""
    if hardware["device_type"] == "gpu":
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
        self._hardware: dict = {"device_type": "cpu", "gpu_name": None}
        self._batch_size: Optional[int] = None
        self._workers: Optional[int] = None

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
                "batch_size": self._batch_size,
                "workers": self._workers,
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
            "batch_size": self._batch_size,
            "workers": self._workers,
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
