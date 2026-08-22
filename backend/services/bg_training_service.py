"""BG (background) classifier training service.

Spawns train_bg.py as a subprocess, tracks progress via a progress file.
"""
import os
import json
import time as time_module
from typing import Optional

from backend.core.config import settings


class BgTrainingService:
    def __init__(self):
        self._process: Optional[object] = None
        self._started_at: Optional[float] = None

    def start_training(
        self,
        epochs: int = 25,
        batch_size: int = 32,
        image_size: int = 224,
        workers: int = 4,
    ) -> None:
        env = os.environ.copy()
        env["BG_TRAIN_EPOCHS"] = str(epochs)
        env["BG_TRAIN_BATCH_SIZE"] = str(batch_size)
        env["BG_TRAIN_IMAGE_SIZE"] = str(image_size)
        env["BG_TRAIN_WORKERS"] = str(workers)
        env["BG_TRAIN_PROGRESS_FILE"] = settings.BG_PROGRESS_FILE_PATH
        env["BG_TRAIN_DATASET"] = settings.BG_DATASET_DIR

        import torch
        env["BG_TRAIN_DEVICE"] = "cuda" if torch.cuda.is_available() else "cpu"

        import subprocess
        import sys
        self._process = subprocess.Popen(
            [sys.executable, settings.BG_TRAIN_SCRIPT_PATH], env=env
        )
        self._started_at = time_module.time()

    def is_running(self) -> bool:
        return self._process is not None and self._process.poll() is None

    def get_status(self) -> dict:
        progress = 0
        progress_file = settings.BG_PROGRESS_FILE_PATH
        if os.path.exists(progress_file):
            try:
                with open(progress_file, "r") as f:
                    content = f.read().strip()
                    if content:
                        progress = int(content)
            except (ValueError, OSError):
                progress = 0

        result: dict = {"progress": max(progress, 0)}

        if self._process is None:
            result.update({"running": False, "status": "idle"})
        else:
            poll = self._process.poll()
            elapsed = time_module.time() - self._started_at if self._started_at else 0.0
            if poll is None:
                result.update({
                    "running": True,
                    "status": "training",
                    "elapsed_seconds": round(elapsed, 1),
                })
            elif poll == 0:
                result.update({"running": False, "status": "completed", "progress": 100})
            else:
                result.update({"running": False, "status": f"failed (code {poll})"})

        return result


# module-level singleton
bg_training_service = BgTrainingService()
