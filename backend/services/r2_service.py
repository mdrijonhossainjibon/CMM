import os
import asyncio
import logging
from pathlib import Path
from typing import Optional
from contextlib import contextmanager

from backend.core.config import settings

logger = logging.getLogger("captchamaster.r2")


class R2Service:
    def __init__(self):
        self._client = None
        self._config_cache: dict | None = None
        self._config_loaded = False

    async def _load_config(self) -> dict:
        if self._config_loaded:
            return self._config_cache or {}

        try:
            from backend.services.settings_service import SettingsService
            svc = SettingsService()
            self._config_cache = await svc.get_r2_config()
            secret = await svc.get_r2_secret_key()
            self._config_cache["r2_secret_access_key"] = secret
            self._config_loaded = True
            return self._config_cache
        except Exception as e:
            logger.warning("Failed to load R2 config from DB, using env fallback: %s", e)
            self._config_cache = {
                "r2_enabled": settings.R2_ENABLED,
                "r2_endpoint_url": settings.R2_ENDPOINT_URL,
                "r2_access_key_id": settings.R2_ACCESS_KEY_ID,
                "r2_secret_access_key": settings.R2_SECRET_ACCESS_KEY,
                "r2_bucket_name": settings.R2_BUCKET_NAME,
                "r2_region": settings.R2_REGION,
            }
            self._config_loaded = True
            return self._config_cache

    def reload_config(self):
        self._config_loaded = False
        self._config_cache = None
        self._client = None

    @property
    def enabled(self) -> bool:
        return True

    async def _is_configured(self) -> bool:
        cfg = await self._load_config()
        return bool(
            cfg.get("r2_enabled")
            and cfg.get("r2_endpoint_url")
            and cfg.get("r2_access_key_id")
            and cfg.get("r2_secret_access_key")
        )

    async def _get_client(self):
        if self._client is not None:
            return self._client

        cfg = await self._load_config()
        if not cfg.get("r2_enabled") or not cfg.get("r2_endpoint_url"):
            raise RuntimeError("R2 is not configured")

        import boto3
        from botocore.config import Config as BotoConfig

        boto_config = BotoConfig(
            region_name=cfg.get("r2_region", "auto"),
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"},
        )
        self._client = boto3.client(
            "s3",
            endpoint_url=cfg["r2_endpoint_url"],
            aws_access_key_id=cfg["r2_access_key_id"],
            aws_secret_access_key=cfg["r2_secret_access_key"],
            config=boto_config,
        )
        await self._ensure_bucket()
        return self._client

    async def _ensure_bucket(self):
        from botocore.exceptions import ClientError

        cfg = await self._load_config()
        bucket = cfg.get("r2_bucket_name", "captchamaster")
        try:
            self._client.head_bucket(Bucket=bucket)
            logger.info("R2 bucket '%s' verified", bucket)
        except ClientError as e:
            code = e.response["Error"]["Code"]
            if code == "404":
                self._client.create_bucket(Bucket=bucket)
                logger.info("R2 bucket '%s' created", bucket)
            else:
                logger.error("R2 bucket check failed: %s", e)

    async def _get_bucket(self) -> str:
        cfg = await self._load_config()
        return cfg.get("r2_bucket_name", "captchamaster")

    async def _run_sync(self, func, *args, **kwargs):
        return await asyncio.to_thread(func, *args, **kwargs)

    async def upload_file(self, local_path: str, r2_key: str, content_type: str = None) -> bool:
        if not await self._is_configured():
            logger.debug("R2 not configured — skipping upload: %s", r2_key)
            return False

        try:
            client = await self._get_client()
            bucket = await self._get_bucket()
            extra_args = {}
            if content_type:
                extra_args["ContentType"] = content_type

            await self._run_sync(
                client.upload_file,
                local_path,
                bucket,
                r2_key,
                ExtraArgs=extra_args,
            )
            logger.info("R2 upload: %s -> %s", local_path, r2_key)
            return True
        except Exception as e:
            logger.error("R2 upload failed [%s]: %s", r2_key, e)
            return False

    async def download_file(self, r2_key: str, local_path: str) -> bool:
        if not await self._is_configured():
            logger.debug("R2 not configured — skipping download: %s", r2_key)
            return False

        try:
            client = await self._get_client()
            bucket = await self._get_bucket()
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            await self._run_sync(
                client.download_file,
                bucket,
                r2_key,
                local_path,
            )
            logger.info("R2 download: %s -> %s", r2_key, local_path)
            return True
        except Exception as e:
            try:
                from botocore.exceptions import ClientError
                if isinstance(e, ClientError):
                    if e.response["Error"]["Code"] == "404":
                        logger.warning("R2 key not found: %s", r2_key)
                        return False
            except ImportError:
                pass
            logger.error("R2 download failed [%s]: %s", r2_key, e)
            return False

    async def list_objects(self, prefix: str = "") -> list[dict]:
        if not await self._is_configured():
            return []

        try:
            client = await self._get_client()
            bucket = await self._get_bucket()
            response = await self._run_sync(
                client.list_objects_v2,
                Bucket=bucket,
                Prefix=prefix,
            )
            objects = []
            for obj in response.get("Contents", []):
                objects.append({
                    "key": obj["Key"],
                    "size": obj["Size"],
                    "last_modified": obj["LastModified"].isoformat(),
                })
            return objects
        except Exception as e:
            logger.error("R2 list failed [prefix=%s]: %s", prefix, e)
            return []

    async def delete_object(self, r2_key: str) -> bool:
        if not await self._is_configured():
            return False

        try:
            client = await self._get_client()
            bucket = await self._get_bucket()
            await self._run_sync(
                client.delete_object,
                Bucket=bucket,
                Key=r2_key,
            )
            logger.info("R2 delete: %s", r2_key)
            return True
        except Exception as e:
            logger.error("R2 delete failed [%s]: %s", r2_key, e)
            return False

    async def delete_prefix(self, prefix: str) -> int:
        if not await self._is_configured():
            return 0

        try:
            objects = await self.list_objects(prefix)
            if not objects:
                return 0

            client = await self._get_client()
            bucket = await self._get_bucket()
            delete_keys = {"Objects": [{"Key": o["key"]} for o in objects]}
            await self._run_sync(
                client.delete_objects,
                Bucket=bucket,
                Delete=delete_keys,
            )
            logger.info("R2 deleted %d objects under prefix '%s'", len(objects), prefix)
            return len(objects)
        except Exception as e:
            logger.error("R2 batch delete failed [prefix=%s]: %s", prefix, e)
            return 0

    async def upload_directory(self, local_dir: str, r2_prefix: str) -> dict:
        if not await self._is_configured():
            return {"success": False, "uploaded": 0, "failed": 0, "reason": "R2 disabled"}

        uploaded = 0
        failed = 0
        files = []
        for root, _, filenames in os.walk(local_dir):
            for fname in filenames:
                local_path = os.path.join(root, fname)
                rel = os.path.relpath(local_path, local_dir).replace("\\", "/")
                r2_key = f"{r2_prefix}/{rel}" if r2_prefix else rel
                files.append((local_path, r2_key))

        for local_path, r2_key in files:
            content_type = _guess_content_type(local_path)
            ok = await self.upload_file(local_path, r2_key, content_type)
            if ok:
                uploaded += 1
            else:
                failed += 1

        return {"success": failed == 0, "uploaded": uploaded, "failed": failed}

    async def sync_directory(self, local_dir: str, r2_prefix: str) -> dict:
        """True mirror sync: upload local files, delete R2 objects that no longer exist locally."""
        if not await self._is_configured():
            return {"success": False, "uploaded": 0, "deleted": 0, "reason": "R2 disabled"}

        # 1) Collect local files -> r2_key map
        local_files = {}
        if os.path.exists(local_dir):
            for root, _, filenames in os.walk(local_dir):
                for fname in filenames:
                    local_path = os.path.join(root, fname)
                    rel = os.path.relpath(local_path, local_dir).replace("\\", "/")
                    r2_key = f"{r2_prefix}/{rel}" if r2_prefix else rel
                    local_files[r2_key] = local_path

        # 2) Upload/refresh local files
        uploaded = 0
        failed = 0
        for r2_key, local_path in local_files.items():
            content_type = _guess_content_type(local_path)
            ok = await self.upload_file(local_path, r2_key, content_type)
            if ok:
                uploaded += 1
            else:
                failed += 1

        # 3) Delete R2 objects that don't exist locally (stale data)
        deleted = 0
        try:
            objects = await self.list_objects(r2_prefix)
            remote_keys = {o["key"] for o in objects}
            stale = [k for k in remote_keys if k not in local_files]
            for batch_start in range(0, len(stale), 1000):
                batch = stale[batch_start : batch_start + 1000]
                client = await self._get_client()
                bucket = await self._get_bucket()
                await self._run_sync(
                    client.delete_objects,
                    Bucket=bucket,
                    Delete={"Objects": [{"Key": k} for k in batch]},
                )
                deleted += len(batch)
            if stale:
                logger.info("R2 sync deleted %d stale object(s) under '%s'", len(stale), r2_prefix)
        except Exception as e:
            logger.warning("R2 sync stale-cleanup failed: %s", e)

        return {
            "success": failed == 0,
            "uploaded": uploaded,
            "failed": failed,
            "deleted": deleted,
        }

    async def download_directory(self, r2_prefix: str, local_dir: str) -> dict:
        if not await self._is_configured():
            return {"success": False, "downloaded": 0, "failed": 0, "reason": "R2 disabled"}

        objects = await self.list_objects(r2_prefix)
        if not objects:
            return {"success": False, "downloaded": 0, "failed": 0, "reason": "No objects found"}

        downloaded = 0
        failed = 0
        for obj in objects:
            r2_key = obj["key"]
            rel = r2_key[len(r2_prefix):].lstrip("/")
            if not rel:
                continue
            local_path = os.path.join(local_dir, rel)
            ok = await self.download_file(r2_key, local_path)
            if ok:
                downloaded += 1
            else:
                failed += 1

        return {"success": failed == 0, "downloaded": downloaded, "failed": failed}


def _guess_content_type(path: str) -> str | None:
    ext = os.path.splitext(path)[1].lower()
    mime_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".heic": "image/heic",
        ".heif": "image/heif",
        ".pt": "application/octet-stream",
        ".onnx": "application/octet-stream",
        ".yaml": "application/x-yaml",
        ".json": "application/json",
        ".txt": "text/plain",
    }
    return mime_map.get(ext)


r2_service = R2Service()
