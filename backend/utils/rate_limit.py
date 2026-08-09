import time
from collections import defaultdict
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


class RateLimiter:
    """Simple in-memory rate limiter."""

    def __init__(self, max_requests: int = 60, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._clients: dict[str, list[float]] = defaultdict(list)

    def _cleanup(self, client_ip: str, now: float) -> None:
        cutoff = now - self.window_seconds
        self._clients[client_ip] = [t for t in self._clients[client_ip] if t > cutoff]
        if not self._clients[client_ip]:
            del self._clients[client_ip]

    def check(self, client_ip: str) -> bool:
        now = time.time()
        self._cleanup(client_ip, now)

        request_count = len(self._clients[client_ip])
        if request_count >= self.max_requests:
            return False

        self._clients[client_ip].append(now)
        return True


rate_limiter = RateLimiter(max_requests=600, window_seconds=60)


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"

        # Skip health check and WebSocket endpoints
        path = request.url.path
        if path == "/api/health" or path.startswith("/ws/"):
            return await call_next(request)

        if not rate_limiter.check(client_ip):
            return JSONResponse(
                status_code=429,
                content={"success": False, "message": "Too many requests"},
            )

        return await call_next(request)
