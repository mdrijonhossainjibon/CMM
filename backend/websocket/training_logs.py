import asyncio
import os
from fastapi import WebSocket
from backend.core.config import settings


class TrainingLogManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self._log_task: asyncio.Task | None = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        if self._log_task is None:
            self._log_task = asyncio.create_task(self._broadcast_logs())

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if not self.active_connections and self._log_task:
            self._log_task.cancel()
            self._log_task = None

    async def broadcast(self, message: str):
        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                dead.append(connection)
        for conn in dead:
            self.active_connections.remove(conn)

    async def _broadcast_logs(self):
        last_size = {}
        while self.active_connections:
            try:
                log_files = []
                runs_dir = "runs"
                if os.path.exists(runs_dir):
                    for root, _dirs, files in os.walk(runs_dir):
                        for f in files:
                            if f == "results.csv" or f.endswith(".log") or f.endswith(".txt"):
                                log_files.append(os.path.join(root, f))

                for log_file in sorted(log_files, key=os.path.getmtime, reverse=True)[:5]:
                    if os.path.exists(log_file):
                        try:
                            current_size = os.path.getsize(log_file)
                            prev_size = last_size.get(log_file, 0)
                            if current_size > prev_size:
                                with open(log_file, "r") as f:
                                    f.seek(prev_size)
                                    new_lines = f.readlines()
                                    for line in new_lines:
                                        await self.broadcast(line.strip())
                                last_size[log_file] = current_size
                        except Exception:
                            pass

                # Check progress file
                progress_file = settings.PROGRESS_FILE_PATH
                if os.path.exists(progress_file):
                    try:
                        with open(progress_file, "r") as f:
                            content = f.read().strip()
                            if content:
                                await self.broadcast(f"PROGRESS:{content}")
                    except Exception:
                        pass

                await asyncio.sleep(2)
            except Exception:
                await asyncio.sleep(5)


manager = TrainingLogManager()
