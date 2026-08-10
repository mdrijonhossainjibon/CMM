from fastapi import APIRouter, HTTPException

from backend.services.log_service import log_service

router = APIRouter(prefix="/api/logs", tags=["Logs"])


@router.get("")
async def get_logs():
    sessions = await log_service.list_sessions()
    return {"logs": sessions, "count": len(sessions)}


@router.get("/read")
async def read_log_session(session_id: str = None, file: str = None):
    if session_id:
        session = await log_service.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Log session not found")
        return {
            "id": session["id"],
            "name": session["name"],
            "status": session["status"],
            "progress": session["progress"],
            "content": "\n".join(session["lines"]),
        }

    # Backward-compatible: allow reading raw log files
    if file:
        import os
        from backend.core.config import settings
        filepath = os.path.join(settings.LOGS_DIR, file)
        if not os.path.exists(filepath) or not os.path.isfile(filepath):
            raise HTTPException(status_code=404, detail="Log file not found")
        try:
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                return {"id": file, "name": file, "status": "unknown", "progress": 0, "content": f.read()}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to read log: {str(e)}")

    raise HTTPException(status_code=400, detail="Provide session_id or file")


@router.get("/session/{session_id}")
async def get_session(session_id: str):
    session = await log_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Log session not found")
    return {"success": True, "session": session}


@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    ok = await log_service.delete_session(session_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Log session not found")
    return {"success": True, "deleted": session_id}
