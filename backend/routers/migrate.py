import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from urllib.parse import urlparse

from backend.db.connection import get_db
from backend.core.security import get_current_user
from backend.core.config import settings

logger = logging.getLogger("captchamaster.migrate")

router = APIRouter(prefix="/api/migrate", tags=["Data Migration"])


class TransferRequest(BaseModel):
    atlas_uri: str
    db_name: str = ""
    collections: list[str] | None = None
    drop_first: bool = False


class TestRequest(BaseModel):
    atlas_uri: str


def _extract_db_name(uri: str, fallback: str) -> str:
    parsed = urlparse(uri.replace("mongodb+srv://", "mongodb://", 1))
    name = (parsed.path or "").lstrip("/")
    if name and "/" not in name:
        return name
    return fallback


async def _local_collections() -> list[str]:
    db = get_db()
    return await db.list_collection_names()


@router.get("/collections")
async def list_collections(current_user: dict = Depends(get_current_user)):
    collections = await _local_collections()
    db = get_db()
    result = []
    for name in sorted(collections):
        count = await db[name].count_documents({})
        result.append({"collection": name, "count": count})
    return {"success": True, "collections": result, "db_name": settings.MONGODB_DB_NAME}


@router.post("/test")
async def test_atlas(body: TestRequest, current_user: dict = Depends(get_current_user)):
    if not body.atlas_uri.startswith("mongodb://") and not body.atlas_uri.startswith("mongodb+srv://"):
        raise HTTPException(status_code=400, detail="Invalid MongoDB URI")
    try:
        import asyncio
        from pymongo import MongoClient
        from pymongo.errors import PyMongoError

        def _ping():
            client = MongoClient(body.atlas_uri, serverSelectionTimeoutMS=8000)
            try:
                client.admin.command("ping")
                return {"ok": True}
            finally:
                client.close()

        result = await asyncio.to_thread(_ping)
        return {"success": True, "message": "Connected to Atlas successfully"}
    except PyMongoError as e:
        raise HTTPException(status_code=400, detail=f"Atlas connection failed: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Test failed: {str(e)}")


@router.post("/transfer")
async def transfer_to_atlas(body: TransferRequest, current_user: dict = Depends(get_current_user)):
    if not body.atlas_uri.startswith("mongodb://") and not body.atlas_uri.startswith("mongodb+srv://"):
        raise HTTPException(status_code=400, detail="Invalid MongoDB URI")

    try:
        import asyncio
        from pymongo import MongoClient

        local_db = get_db()
        target_db_name = body.db_name or _extract_db_name(body.atlas_uri, settings.MONGODB_DB_NAME)

        local_collections = await _local_collections()
        if body.collections:
            local_collections = [c for c in body.collections if c in local_collections]

        if not local_collections:
            raise HTTPException(status_code=400, detail="No collections to transfer")

        summary = []

        def _transfer_collection(client, coll_name):
            coll = local_db[coll_name]
            target = client[target_db_name][coll_name]
            docs = list(coll.find({}))
            if body.drop_first:
                target.delete_many({})
            if docs:
                target.insert_many(docs, ordered=False)
            return {"collection": coll_name, "transferred": len(docs)}

        def _run():
            client = MongoClient(body.atlas_uri, serverSelectionTimeoutMS=10000)
            try:
                return [_transfer_collection(client, c) for c in local_collections]
            finally:
                client.close()

        summary = await asyncio.to_thread(_run)
        return {
            "success": True,
            "message": f"Transferred {len(local_collections)} collection(s) to Atlas",
            "target_db": target_db_name,
            "summary": summary,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transfer failed: {str(e)}")
