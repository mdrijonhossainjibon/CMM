from datetime import datetime, timezone
from typing import Optional
from backend.db.connection import get_db
from backend.db.models import create_user_document, user_to_response, UserRole


class UserService:
    def __init__(self):
        self._collection = get_db()["users"]

    async def create_indexes(self):
        await self._collection.create_index("username", unique=True)
        await self._collection.create_index("google_id", unique=True, sparse=True)
        await self._collection.create_index("email", unique=True, sparse=True)

    async def find_by_username(self, username: str) -> Optional[dict]:
        return await self._collection.find_one({"username": username})

    async def find_by_google_id(self, google_id: str) -> Optional[dict]:
        return await self._collection.find_one({"google_id": google_id})

    async def find_by_email(self, email: str) -> Optional[dict]:
        return await self._collection.find_one({"email": email})

    async def create_user(
        self,
        username: str,
        hashed_password: str,
        role: UserRole = "user",
        google_id: str | None = None,
        email: str | None = None,
    ) -> dict:
        doc = create_user_document(username, hashed_password, role, google_id, email)
        await self._collection.insert_one(doc)
        return user_to_response(doc)

    async def link_google_account(self, username: str, google_id: str, email: str) -> Optional[dict]:
        result = await self._collection.find_one_and_update(
            {"username": username},
            {
                "$set": {
                    "google_id": google_id,
                    "email": email,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
            return_document=True,
        )
        return result

    async def authenticate(self, username: str, password_verify_fn) -> Optional[dict]:
        user = await self.find_by_username(username)
        if not user:
            return None
        if not password_verify_fn(password_verify_fn, user):
            return None
        return {"username": user["username"], "role": user["role"]}

    async def list_users(self) -> list[dict]:
        cursor = self._collection.find({}).sort("created_at", -1)
        users = []
        async for doc in cursor:
            users.append(user_to_response(doc))
        return users

    async def delete_user(self, username: str) -> bool:
        result = await self._collection.delete_one({"username": username})
        return result.deleted_count > 0

    async def change_password(self, username: str, new_hashed_password: str) -> bool:
        result = await self._collection.update_one(
            {"username": username},
            {"$set": {"password": new_hashed_password}},
        )
        return result.modified_count > 0

    async def ensure_super_admin(self, username: str, hashed_password: str):
        existing = await self.find_by_username(username)
        if existing:
            await self._collection.update_one(
                {"username": username},
                {"$set": {"password": hashed_password}},
            )
        else:
            await self.create_user(username, hashed_password, "super_admin")
