import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from backend.core.config import settings

router = APIRouter(prefix="/api/logs", tags=["Logs"])


@router.get("")
async def get_logs():
    logs_dir = settings.LOGS_DIR
    if not os.path.exists(logs_dir):
        return JSONResponse({"logs": [], "count": 0})
    log_files = sorted(
        [
            f
            for f in os.listdir(logs_dir)
            if f.endswith(".txt") or f.endswith(".log") or f.endswith(".csv")
        ],
        reverse=True,
    )
    return JSONResponse({"logs": log_files, "count": len(log_files)})


@router.get("/read")
async def read_log_file(file: str):
    logs_dir = settings.LOGS_DIR
    filepath = os.path.join(logs_dir, file)
    if not os.path.exists(filepath) or not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Log file not found")
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        return JSONResponse(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read log: {str(e)}")
