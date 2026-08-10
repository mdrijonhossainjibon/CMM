from datetime import datetime, timezone
from typing import Literal

UserRole = Literal["super_admin", "admin", "user"]


def create_user_document(username: str, hashed_password: str, role: UserRole = "user", google_id: str | None = None, email: str | None = None) -> dict:
    now = datetime.now(timezone.utc)
    doc: dict = {
        "username": username,
        "password": hashed_password,
        "role": role,
        "created_at": now,
        "updated_at": now,
    }
    if google_id:
        doc["google_id"] = google_id
    if email:
        doc["email"] = email
    return doc


def user_to_response(doc: dict) -> dict:
    return {
        "username": doc["username"],
        "role": doc["role"],
        "created_at": doc.get("created_at"),
    }
