from fastapi import APIRouter, HTTPException, Depends
from backend.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from backend.core.security import (
    authenticate_user,
    create_access_token,
    get_password_hash,
    get_current_user,
    USERS_DB,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    user = authenticate_user(request.username, request.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token(data={"sub": user["username"], "role": user["role"]})
    return TokenResponse(
        access_token=token,
        username=user["username"],
        role=user["role"],
    )


@router.post("/register", response_model=TokenResponse)
async def register(request: RegisterRequest):
    if request.username in USERS_DB:
        raise HTTPException(status_code=400, detail="Username already exists")
    USERS_DB[request.username] = {
        "username": request.username,
        "password": get_password_hash(request.password),
        "role": "user",
    }
    token = create_access_token(data={"sub": request.username, "role": "user"})
    return TokenResponse(
        access_token=token,
        username=request.username,
        role="user",
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(username=current_user["username"], role=current_user["role"])
