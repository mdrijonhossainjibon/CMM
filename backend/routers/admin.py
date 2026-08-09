import os
import shutil
import platform
import subprocess
from fastapi import APIRouter, Depends

from backend.core.security import get_current_user, USERS_DB
from backend.core.config import settings

router = APIRouter(prefix="/api/admin", tags=["Admin"])


def _get_dir_size(path: str) -> int:
    total = 0
    if not os.path.exists(path):
        return 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


@router.get("/users")
async def list_users(current_user: dict = Depends(get_current_user)):
    users = [
        {"username": u["username"], "role": u["role"]}
        for u in USERS_DB.values()
    ]
    return {"success": True, "users": users}


@router.get("/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    models_count = 0
    for search_dir in ["backend/model", ".", "runs"]:
        if os.path.exists(search_dir):
            for root, _dirs, files in os.walk(search_dir):
                if any(x in root for x in ["venv", ".git", "__pycache__"]):
                    continue
                models_count += sum(1 for f in files if f.endswith(".pt"))

    datasets_count = 0
    train_dir = os.path.join(settings.DATASET_DIR, "train", "images")
    val_dir = os.path.join(settings.DATASET_DIR, "val", "images")
    if os.path.exists(train_dir):
        datasets_count += len([
            f for f in os.listdir(train_dir)
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
        ])
    if os.path.exists(val_dir):
        datasets_count += len([
            f for f in os.listdir(val_dir)
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
        ])

    return {
        "success": True,
        "total_users": len(USERS_DB),
        "total_models": models_count,
        "total_datasets": datasets_count,
        "total_detections": 0,
        "version": settings.APP_VERSION,
        "uptime": platform.node(),
    }


def _get_gpu_stats_nvidia_smi():
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True, text=True, timeout=3,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return None
        parts = [p.strip() for p in result.stdout.strip().split(",")]
        if len(parts) >= 5:
            return {
                "type": "gpu",
                "name": parts[0],
                "utilization": int(parts[1]),
                "memory_used": int(parts[2]),
                "memory_total": int(parts[3]),
                "temperature": int(parts[4]),
            }
    except (FileNotFoundError, subprocess.TimeoutExpired, ValueError, IndexError, OSError):
        pass
    return None


def _get_gpu_stats_torch():
    try:
        import torch
        if torch.cuda.is_available():
            return {
                "type": "gpu",
                "name": torch.cuda.get_device_name(0),
                "memory_used": torch.cuda.memory_allocated(0) // (1024 * 1024),
                "memory_total": max(
                    torch.cuda.get_device_properties(0).total_mem // (1024 * 1024), 1
                ),
                "utilization": 0,
                "temperature": 0,
            }
    except ImportError:
        pass
    return None


def _get_cpu_stats():
    cpu_name = platform.processor() or "CPU"
    cpu_util = 0
    mem_total = 1
    mem_used = 0

    try:
        import psutil
        cpu_util = round(psutil.cpu_percent(interval=0.1))
        mem = psutil.virtual_memory()
        mem_total = mem.total // (1024 * 1024)
        mem_used = mem.used // (1024 * 1024)
    except (ImportError, OSError):
        pass

    return {
        "type": "cpu",
        "name": cpu_name,
        "memory_used": mem_used,
        "memory_total": max(mem_total, 1),
        "utilization": cpu_util,
        "temperature": 0,
    }


@router.get("/gpu")
async def get_gpu_status(current_user: dict = Depends(get_current_user)):
    gpu_stats = _get_gpu_stats_nvidia_smi()
    if gpu_stats:
        return {**gpu_stats, "success": True}

    gpu_stats = _get_gpu_stats_torch()
    if gpu_stats:
        return {**gpu_stats, "success": True}

    cpu_stats = _get_cpu_stats()
    return {**cpu_stats, "success": True}


@router.get("/storage")
async def get_storage_status(current_user: dict = Depends(get_current_user)):
    total, used, free = shutil.disk_usage(".")

    training_size = _get_dir_size(settings.TRAINING_DATA_DIR)
    models_size = _get_dir_size("backend/model") + _get_dir_size("runs")

    return {
        "success": True,
        "total_space": max(total, 1),
        "used_space": used,
        "free_space": free,
        "training_data_size": training_size,
        "models_size": models_size,
    }
