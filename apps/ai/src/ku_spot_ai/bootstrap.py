from fastapi import FastAPI

from ku_spot_ai.config import Settings


def create_app(settings: Settings) -> FastAPI:
    app = FastAPI(title="KU Spot AI Gateway", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings

    @app.get("/healthz")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
