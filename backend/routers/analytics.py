from fastapi import APIRouter, Depends

from backend.core.security import get_current_user
from backend.services.detection_log_service import detection_log_service

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


@router.get("")
async def get_analytics(current_user: dict = Depends(get_current_user)):
    stats = await detection_log_service.get_stats()
    history = await detection_log_service.get_history(hours=24)
    classes = await detection_log_service.get_class_distribution()
    recent = await detection_log_service.get_recent(limit=10)
    return {
        "success": True,
        "stats": stats,
        "history": history,
        "class_distribution": classes,
        "recent": recent,
    }
