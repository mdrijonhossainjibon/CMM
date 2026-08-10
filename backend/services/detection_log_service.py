from datetime import datetime, timezone
from bson import ObjectId

from backend.db.connection import get_db


class DetectionLogService:
    def __init__(self):
        self._collection = None

    def _get_collection(self):
        if self._collection is None:
            self._collection = get_db()["detection_logs"]
        return self._collection

    async def log_detection(
        self,
        *,
        image_count: int,
        total_objects: int,
        avg_confidence: float = 0,
        model_type: str = "auto",
        model_name: str = "",
        processing_ms: float = 0,
        batch: bool = False,
        detected_classes: list[str] | None = None,
    ) -> None:
        doc = {
            "image_count": image_count,
            "total_objects": total_objects,
            "avg_confidence": round(avg_confidence, 4),
            "model_type": model_type,
            "model_name": model_name,
            "processing_ms": round(processing_ms, 2),
            "batch": batch,
            "detected_classes": detected_classes or [],
            "created_at": datetime.now(timezone.utc),
        }
        await self._get_collection().insert_one(doc)

    async def get_stats(self) -> dict:
        collection = self._get_collection()

        total_docs = await collection.count_documents({})
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_docs = await collection.count_documents({"created_at": {"$gte": today_start}})

        stats = {
            "total_detections": 0,
            "total_images": 0,
            "total_objects": 0,
            "avg_confidence": 0,
            "avg_processing_ms": 0,
            "models_used": 0,
            "today_detections": today_docs,
        }

        if total_docs == 0:
            return stats

        pipeline_avg = await collection.aggregate([
            {
                "$group": {
                    "_id": None,
                    "total_objects": {"$sum": "$total_objects"},
                    "total_images": {"$sum": "$image_count"},
                    "avg_conf": {"$avg": "$avg_confidence"},
                    "avg_time": {"$avg": "$processing_ms"},
                }
            }
        ]).to_list(length=1)

        models = await collection.distinct("model_type")
        stats["total_detections"] = total_docs
        stats["models_used"] = len(models)

        if pipeline_avg:
            row = pipeline_avg[0]
            stats["total_objects"] = row.get("total_objects", 0)
            stats["total_images"] = row.get("total_images", 0)
            stats["avg_confidence"] = round(row.get("avg_conf", 0) * 100, 1)
            stats["avg_processing_ms"] = round(row.get("avg_time", 0), 1)

        return stats

    async def get_history(self, hours: int = 24) -> list[dict]:
        """Hourly detection counts for the last N hours."""
        from datetime import timedelta

        start = datetime.now(timezone.utc) - timedelta(hours=hours)
        pipeline = [
            {"$match": {"created_at": {"$gte": start}}},
            {
                "$group": {
                    "_id": {
                        "year": {"$year": "$created_at"},
                        "month": {"$month": "$created_at"},
                        "day": {"$dayOfMonth": "$created_at"},
                        "hour": {"$hour": "$created_at"},
                    },
                    "count": {"$sum": 1},
                    "objects": {"$sum": "$total_objects"},
                }
            },
            {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.hour": 1}},
        ]
        rows = await self._get_collection().aggregate(pipeline).to_list(length=None)
        result = []
        for r in rows:
            h = r["_id"]["hour"]
            result.append({
                "label": f"{h:02d}:00",
                "count": r["count"],
                "objects": r["objects"],
            })
        return result

    async def get_class_distribution(self) -> list[dict]:
        pipeline = [
            {"$unwind": "$detected_classes"},
            {"$group": {"_id": "$detected_classes", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 20},
        ]
        rows = await self._get_collection().aggregate(pipeline).to_list(length=None)
        return [{"class": r["_id"], "count": r["count"]} for r in rows]

    async def get_recent(self, limit: int = 10) -> list[dict]:
        cursor = self._get_collection().find({}).sort("created_at", -1).limit(limit)
        result = []
        async for doc in cursor:
            created = doc.get("created_at")
            result.append({
                "id": str(doc["_id"]),
                "type": "Batch Detection" if doc.get("batch") else "Single Detection",
                "images": doc.get("image_count", 1),
                "objects": doc.get("total_objects", 0),
                "confidence": doc.get("avg_confidence", 0),
                "model": doc.get("model_name", "") or doc.get("model_type", "auto"),
                "created_at": created.isoformat() if created else None,
            })
        return result


detection_log_service = DetectionLogService()
