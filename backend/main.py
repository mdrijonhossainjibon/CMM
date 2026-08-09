from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from backend.core.config import settings
from backend.routers import auth, detection, training, models, datasets, logs, exports, websocket, admin
from backend.utils.rate_limit import RateLimitMiddleware

app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)

# Rate limiting middleware
app.add_middleware(RateLimitMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(auth.router)
app.include_router(detection.router)
app.include_router(training.router)
app.include_router(models.router)
app.include_router(datasets.router)
app.include_router(logs.router)
app.include_router(exports.router)
app.include_router(websocket.router)
app.include_router(admin.router)


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    path = request.url.path
    if path.startswith("/api") or path.startswith("/ws"):
        return JSONResponse(
            status_code=404,
            content={
                "success": False,
                "message": "Endpoint not found",
                "code": 404,
            },
        )
    return JSONResponse(
        status_code=404,
        content={
            "success": False,
            "message": "Not found",
            "code": 404,
        },
    )


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc):
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Internal server error",
            "code": 500,
        },
    )


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": settings.APP_VERSION}


if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        workers=1,
    )
