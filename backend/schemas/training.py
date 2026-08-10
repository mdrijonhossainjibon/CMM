from pydantic import BaseModel
from typing import Optional, List


class TrainingStartResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    error: Optional[str] = None
    session_id: Optional[str] = None


class TrainingRequest(BaseModel):
    training_type: str = "aws"
    epochs: int = 100
    batch_size: int = 16
    image_size: int = 640
    workers: int = 8
    optimize: bool = True
    selected_classes: Optional[List[str]] = None


class TrainingStatusResponse(BaseModel):
    running: bool
    status: str
    progress: int = 0
    training_type: Optional[str] = None
    device_type: Optional[str] = None
    gpu_name: Optional[str] = None
    batch_size: Optional[int] = None
    workers: Optional[int] = None
    gpu_util: Optional[int] = None
    gpu_mem_used: Optional[int] = None
    gpu_mem_total: Optional[int] = None
    gpu_temperature: Optional[int] = None
