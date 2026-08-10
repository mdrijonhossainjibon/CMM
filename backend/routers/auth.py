from fastapi import APIRouter, HTTPException, Depends
from backend.schemas.auth import (
    LoginRequest,
    GoogleLoginRequest,
    TokenResponse,
    UserResponse,
    AdminCreateUserRequest,
    AdminUserListItem,
    AdminDeleteUserRequest,
)
from backend.core.security import (
    verify_password,
    create_access_token,
    get_password_hash,
    get_current_user,
    require_super_admin,
    require_admin,
)
from backend.core.config import settings
from backend.services.user_service import UserService

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def get_user_service() -> UserService:
    return UserService()


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, user_service: UserService = Depends(get_user_service)):
    user = await user_service.find_by_username(request.username)
    if not user or not verify_password(request.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token(data={"sub": user["username"], "role": user["role"]})
    return TokenResponse(
        access_token=token,
        username=user["username"],
        role=user["role"],
    )


@router.post("/google", response_model=TokenResponse)
async def google_login(body: GoogleLoginRequest, user_service: UserService = Depends(get_user_service)):
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests

    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=400, detail="Google OAuth not configured")

    try:
        id_info = id_token.verify_oauth2_token(
            body.credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google credential")

    google_id = id_info.get("sub")
    email = id_info.get("email")
    name = id_info.get("name", email.split("@")[0] if email else "user")
    picture = id_info.get("picture")

    if not google_id or not email:
        raise HTTPException(status_code=401, detail="Invalid Google account data")

    user = await user_service.find_by_google_id(google_id)
    if user:
        token = create_access_token(data={"sub": user["username"], "role": user["role"]})
        return TokenResponse(access_token=token, username=user["username"], role=user["role"])

    user = await user_service.find_by_email(email)
    if user:
        await user_service.link_google_account(user["username"], google_id, email)
        token = create_access_token(data={"sub": user["username"], "role": user["role"]})
        return TokenResponse(access_token=token, username=user["username"], role=user["role"])

    username = email.split("@")[0]
    base = username
    counter = 1
    while await user_service.find_by_username(username):
        username = f"{base}{counter}"
        counter += 1

    hashed = get_password_hash(f"google_{google_id}")
    admin_count = len(await user_service.list_users())
    role: str = "super_admin" if admin_count == 0 else "user"

    await user_service.create_user(username, hashed, role, google_id=google_id, email=email)
    token = create_access_token(data={"sub": username, "role": role})
    return TokenResponse(access_token=token, username=username, role=role)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(username=current_user["username"], role=current_user["role"])


@router.post("/admin/create", response_model=AdminUserListItem)
async def admin_create_user(
    body: AdminCreateUserRequest,
    user_service: UserService = Depends(get_user_service),
    _current_user: dict = Depends(require_super_admin),
):
    existing = await user_service.find_by_username(body.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    hashed = get_password_hash(body.password)
    role = body.role
    if role not in ("admin",):
        raise HTTPException(status_code=400, detail="Role must be 'admin'")
    await user_service.create_user(body.username, hashed, role)
    return AdminUserListItem(username=body.username, role=role)


@router.get("/admin/users", response_model=list[AdminUserListItem])
async def admin_list_users(
    user_service: UserService = Depends(get_user_service),
    _current_user: dict = Depends(require_super_admin),
):
    users = await user_service.list_users()
    return [AdminUserListItem(username=u["username"], role=u["role"]) for u in users]


@router.delete("/admin/user")
async def admin_delete_user(
    username: str,
    user_service: UserService = Depends(get_user_service),
    current_user: dict = Depends(require_super_admin),
):
    if username == current_user["username"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    deleted = await user_service.delete_user(username)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True, "deleted": username}


@router.post("/admin/change-password")
async def admin_change_password(
    username: str,
    new_password: str,
    user_service: UserService = Depends(get_user_service),
    _current_user: dict = Depends(require_super_admin),
):
    user = await user_service.find_by_username(username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    hashed = get_password_hash(new_password)
    await user_service.change_password(username, hashed)
    return {"success": True, "message": f"Password changed for {username}"}
