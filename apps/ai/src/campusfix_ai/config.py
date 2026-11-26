from dataclasses import dataclass
import os


def _parse_bool(raw: str, default: bool) -> bool:
    value = raw.strip().lower()
    if not value:
        return default
    return value in {"1", "true", "yes", "on"}


def _parse_csv(raw: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in raw.split(",") if item.strip())


@dataclass(frozen=True)
class Settings:
    port: int
    provider: str = "gemini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    gemini_embedding_model: str = "gemini-embedding-2"
    gemini_embedding_dimensions: int = 768
    timeout_seconds: float = 20.0
    client_api_keys: tuple[str, ...] = ()
    enable_docs: bool = True

    @classmethod
    def load(cls) -> "Settings":
        try:
            port = int(os.environ.get("AI_PORT", "8000"))
        except ValueError:
            port = 0
        if not 1 <= port <= 65535:
            raise ValueError("AI_PORT must be a valid TCP port")

        try:
            timeout_seconds = float(os.environ.get("AI_TIMEOUT_SECONDS", "20"))
        except ValueError:
            timeout_seconds = 0.0
        if timeout_seconds <= 0:
            raise ValueError("AI_TIMEOUT_SECONDS must be positive")

        try:
            embedding_dimensions = int(os.environ.get("GEMINI_EMBEDDING_DIMENSIONS", "768"))
        except ValueError:
            embedding_dimensions = 0
        if not 1 <= embedding_dimensions <= 3072:
            raise ValueError("GEMINI_EMBEDDING_DIMENSIONS must be between 1 and 3072")

        provider = os.environ.get("AI_PROVIDER", "gemini").strip().lower() or "gemini"
        gemini_api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        gemini_model = (
            os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite").strip()
            or "gemini-3.5-flash-lite"
        )
        gemini_embedding_model = (
            os.environ.get("GEMINI_EMBEDDING_MODEL", "gemini-embedding-2").strip()
            or "gemini-embedding-2"
        )
        client_api_keys = _parse_csv(os.environ.get("AI_CLIENT_API_KEYS", ""))
        enable_docs = _parse_bool(os.environ.get("AI_ENABLE_DOCS", "true"), default=True)

        return cls(
            port=port,
            provider=provider,
            gemini_api_key=gemini_api_key,
            gemini_model=gemini_model,
            gemini_embedding_model=gemini_embedding_model,
            gemini_embedding_dimensions=embedding_dimensions,
            timeout_seconds=timeout_seconds,
            client_api_keys=client_api_keys,
            enable_docs=enable_docs,
        )
