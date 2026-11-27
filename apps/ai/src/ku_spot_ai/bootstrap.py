from __future__ import annotations

import inspect
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, status
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from ku_spot_ai.api.routes import register_error_handlers
from ku_spot_ai.api.routes import router as triage_router
from ku_spot_ai.api.schemas import ErrorDetail, ErrorResponse, HealthResponse
from ku_spot_ai.application.triage_service import TriageService
from ku_spot_ai.config import Settings
from ku_spot_ai.providers.base import TriageProvider
from ku_spot_ai.providers.gemini import GeminiTriageProvider

API_TITLE = "KU Spot Pluggable AI Triage API"
API_VERSION = "1.3.0"


class MaxBodySizeMiddleware:
    """Enforce a hard byte cap on HTTP request bodies before FastAPI parses JSON."""

    def __init__(self, app: ASGIApp, *, max_body_bytes: int) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def _send_413(self, scope: Scope, receive: Receive, send: Send) -> None:
        body = ErrorResponse(
            error=ErrorDetail(
                code="payload_too_large",
                message=f"Request body exceeds {self.max_body_bytes} byte limit",
            )
        )
        response = JSONResponse(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            content=body.model_dump(exclude_none=True),
        )
        await response(scope, receive, send)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET").upper()
        if method in {"GET", "HEAD", "OPTIONS"}:
            await self.app(scope, receive, send)
            return

        for header_name, header_value in scope.get("headers", ()):
            if header_name.lower() == b"content-length":
                try:
                    declared_length = int(header_value.decode("ascii").strip())
                except UnicodeDecodeError, ValueError:
                    declared_length = -1
                if declared_length > self.max_body_bytes:
                    await self._send_413(scope, receive, send)
                    return

        chunks: list[bytes] = []
        total_bytes = 0
        more_body = True
        while more_body:
            message = await receive()
            msg_type = message.get("type")
            if msg_type == "http.disconnect":
                return
            if msg_type != "http.request":
                continue
            chunk = message.get("body", b"")
            if chunk:
                total_bytes += len(chunk)
                if total_bytes > self.max_body_bytes:
                    await self._send_413(scope, receive, send)
                    return
                chunks.append(chunk)
            more_body = bool(message.get("more_body", False))

        buffered = b"".join(chunks)
        sent_body = False

        async def replay_receive() -> Message:
            nonlocal sent_body
            if not sent_body:
                sent_body = True
                return {
                    "type": "http.request",
                    "body": buffered,
                    "more_body": False,
                }
            return await receive()

        await self.app(scope, replay_receive, send)


def _build_default_provider(settings: Settings) -> TriageProvider:
    if settings.provider == "gemini":
        return GeminiTriageProvider(
            api_key=settings.gemini_api_key,
            model=settings.gemini_model,
            embedding_model=settings.gemini_embedding_model,
            embedding_dimensions=settings.gemini_embedding_dimensions,
            timeout_seconds=settings.timeout_seconds,
        )
    raise ValueError(f"Unsupported AI_PROVIDER: {settings.provider}")


def create_app(
    settings: Settings,
    *,
    provider: TriageProvider | None = None,
) -> FastAPI:
    owned_provider = provider is None
    active_provider: Any = provider if provider is not None else _build_default_provider(settings)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        try:
            yield
        finally:
            if owned_provider:
                aclose_fn = getattr(active_provider, "aclose", None)
                if callable(aclose_fn):
                    result = aclose_fn()
                    if inspect.isawaitable(result):
                        await result

    app = FastAPI(
        title=API_TITLE,
        version=API_VERSION,
        docs_url="/docs" if settings.enable_docs else None,
        redoc_url="/redoc" if settings.enable_docs else None,
        openapi_url="/openapi.json" if settings.enable_docs else None,
        lifespan=lifespan,
    )
    app.add_middleware(
        MaxBodySizeMiddleware,
        max_body_bytes=settings.max_request_body_bytes,
    )
    app.state.settings = settings
    app.state.provider = active_provider
    app.state.triage_service = TriageService(active_provider)

    register_error_handlers(app)
    app.include_router(triage_router)

    @app.get("/healthz", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(status="ok")

    return app
