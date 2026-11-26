from __future__ import annotations

from fastapi import FastAPI

from campusfix_ai.api.routes import register_error_handlers
from campusfix_ai.api.routes import router as triage_router
from campusfix_ai.application.triage_service import TriageService
from campusfix_ai.config import Settings
from campusfix_ai.providers.base import TriageProvider
from campusfix_ai.providers.gemini import GeminiTriageProvider


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
    app = FastAPI(
        title="CampusFix Pluggable AI Triage Gateway",
        version="1.0.0",
        docs_url="/docs" if settings.enable_docs else None,
        redoc_url="/redoc" if settings.enable_docs else None,
        openapi_url="/openapi.json" if settings.enable_docs else None,
    )
    app.state.settings = settings
    app.state.triage_service = TriageService(
        provider if provider is not None else _build_default_provider(settings)
    )

    register_error_handlers(app)
    app.include_router(triage_router)

    @app.get("/healthz")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
