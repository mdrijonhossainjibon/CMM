from datetime import datetime, timezone
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorCollection

from backend.db.connection import get_db

SETTINGS_DOC_ID = "app_config"


class SettingsService:
    def __init__(self):
        self._collection: Optional[AsyncIOMotorCollection] = None

    def _get_collection(self):
        if self._collection is None:
            self._collection = get_db()["app_settings"]
        return self._collection

    async def _get_doc(self) -> Optional[dict]:
        return await self._get_collection().find_one({"_id": SETTINGS_DOC_ID})

    async def get_all(self) -> dict:
        doc = await self._get_doc()
        if not doc:
            return {
                "r2_enabled": False,
                "r2_endpoint_url": "",
                "r2_access_key_id": "",
                "r2_bucket_name": "captchamaster",
                "r2_region": "auto",
            }
        return {
            "r2_enabled": doc.get("r2_enabled", False),
            "r2_endpoint_url": doc.get("r2_endpoint_url", ""),
            "r2_access_key_id": doc.get("r2_access_key_id", ""),
            "r2_bucket_name": doc.get("r2_bucket_name", "captchamaster"),
            "r2_region": doc.get("r2_region", "auto"),
        }

    async def get_r2_config(self) -> dict:
        return await self.get_all()

    async def save_r2_config(
        self,
        *,
        r2_enabled: bool = False,
        r2_endpoint_url: str = "",
        r2_access_key_id: str = "",
        r2_secret_access_key: str = "",
        r2_bucket_name: str = "captchamaster",
        r2_region: str = "auto",
    ) -> dict:
        update = {
            "r2_enabled": r2_enabled,
            "r2_endpoint_url": r2_endpoint_url.strip(),
            "r2_access_key_id": r2_access_key_id.strip(),
            "r2_bucket_name": r2_bucket_name.strip() or "captchamaster",
            "r2_region": r2_region.strip() or "auto",
            "updated_at": datetime.now(timezone.utc),
        }
        if r2_secret_access_key.strip():
            update["r2_secret_access_key"] = r2_secret_access_key.strip()

        await self._get_collection().update_one(
            {"_id": SETTINGS_DOC_ID},
            {"$set": update},
            upsert=True,
        )
        config = await self.get_all()
        config.pop("r2_secret_access_key", None)
        return config

    async def get_r2_secret_key(self) -> str:
        doc = await self._get_doc()
        if not doc:
            return ""
        return doc.get("r2_secret_access_key", "")

    async def is_r2_configured(self) -> bool:
        doc = await self._get_doc()
        if not doc:
            return False
        return bool(
            doc.get("r2_enabled")
            and doc.get("r2_endpoint_url")
            and doc.get("r2_access_key_id")
            and doc.get("r2_secret_access_key")
        )

    async def mark_r2_tested(self) -> None:
        await self._get_collection().update_one(
            {"_id": SETTINGS_DOC_ID},
            {"$set": {"r2_last_tested_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
