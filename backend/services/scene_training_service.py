"""Scene Classifier Training Service.

Mirrors TrainingService pattern: spawns train_scene.py as a subprocess,
tracks progress via a progress file, reports status + GPU stats.
"""
import os
import json
import time as time_module
from typing import Optional
from backend.core.config import settings


class SceneTrainingService:
    def __init__(self):
        self._process: Optional[object] = None
        self._started_at: Optional[float] = None
        self._session_id: Optional[str] = None

    def start_training(
        self,
        epochs: int = 30,
        batch_size: int = 32,
        image_size: int = 224,
        workers: int = 4,
        session_id: Optional[str] = None,
    ) -> None:
        script_path = settings.SCENE_TRAIN_SCRIPT_PATH
        env = os.environ.copy()
        env["SCENE_TRAIN_EPOCHS"] = str(epochs)
        env["SCENE_TRAIN_BATCH_SIZE"] = str(batch_size)
        env["SCENE_TRAIN_IMAGE_SIZE"] = str(image_size)
        env["SCENE_TRAIN_WORKERS"] = str(workers)
        if session_id:
            env["SCENE_TRAIN_SESSION_ID"] = session_id
        env["SCENE_TRAIN_PROGRESS_FILE"] = settings.SCENE_PROGRESS_FILE_PATH
        env["SCENE_TRAIN_DATASET"] = settings.SCENE_DATASET_DIR

        import torch  # local import ok
        if torch.cuda.is_available():
            env["SCENE_TRAIN_DEVICE"] = "cuda"
        else:
            env["SCENE_TRAIN_DEVICE"] = "cpu"

        self._process = os.popen if False else None  # placeholder for typing
        import subprocess, sys
        self._process = subprocess.Popen([sys.executable, script_path], env=env)
        self._started_at = time_module.time()
        self._session_id = session_id

    def is_running(self) -> bool:
        if self._process is None:
            return False
        return self._process.poll() is None

    def get_status(self) -> dict:
        progress = 0
        progress_file = settings.SCENE_PROGRESS_FILE_PATH
        if os.path.exists(progress_file):
            try:
                with open(progress_file, "r") as f:
                    content = f.read().strip()
                    if content:
                        progress = int(content)
            except (ValueError, OSError):
                progress = 0

        result = {
            "progress": max(progress, 0),
            "session_id": self._session_id,
        }

        gpu_status = {"gpu_util": 0, "gpu_mem_used": 0, "gpu_mem_total": 0, "gpu_temperature": 0}
        gpu_file = "runs/gpu_status.json"
        if os.path.exists(gpu_file):
            try:
                with open(gpu_file, "r") as f:
                    gpu_status = json.load(f)
            except (json.JSONDecodeError, OSError):
                pass
        result.update(gpu_status)

        if self._process is None:
            result.update({"running": False, "status": "idle"})
        else:
            poll = self._process.poll()
            if poll is None:
                result.update({"running": True, "status": "training"})
            elif poll == 0:
                result.update({"running": False, "status": "completed", "progress": 100})
            else:
                result.update({"running": False, "status": f"failed (code {poll})"})

        return result

    def get_session_id(self) -> Optional[str]:
        return self._session_id
