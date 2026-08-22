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
                "r2_api_key": "",
                "r2_base_url": "",
                "r2_bucket_name": "captchamaster",
            }
        return {
            "r2_enabled": doc.get("r2_enabled", False),
            "r2_api_key": doc.get("r2_api_key", ""),
            "r2_base_url": doc.get("r2_base_url", ""),
            "r2_bucket_name": doc.get("r2_bucket_name", "captchamaster"),
        }

    async def get_r2_config(self) -> dict:
        return await self.get_all()

    async def get_r2_credentials(self) -> dict:
        """Frontend SDK sync er jonno sompurno R2 config (api key sahit)."""
        cfg = await self.get_all()
        cfg["r2_api_key"] = await self.get_r2_secret_key()
        return cfg

    async def save_r2_config(
        self,
        *,
        r2_enabled: bool = False,
        r2_api_key: str = "",
        r2_base_url: str = "",
        r2_bucket_name: str = "captchamaster",
    ) -> dict:
        update = {
            "r2_enabled": r2_enabled,
            "r2_api_key": r2_api_key.strip(),
            "r2_base_url": r2_base_url.strip(),
            "r2_bucket_name": r2_bucket_name.strip() or "captchamaster",
            "updated_at": datetime.now(timezone.utc),
        }

        await self._get_collection().update_one(
            {"_id": SETTINGS_DOC_ID},
            {"$set": update},
            upsert=True,
        )
        config = await self.get_all()
        return config

    async def get_r2_secret_key(self) -> str:
        doc = await self._get_doc()
        if not doc:
            return ""
        return doc.get("r2_api_key", "")

    async def is_r2_configured(self) -> bool:
        doc = await self._get_doc()
        if not doc:
            return False
        return bool(
            doc.get("r2_enabled")
            and doc.get("r2_api_key")
        )
