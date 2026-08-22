from pydantic import BaseModel
from typing import Optional, List


class DatasetClassInfo(BaseModel):
    name: str
    images: int


class DatasetMetadata(BaseModel):
    datasetId: str
    totalClasses: int
    totalImages: int
    className: Optional[str] = None
    classes: List[DatasetClassInfo]
    backup: str
    status: str
    created_at: Optional[str] = None


class DatasetTrainingRecord(BaseModel):
    image: str
    label: str


class DatasetSummary(BaseModel):
    datasetId: str
    totalClasses: int
    totalImages: int
    className: Optional[str] = None
    backup: str
    status: str
    created_at: Optional[str] = None
