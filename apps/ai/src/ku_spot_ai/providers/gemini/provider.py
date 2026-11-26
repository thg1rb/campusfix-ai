from __future__ import annotations

import asyncio
import inspect
import logging
import math
from typing import Any, TypeVar

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel, ValidationError

from ku_spot_ai.api.schemas import ImageInput
from ku_spot_ai.providers.base import (
    EmbeddingProviderResult,
    ProviderNotConfiguredError,
    ProviderTimeoutError,
    ProviderUpstreamError,
    StructuredProviderResult,
)

SchemaT = TypeVar("SchemaT", bound=BaseModel)

logger = logging.getLogger(__name__)


def supports_embed_task_type(model_name: str) -> bool:
    """Return False for gemini-embedding-2* models where Google forbids task_type."""
    normalized = model_name.strip().lower()
    if normalized.startswith("models/"):
        normalized = normalized.removeprefix("models/")
    return not normalized.startswith("gemini-embedding-2")


class GeminiTriageProvider:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        embedding_model: str = "gemini-embedding-2",
        embedding_dimensions: int = 768,
        timeout_seconds: float = 20.0,
        http_options: types.HttpOptions | None = None,
    ) -> None:
        self._api_key = api_key.strip()
        self._model = model.strip()
        self._embedding_model = embedding_model.strip()
        self._embedding_dimensions = embedding_dimensions
        self._timeout_seconds = timeout_seconds
        self._http_options = http_options
        self._client: genai.Client | None = None

    @property
    def name(self) -> str:
        return "gemini"

    @property
    def model(self) -> str:
        return self._model

    @property
    def embedding_model(self) -> str:
        return self._embedding_model

    @property
    def embedding_dimensions(self) -> int:
        return self._embedding_dimensions

    def _get_client(self) -> genai.Client:
        if not self._api_key:
            raise ProviderNotConfiguredError("AI provider is not configured")
        if self._client is None:
            kwargs: dict[str, Any] = {"api_key": self._api_key}
            if self._http_options is not None:
                kwargs["http_options"] = self._http_options
            self._client = genai.Client(**kwargs)
        return self._client

    async def aclose(self) -> None:
        client = self._client
        self._client = None
        if client is None:
            return
        aio_client = getattr(client, "aio", None)
        aclose_fn = getattr(aio_client, "aclose", None)
        if callable(aclose_fn):
            result = aclose_fn()
            if inspect.isawaitable(result):
                await result
        close_fn = getattr(client, "close", None)
        if callable(close_fn):
            close_fn()

    async def generate_structured(
        self,
        *,
        system_instruction: str,
        user_text: str,
        response_schema: type[SchemaT],
        images: list[ImageInput] | None = None,
    ) -> StructuredProviderResult[SchemaT]:
        client = self._get_client()

        contents: list[Any] = [user_text]
        for img in images or []:
            contents.append(
                types.Part.from_bytes(
                    data=img.decode_bytes(),
                    mime_type=img.mime_type,
                )
            )

        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            response_schema=response_schema,
            temperature=0.2,
        )

        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=self._model,
                    contents=contents,
                    config=config,
                ),
                timeout=self._timeout_seconds,
            )
        except TimeoutError as exc:
            logger.warning(
                "Gemini generate_content timed out",
                extra={"model": self._model, "timeout_seconds": self._timeout_seconds},
            )
            raise ProviderTimeoutError("AI provider request timed out") from exc
        except genai_errors.APIError as exc:
            logger.warning(
                "Gemini generate_content API error",
                extra={"model": self._model, "upstream_code": exc.code},
            )
            raise ProviderUpstreamError("AI provider is temporarily unavailable") from exc
        except Exception as exc:
            logger.warning(
                "Gemini generate_content failed",
                extra={"model": self._model, "error_type": type(exc).__name__},
            )
            raise ProviderUpstreamError("AI provider is temporarily unavailable") from exc

        parsed = response.parsed
        if isinstance(parsed, response_schema):
            output = parsed
        elif isinstance(parsed, dict):
            try:
                output = response_schema.model_validate(parsed)
            except ValidationError as exc:
                raise ProviderUpstreamError(
                    "AI provider returned an invalid structured response"
                ) from exc
        else:
            raw_text = (response.text or "").strip()
            if not raw_text:
                raise ProviderUpstreamError("AI provider returned an empty response")
            try:
                output = response_schema.model_validate_json(raw_text)
            except ValidationError as exc:
                raise ProviderUpstreamError(
                    "AI provider returned an invalid structured response"
                ) from exc

        return StructuredProviderResult(
            provider=self.name,
            model=self._model,
            output=output,
        )

    async def embed(
        self,
        *,
        text: str,
        images: list[ImageInput] | None = None,
    ) -> EmbeddingProviderResult:
        client = self._get_client()

        img_list = images or []
        if img_list:
            parts: list[types.Part] = [types.Part.from_text(text=text)]
            for img in img_list:
                parts.append(
                    types.Part.from_bytes(
                        data=img.decode_bytes(),
                        mime_type=img.mime_type,
                    )
                )
            contents: Any = [types.Content(parts=parts)]
        else:
            contents = text

        config_kwargs: dict[str, Any] = {
            "output_dimensionality": self._embedding_dimensions,
        }
        if supports_embed_task_type(self._embedding_model):
            config_kwargs["task_type"] = "SEMANTIC_SIMILARITY"
        config = types.EmbedContentConfig(**config_kwargs)

        try:
            response = await asyncio.wait_for(
                client.aio.models.embed_content(
                    model=self._embedding_model,
                    contents=contents,
                    config=config,
                ),
                timeout=self._timeout_seconds,
            )
        except TimeoutError as exc:
            logger.warning(
                "Gemini embed_content timed out",
                extra={
                    "embedding_model": self._embedding_model,
                    "timeout_seconds": self._timeout_seconds,
                },
            )
            raise ProviderTimeoutError("AI embedding request timed out") from exc
        except genai_errors.APIError as exc:
            logger.warning(
                "Gemini embed_content API error",
                extra={
                    "embedding_model": self._embedding_model,
                    "upstream_code": exc.code,
                },
            )
            raise ProviderUpstreamError(
                "AI embedding provider is temporarily unavailable"
            ) from exc
        except Exception as exc:
            logger.warning(
                "Gemini embed_content failed",
                extra={
                    "embedding_model": self._embedding_model,
                    "error_type": type(exc).__name__,
                },
            )
            raise ProviderUpstreamError(
                "AI embedding provider is temporarily unavailable"
            ) from exc

        embeddings = response.embeddings or []
        if not embeddings or not embeddings[0].values:
            raise ProviderUpstreamError("AI provider returned an empty embedding vector")

        values = [float(v) for v in embeddings[0].values]
        if len(values) != self._embedding_dimensions or not all(
            math.isfinite(v) for v in values
        ):
            raise ProviderUpstreamError("AI provider returned an invalid embedding vector")

        return EmbeddingProviderResult(
            provider=self.name,
            model=self._embedding_model,
            values=values,
        )
