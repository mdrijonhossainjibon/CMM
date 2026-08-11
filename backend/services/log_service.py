from datetime import datetime, timezone
from bson import ObjectId

from backend.db.connection import get_db


def _parse_dt(value):
    """Parse datetime from datetime object or ISO string."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            # Handle '2026-08-11T00:07:17' (no microseconds) and with microseconds
            return datetime.fromisoformat(value)
        except Exception:
            try:
                return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S")
            except Exception:
                return None
    return None


def _duration_seconds(started_at, ended_at) -> int | None:
    start = _parse_dt(started_at)
    end = _parse_dt(ended_at)
    if not start or not end:
        return None
    try:
        # Naive/aware mismatch handle — both to naive UTC
        if start.tzinfo is not None:
            start = start.replace(tzinfo=None)
        if end.tzinfo is not None:
            end = end.replace(tzinfo=None)
        delta = end - start
        return max(int(delta.total_seconds()), 0)
    except Exception:
        return None


class LogService:
    def __init__(self):
        self._collection = None

    def _get_collection(self):
        if self._collection is None:
            self._collection = get_db()["logs"]
        return self._collection

    async def create_session(
        self,
        training_type: str = "auto",
        epochs: int = 0,
        batch_size: int = 0,
        image_size: int = 0,
        workers: int = 0,
        selected_classes: list[str] | None = None,
    ) -> str:
        now = datetime.now(timezone.utc)
        doc = {
            "name": f"{training_type} - {now.strftime('%Y-%m-%d %H:%M')}",
            "training_type": training_type,
            "config": {
                "epochs": epochs,
                "batch_size": batch_size,
                "image_size": image_size,
                "workers": workers,
                "selected_classes": selected_classes or [],
            },
            "status": "running",
            "progress": 0,
            "lines": [],
            "started_at": now,
            "updated_at": now,
            "ended_at": None,
        }
        result = await self._get_collection().insert_one(doc)
        return str(result.inserted_id)

    async def append_lines(self, session_id: str, lines: list[str]) -> None:
        if not lines:
            return
        try:
            oid = ObjectId(session_id)
        except Exception:
            return
        await self._get_collection().update_one(
            {"_id": oid},
            {
                "$push": {"lines": {"$each": lines}},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            },
        )

    async def update_progress(self, session_id: str, progress: int) -> None:
        try:
            oid = ObjectId(session_id)
        except Exception:
            return
        await self._get_collection().update_one(
            {"_id": oid},
            {"$set": {"progress": progress, "updated_at": datetime.now(timezone.utc)}},
        )

    async def complete_session(self, session_id: str, status: str) -> None:
        try:
            oid = ObjectId(session_id)
        except Exception:
            return
        await self._get_collection().update_one(
            {"_id": oid},
            {
                "$set": {
                    "status": status,
                    "progress": 100 if status == "completed" else None,
                    "ended_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )

    async def list_sessions(self, limit: int = 50) -> list[dict]:
        cursor = self._get_collection().find({}).sort("started_at", -1).limit(limit)
        sessions = []
        async for doc in cursor:
            sessions.append({
                "id": str(doc["_id"]),
                "name": doc.get("name", "Training"),
                "training_type": doc.get("training_type", "auto"),
                "status": doc.get("status", "unknown"),
                "progress": doc.get("progress", 0),
                "line_count": len(doc.get("lines", [])),
                "started_at": doc.get("started_at"),
                "ended_at": doc.get("ended_at"),
                "duration_seconds": _duration_seconds(doc.get("started_at"), doc.get("ended_at")),
            })
        return sessions

    async def get_session(self, session_id: str) -> dict | None:
        try:
            oid = ObjectId(session_id)
        except Exception:
            return None
        doc = await self._get_collection().find_one({"_id": oid})
        if not doc:
            return None
        return {
            "id": str(doc["_id"]),
            "name": doc.get("name", "Training"),
            "training_type": doc.get("training_type", "auto"),
            "status": doc.get("status", "unknown"),
            "progress": doc.get("progress", 0),
            "config": doc.get("config", {}),
            "lines": doc.get("lines", []),
            "started_at": doc.get("started_at"),
            "ended_at": doc.get("ended_at"),
            "duration_seconds": _duration_seconds(doc.get("started_at"), doc.get("ended_at")),
        }

    async def delete_session(self, session_id: str) -> bool:
        try:
            oid = ObjectId(session_id)
        except Exception:
            return False
        result = await self._get_collection().delete_one({"_id": oid})
        return result.deleted_count > 0


log_service = LogService()
