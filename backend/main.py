import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from backend.core.config import settings
from backend.core.security import get_password_hash
from backend.db.connection import connect_db, close_db
from backend.services.user_service import UserService
from backend.routers import auth, detection, training, models, datasets, logs, exports, websocket, admin, analytics, vision
from backend.routers import settings as settings_router
from backend.routers import migrate

logger = logging.getLogger("captchamaster")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    logger.info("Connected to MongoDB: %s/%s", settings.MONGODB_URI, settings.MONGODB_DB_NAME)

    user_service = UserService()
    await user_service.create_indexes()
    await user_service.ensure_super_admin(
        settings.SUPER_ADMIN_USERNAME,
        get_password_hash(settings.SUPER_ADMIN_PASSWORD),
    )
    logger.info(
        "Super admin ensured: %s (role: super_admin)",
        settings.SUPER_ADMIN_USERNAME,
    )

    yield

    await close_db()
    logger.info("MongoDB connection closed")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(detection.router)
app.include_router(training.router)
app.include_router(models.router)
app.include_router(datasets.router)
app.include_router(logs.router)
app.include_router(exports.router)
app.include_router(websocket.router)
app.include_router(admin.router)
app.include_router(analytics.router)
app.include_router(settings_router.router)
app.include_router(migrate.router)
app.include_router(vision.router)


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    path = request.url.path
    if path.startswith("/api") or path.startswith("/ws"):
        return JSONResponse(
            status_code=404,
            content={"success": False, "message": "Endpoint not found", "code": 404},
        )
    return JSONResponse(
        status_code=404,
        content={"success": False, "message": "Not found", "code": 404},
    )


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc):
    return JSONResponse(
        status_code=500,
        content={"success": False, "message": "Internal server error", "code": 500},
    )


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": settings.APP_VERSION}


if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        workers=1,
    )
