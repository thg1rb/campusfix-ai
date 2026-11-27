from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, TypeVar

from pydantic import BaseModel

from ku_spot_ai.api.schemas import ImageInput

SchemaT = TypeVar("SchemaT", bound=BaseModel)


class ProviderError(RuntimeError):
    """Base error for AI provider failures."""

    code: str = "provider_error"


class ProviderNotConfiguredError(ProviderError):
    code = "provider_not_configured"


class ProviderTimeoutError(ProviderError):
    code = "provider_timeout"


class ProviderUpstreamError(ProviderError):
    code = "provider_upstream_error"


@dataclass(frozen=True)
class StructuredProviderResult[T: BaseModel]:
    provider: str
    model: str
    output: T


@dataclass(frozen=True)
class EmbeddingProviderResult:
    provider: str
    model: str
    values: list[float]


class TriageProvider(Protocol):
    @property
    def name(self) -> str: ...

    @property
    def model(self) -> str: ...

    @property
    def embedding_model(self) -> str: ...

    @property
    def embedding_dimensions(self) -> int: ...

    async def generate_structured(
        self,
        *,
        system_instruction: str,
        user_text: str,
        response_schema: type[SchemaT],
        images: list[ImageInput] | None = None,
    ) -> StructuredProviderResult[SchemaT]: ...

    async def embed(
        self,
        *,
        text: str,
        images: list[ImageInput] | None = None,
    ) -> EmbeddingProviderResult: ...
