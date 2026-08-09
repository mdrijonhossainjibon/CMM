from pydantic import BaseModel, Field
from typing import List, Optional


class ImageRequest(BaseModel):
    imageData: List[str]
    conf_threshold: Optional[float] = Field(0.5, ge=0.0, le=1.0)
    question: Optional[str] = None


class DetectionObject(BaseModel):
    label: str
    confidence: float
    box: List[float]


class DetectResponse(BaseModel):
    success: bool
    detected_objects: List[DetectionObject]
    count: int


class BatchDetectResponse(BaseModel):
    success: bool
    results: List[List[DetectionObject]]
    solution: Optional[List[int]] = None


class DetectErrorResponse(BaseModel):
    success: bool = False
    error: str
