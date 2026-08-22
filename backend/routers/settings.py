from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from backend.core.security import get_current_user
from backend.services.settings_service import SettingsService

router = APIRouter(prefix="/api/settings", tags=["Settings"])

_settings_service = SettingsService()


class R2ConfigRequest(BaseModel):
    r2_enabled: bool = False
    r2_api_key: str = ""
    r2_base_url: str = ""
    r2_bucket_name: str = "captchamaster"


@router.get("/r2")
async def get_r2_config(user: dict = Depends(get_current_user)):
    config = await _settings_service.get_r2_config()
    return {"success": True, "config": config}


@router.get("/r2/credentials")
async def get_r2_credentials(user: dict = Depends(get_current_user)):
    """Frontend S3 SDK sync er jonno sompurno R2 config (secret sahit)."""
    config = await _settings_service.get_r2_credentials()
    return {"success": True, "config": config}


@router.put("/r2")
async def save_r2_config(
    body: R2ConfigRequest,
    user: dict = Depends(get_current_user),
):
    config = await _settings_service.save_r2_config(
        r2_enabled=body.r2_enabled,
        r2_api_key=body.r2_api_key,
        r2_base_url=body.r2_base_url,
        r2_bucket_name=body.r2_bucket_name,
    )
    return {"success": True, "config": config, "message": "R2 configuration saved"}


@router.post("/r2/test")
async def test_r2_connection(
    body: R2ConfigRequest,
    user: dict = Depends(get_current_user),
):
    # Frontend r2-storage-sdk diye connection test kore. Ekhane sudhu config
    # validate kora hoy (api_key required).
    if not body.r2_api_key.strip():
        raise HTTPException(status_code=400, detail="API key is required")
    return {"success": True, "message": "Config looks valid — test from the app using r2-storage-sdk."}
