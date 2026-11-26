from __future__ import annotations

import asyncio
import base64
import json
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from google.genai import types

from ku_spot_ai.api.schemas import ImageInput, ProviderRephraseOutput
from ku_spot_ai.bootstrap import create_app
from ku_spot_ai.config import Settings
from ku_spot_ai.providers.base import ProviderTimeoutError, ProviderUpstreamError
from ku_spot_ai.providers.gemini.provider import (
    GeminiTriageProvider,
    supports_embed_task_type,
)

TINY_PNG_B64 = base64.b64encode(
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\nIDATx\x9cc`\x00\x00\x00"
    b"\x02\x00\x01H\xaf\xa4q\x00\x00\x00\x00IEND\xaeB`\x82"
).decode("ascii")


def _extract_embed_requests(body: dict[str, Any]) -> list[dict[str, Any]]:
    if "requests" in body and isinstance(body["requests"], list):
        return body["requests"]
    return [body]


def test_supports_embed_task_type_model_detection() -> None:
    assert supports_embed_task_type("gemini-embedding-2") is False
    assert supports_embed_task_type("models/gemini-embedding-2") is False
    assert supports_embed_task_type("gemini-embedding-2-exp") is False
    assert supports_embed_task_type("gemini-embedding-001") is True
    assert supports_embed_task_type("text-embedding-004") is True


@pytest.mark.parametrize("with_image", [False, True])
def test_gemini_embedding_2_omits_task_type_on_the_wire(with_image: bool) -> None:
    captured_bodies: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content.decode("utf-8"))
        captured_bodies.append(payload)
        return httpx.Response(
            200,
            json={"embeddings": [{"values": [0.1, 0.2, 0.3, 0.4]}]},
        )

    async def run() -> None:
        async_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        provider = GeminiTriageProvider(
            api_key="test-key",
            model="gemini-3.5-flash-lite",
            embedding_model="gemini-embedding-2",
            embedding_dimensions=4,
            timeout_seconds=5.0,
            http_options=types.HttpOptions(httpx_async_client=async_client),
        )
        try:
            images = (
                [ImageInput(mime_type="image/png", data_base64=TINY_PNG_B64)]
                if with_image
                else None
            )
            result = await provider.embed(text="task: semantic similarity\ntitle: ไฟดับ", images=images)
            assert result.model == "gemini-embedding-2"
            assert result.values == [0.1, 0.2, 0.3, 0.4]
        finally:
            await provider.aclose()

    asyncio.run(run())
    assert len(captured_bodies) == 1
    reqs = _extract_embed_requests(captured_bodies[0])
    assert len(reqs) >= 1
    for item in reqs:
        assert "taskType" not in item
        assert item.get("outputDimensionality") == 4


def test_gemini_embedding_001_sends_semantic_similarity_task_type() -> None:
    captured_bodies: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured_bodies.append(json.loads(request.content.decode("utf-8")))
        return httpx.Response(
            200,
            json={"embeddings": [{"values": [0.5, 0.5, 0.5, 0.5]}]},
        )

    async def run() -> None:
        async_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        provider = GeminiTriageProvider(
            api_key="test-key",
            model="gemini-3.5-flash-lite",
            embedding_model="gemini-embedding-001",
            embedding_dimensions=4,
            timeout_seconds=5.0,
            http_options=types.HttpOptions(httpx_async_client=async_client),
        )
        try:
            await provider.embed(text="ไฟดับ")
        finally:
            await provider.aclose()

    asyncio.run(run())
    reqs = _extract_embed_requests(captured_bodies[0])
    assert any(item.get("taskType") == "SEMANTIC_SIMILARITY" for item in reqs)
    assert any(item.get("outputDimensionality") == 4 for item in reqs)


def test_gemini_adapter_maps_timeouts_upstream_errors_and_malformed_json_without_leaks() -> None:
    async def run_timeout_tests() -> None:
        async def slow_handler(_request: httpx.Request) -> httpx.Response:
            await asyncio.sleep(0.5)
            return httpx.Response(200, json={})

        async_client = httpx.AsyncClient(transport=httpx.MockTransport(slow_handler))
        provider = GeminiTriageProvider(
            api_key="test-key",
            model="gemini-3.5-flash-lite",
            embedding_model="gemini-embedding-2",
            embedding_dimensions=4,
            timeout_seconds=0.05,
            http_options=types.HttpOptions(httpx_async_client=async_client),
        )
        try:
            with pytest.raises(ProviderTimeoutError) as gen_exc:
                await provider.generate_structured(
                    system_instruction="sys",
                    user_text="user",
                    response_schema=ProviderRephraseOutput,
                )
            assert str(gen_exc.value) == "AI provider request timed out"

            with pytest.raises(ProviderTimeoutError) as emb_exc:
                await provider.embed(text="hello")
            assert str(emb_exc.value) == "AI embedding request timed out"
        finally:
            await provider.aclose()

    async def run_error_and_malformed_tests() -> None:
        def error_handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                500,
                json={
                    "error": {
                        "code": 500,
                        "message": "INTERNAL_SECRET_TRACE_XYZ",
                        "status": "INTERNAL",
                    }
                },
            )

        err_client = httpx.AsyncClient(transport=httpx.MockTransport(error_handler))
        err_provider = GeminiTriageProvider(
            api_key="test-key",
            model="gemini-3.5-flash-lite",
            embedding_model="gemini-embedding-2",
            embedding_dimensions=4,
            timeout_seconds=5.0,
            http_options=types.HttpOptions(httpx_async_client=err_client),
        )
        try:
            with pytest.raises(ProviderUpstreamError) as gen_err:
                await err_provider.generate_structured(
                    system_instruction="sys",
                    user_text="user",
                    response_schema=ProviderRephraseOutput,
                )
            assert "INTERNAL_SECRET_TRACE_XYZ" not in str(gen_err.value)
            assert str(gen_err.value) == "AI provider is temporarily unavailable"

            with pytest.raises(ProviderUpstreamError) as emb_err:
                await err_provider.embed(text="hello")
            assert "INTERNAL_SECRET_TRACE_XYZ" not in str(emb_err.value)
            assert str(emb_err.value) == "AI embedding provider is temporarily unavailable"
        finally:
            await err_provider.aclose()

        def malformed_handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "candidates": [
                        {"content": {"parts": [{"text": "{not valid json"}], "role": "model"}}
                    ]
                },
            )

        bad_json_client = httpx.AsyncClient(transport=httpx.MockTransport(malformed_handler))
        bad_json_provider = GeminiTriageProvider(
            api_key="test-key",
            model="gemini-3.5-flash-lite",
            embedding_model="gemini-embedding-2",
            embedding_dimensions=4,
            timeout_seconds=5.0,
            http_options=types.HttpOptions(httpx_async_client=bad_json_client),
        )
        try:
            with pytest.raises(ProviderUpstreamError):
                await bad_json_provider.generate_structured(
                    system_instruction="sys",
                    user_text="user",
                    response_schema=ProviderRephraseOutput,
                )
        finally:
            await bad_json_provider.aclose()

        def wrong_dim_handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={"embeddings": [{"values": [0.1, 0.2]}]},
            )

        dim_client = httpx.AsyncClient(transport=httpx.MockTransport(wrong_dim_handler))
        dim_provider = GeminiTriageProvider(
            api_key="test-key",
            model="gemini-3.5-flash-lite",
            embedding_model="gemini-embedding-2",
            embedding_dimensions=4,
            timeout_seconds=5.0,
            http_options=types.HttpOptions(httpx_async_client=dim_client),
        )
        try:
            with pytest.raises(ProviderUpstreamError):
                await dim_provider.embed(text="hello")
        finally:
            await dim_provider.aclose()

    asyncio.run(run_timeout_tests())
    asyncio.run(run_error_and_malformed_tests())


def test_lifespan_closes_default_gemini_provider() -> None:
    app = create_app(Settings(port=8000, gemini_api_key=""))
    closed = False
    original_aclose = app.state.provider.aclose

    async def tracked_aclose() -> None:
        nonlocal closed
        closed = True
        await original_aclose()

    app.state.provider.aclose = tracked_aclose

    with TestClient(app) as client:
        assert client.get("/healthz").status_code == 200
        assert closed is False

    assert closed is True
