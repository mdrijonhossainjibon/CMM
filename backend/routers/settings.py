from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from backend.core.security import get_current_user
from backend.services.settings_service import SettingsService

router = APIRouter(prefix="/api/settings", tags=["Settings"])

_settings_service = SettingsService()


class R2ConfigRequest(BaseModel):
    r2_enabled: bool = False
    r2_endpoint_url: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = "captchamaster"
    r2_region: str = "auto"


class R2TestRequest(BaseModel):
    r2_endpoint_url: str
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_bucket_name: str = "captchamaster"
    r2_region: str = "auto"


@router.get("/r2")
async def get_r2_config(user: dict = Depends(get_current_user)):
    config = await _settings_service.get_r2_config()
    return {"success": True, "config": config}


@router.put("/r2")
async def save_r2_config(
    body: R2ConfigRequest,
    user: dict = Depends(get_current_user),
):
    config = await _settings_service.save_r2_config(
        r2_enabled=body.r2_enabled,
        r2_endpoint_url=body.r2_endpoint_url,
        r2_access_key_id=body.r2_access_key_id,
        r2_secret_access_key=body.r2_secret_access_key,
        r2_bucket_name=body.r2_bucket_name,
        r2_region=body.r2_region,
    )
    return {"success": True, "config": config, "message": "R2 configuration saved"}


@router.post("/r2/test")
async def test_r2_connection(
    body: R2TestRequest,
    user: dict = Depends(get_current_user),
):
    try:
        import boto3
        from botocore.config import Config as BotoConfig
        from botocore.exceptions import ClientError, EndpointConnectionError
    except ImportError:
        raise HTTPException(status_code=500, detail="boto3 is not installed. Run: pip install boto3")

    try:
        client = boto3.client(
            "s3",
            endpoint_url=body.r2_endpoint_url.strip(),
            aws_access_key_id=body.r2_access_key_id.strip(),
            aws_secret_access_key=body.r2_secret_access_key.strip(),
            config=BotoConfig(
                region_name=body.r2_region.strip() or "auto",
                signature_version="s3v4",
                connect_timeout=5,
                read_timeout=10,
                retries={"max_attempts": 1},
            ),
        )

        bucket = body.r2_bucket_name.strip() or "captchamaster"
        try:
            client.head_bucket(Bucket=bucket)
            return {
                "success": True,
                "message": f"Connection successful! Bucket '{bucket}' is accessible.",
            }
        except ClientError as e:
            code = e.response["Error"]["Code"]
            if code == "404":
                client.create_bucket(Bucket=bucket)
                await _settings_service.mark_r2_tested()
                return {
                    "success": True,
                    "message": f"Connection successful! Bucket '{bucket}' created.",
                }
            raise

    except EndpointConnectionError:
        raise HTTPException(
            status_code=400,
            detail="Cannot connect to R2 endpoint. Check the endpoint URL.",
        )
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("InvalidAccessKeyId", "SignatureDoesNotMatch", "AccessDenied"):
            raise HTTPException(
                status_code=400,
                detail="Invalid credentials. Check your Access Key ID and Secret Access Key.",
            )
        raise HTTPException(status_code=400, detail=f"R2 error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Connection test failed: {str(e)}")
