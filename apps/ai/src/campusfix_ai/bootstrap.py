from fastapi import FastAPI

from campusfix_ai.config import Settings


def create_app(settings: Settings) -> FastAPI:
    app = FastAPI(title="CampusFix AI Gateway", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings

    @app.get("/healthz")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
