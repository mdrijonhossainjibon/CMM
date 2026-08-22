from pydantic import BaseModel, Field
from typing import List, Optional, Dict


class ScenePrediction(BaseModel):
    label: str
    confidence: float


class ObjectPrediction(BaseModel):
    label: str
    confidence: float
    box: Optional[List[float]] = None
    mask_id: Optional[int] = None


class VisionAnalysis(BaseModel):
    success: bool
    objects: List[ObjectPrediction] = []
    scene: Optional[str] = None
    scene_confidence: float = 0.0
    scene_top: List[ScenePrediction] = []
    masks: List[str] = []
    elapsed_ms: float = 0.0
    error: Optional[str] = None


class TileResult(BaseModel):
    index: int
    row: int
    col: int
    object: Optional[str] = None
    object_confidence: float = 0.0
    scene: Optional[str] = None
    scene_confidence: float = 0.0
    selected: bool = False
    match_reason: Optional[List[str]] = None


class AnalyzeImageRequest(BaseModel):
    """Base64 image (with or without data URI prefix)."""
    image: str
    include_masks: bool = False
    conf_threshold: float = Field(0.5, ge=0.0, le=1.0)


class AnalyzeGridRequest(BaseModel):
    """Single captcha image that will be split into a 3x3 grid of tiles."""
    image: str
    object_classes: List[str] = []
    scene_classes: List[str] = []
    query: Optional[str] = None
    conf_threshold: float = Field(0.5, ge=0.0, le=1.0)


class AnalyzeGridResponse(BaseModel):
    success: bool
    tiles: List[TileResult]
    selected: List[int] = []
    statement: Optional[str] = None
    elapsed_ms: float = 0.0
    error: Optional[str] = None


class SegmentResponse(BaseModel):
    success: bool
    masks: List[str] = []
    count: int = 0
    elapsed_ms: float = 0.0
    error: Optional[str] = None


class VisionModelInfo(BaseModel):
    object_model: str
    scene_model: str
    seg_model: str
    device: str
    scene_classes: List[str]




class BgTrainStartRequest(BaseModel):
    epochs: int = 25
    batch_size: int = 32
    image_size: int = 224
    workers: int = 4


class BgTrainStartResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    error: Optional[str] = None


class BgTrainStatusResponse(BaseModel):
    running: bool
    status: str
    progress: int = 0
    elapsed_seconds: Optional[float] = None
