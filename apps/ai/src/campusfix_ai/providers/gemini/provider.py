from __future__ import annotations

import asyncio
from typing import Any, TypeVar

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel, ValidationError

from campusfix_ai.api.schemas import ImageInput
from campusfix_ai.providers.base import (
    EmbeddingProviderResult,
    ProviderNotConfiguredError,
    ProviderTimeoutError,
    ProviderUpstreamError,
    StructuredProviderResult,
)

SchemaT = TypeVar("SchemaT", bound=BaseModel)


class GeminiTriageProvider:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        embedding_model: str = "gemini-embedding-2",
        embedding_dimensions: int = 768,
        timeout_seconds: float = 20.0,
    ) -> None:
        self._api_key = api_key.strip()
        self._model = model.strip()
        self._embedding_model = embedding_model.strip()
        self._embedding_dimensions = embedding_dimensions
        self._timeout_seconds = timeout_seconds
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

    def _get_client(self) -> genai.Client:
        if not self._api_key:
            raise ProviderNotConfiguredError(
                "GEMINI_API_KEY is not configured on the AI gateway"
            )
        if self._client is None:
            self._client = genai.Client(api_key=self._api_key)
        return self._client

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
            raise ProviderTimeoutError(
                f"Gemini request timed out after {self._timeout_seconds:.1f}s"
            ) from exc
        except genai_errors.APIError as exc:
            raise ProviderUpstreamError(
                f"Gemini API error ({exc.code}): {exc.message}"
            ) from exc
        except Exception as exc:
            raise ProviderUpstreamError(f"Gemini request failed: {exc}") from exc

        parsed = response.parsed
        if isinstance(parsed, response_schema):
            output = parsed
        elif isinstance(parsed, dict):
            try:
                output = response_schema.model_validate(parsed)
            except ValidationError as exc:
                raise ProviderUpstreamError(
                    "Gemini returned JSON that did not match the expected schema"
                ) from exc
        else:
            raw_text = (response.text or "").strip()
            if not raw_text:
                raise ProviderUpstreamError("Gemini returned an empty response")
            try:
                output = response_schema.model_validate_json(raw_text)
            except ValidationError as exc:
                raise ProviderUpstreamError(
                    "Gemini returned JSON that did not match the expected schema"
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

        config = types.EmbedContentConfig(
            task_type="SEMANTIC_SIMILARITY",
            output_dimensionality=self._embedding_dimensions,
        )

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
            raise ProviderTimeoutError(
                f"Gemini embedding timed out after {self._timeout_seconds:.1f}s"
            ) from exc
        except genai_errors.APIError as exc:
            raise ProviderUpstreamError(
                f"Gemini embedding API error ({exc.code}): {exc.message}"
            ) from exc
        except Exception as exc:
            raise ProviderUpstreamError(f"Gemini embedding failed: {exc}") from exc

        embeddings = response.embeddings or []
        if not embeddings or not embeddings[0].values:
            raise ProviderUpstreamError("Gemini returned an empty embedding vector")

        return EmbeddingProviderResult(
            provider=self.name,
            model=self._embedding_model,
            values=[float(v) for v in embeddings[0].values],
        )
