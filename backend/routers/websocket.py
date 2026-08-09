from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.websocket.training_logs import manager

router = APIRouter()


@router.websocket("/ws/training/logs")
async def training_logs_ws(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
