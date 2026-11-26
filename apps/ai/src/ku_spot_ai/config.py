from __future__ import annotations

import math
import os
from dataclasses import dataclass

DEFAULT_MAX_REQUEST_BODY_BYTES = 24 * 1024 * 1024  # 24 MiB


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
    allow_anonymous: bool = False
    max_request_body_bytes: int = DEFAULT_MAX_REQUEST_BODY_BYTES
    enable_docs: bool = True

    def __post_init__(self) -> None:
        if not 1 <= self.port <= 65535:
            raise ValueError("AI_PORT must be a valid TCP port")
        if not math.isfinite(self.timeout_seconds) or self.timeout_seconds <= 0:
            raise ValueError("AI_TIMEOUT_SECONDS must be a positive finite number")
        if not 1 <= self.gemini_embedding_dimensions <= 3072:
            raise ValueError("GEMINI_EMBEDDING_DIMENSIONS must be between 1 and 3072")
        if self.max_request_body_bytes <= 0:
            raise ValueError("AI_MAX_REQUEST_BODY_BYTES must be positive")
        for key in self.client_api_keys:
            if not key or not key.isascii():
                raise ValueError(
                    "AI_CLIENT_API_KEYS entries must be non-empty ASCII strings"
                )
        if self.gemini_api_key and not self.client_api_keys and not self.allow_anonymous:
            raise ValueError(
                "AI_CLIENT_API_KEYS must be set when GEMINI_API_KEY is configured "
                "(or explicitly set AI_ALLOW_ANONYMOUS=true for local development)"
            )

    @classmethod
    def load(cls) -> "Settings":
        try:
            port = int(os.environ.get("AI_PORT", "8000"))
        except ValueError as exc:
            raise ValueError("AI_PORT must be a valid TCP port") from exc

        try:
            timeout_seconds = float(os.environ.get("AI_TIMEOUT_SECONDS", "20"))
        except ValueError as exc:
            raise ValueError("AI_TIMEOUT_SECONDS must be a positive finite number") from exc

        try:
            embedding_dimensions = int(os.environ.get("GEMINI_EMBEDDING_DIMENSIONS", "768"))
        except ValueError as exc:
            raise ValueError("GEMINI_EMBEDDING_DIMENSIONS must be between 1 and 3072") from exc

        try:
            max_request_body_bytes = int(
                os.environ.get(
                    "AI_MAX_REQUEST_BODY_BYTES", str(DEFAULT_MAX_REQUEST_BODY_BYTES)
                )
            )
        except ValueError as exc:
            raise ValueError("AI_MAX_REQUEST_BODY_BYTES must be positive") from exc

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
        allow_anonymous = _parse_bool(
            os.environ.get("AI_ALLOW_ANONYMOUS", "false"), default=False
        )
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
            allow_anonymous=allow_anonymous,
            max_request_body_bytes=max_request_body_bytes,
            enable_docs=enable_docs,
        )
