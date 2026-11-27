from __future__ import annotations

import hmac
from typing import Any

from fastapi import APIRouter, Depends, Request, Security, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader

from ku_spot_ai.api.schemas import (
    EmbedTicketRequest,
    EmbedTicketResponse,
    ErrorDetail,
    ErrorResponse,
    FieldError,
    RephraseRequest,
    RephraseResponse,
    SummarizeTicketRequest,
    SummarizeTicketResponse,
    TriageAnalyzeRequest,
    TriageAnalyzeResponse,
)
from ku_spot_ai.application.triage_service import TriageService
from ku_spot_ai.config import Settings
from ku_spot_ai.providers.base import ProviderError

router = APIRouter(prefix="/v1/triage", tags=["triage"])

_api_key_header = APIKeyHeader(
    name="X-API-Key",
    scheme_name="ClientApiKey",
    auto_error=False,
)

COMMON_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse, "description": "Missing or invalid X-API-Key"},
    413: {"model": ErrorResponse, "description": "Request payload exceeds gateway limit"},
    422: {"model": ErrorResponse, "description": "Request validation error"},
    503: {"model": ErrorResponse, "description": "AI provider unavailable or timed out"},
}


class _UnauthorizedClientError(Exception):
    pass


def _verify_client_api_key(
    request: Request,
    x_api_key: str | None = Security(_api_key_header),
) -> None:
    settings: Settings = request.app.state.settings
    if not settings.client_api_keys:
        if settings.allow_anonymous:
            return
        raise _UnauthorizedClientError()
    if not x_api_key or not x_api_key.isascii():
        raise _UnauthorizedClientError()
    if not any(hmac.compare_digest(x_api_key, allowed) for allowed in settings.client_api_keys):
        raise _UnauthorizedClientError()


def _sanitize_validation_errors(exc: RequestValidationError) -> list[FieldError]:
    items: list[FieldError] = []
    for err in exc.errors():
        loc_parts = [str(part) for part in err.get("loc", ())]
        loc = ".".join(loc_parts) if loc_parts else "body"
        msg = str(err.get("msg", "Invalid value"))
        err_type = str(err.get("type", "value_error"))
        items.append(FieldError(loc=loc, message=msg, type=err_type))
    return items


def register_error_handlers(app: Any) -> None:
    @app.exception_handler(_UnauthorizedClientError)
    async def handle_unauthorized(
        _request: Request, _exc: _UnauthorizedClientError
    ) -> JSONResponse:
        body = ErrorResponse(
            error=ErrorDetail(
                code="unauthorized_client",
                message="Missing or invalid X-API-Key header",
            )
        )
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content=body.model_dump(exclude_none=True),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_request_validation_error(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        body = ErrorResponse(
            error=ErrorDetail(
                code="validation_error",
                message="Request validation failed",
                details=_sanitize_validation_errors(exc),
            )
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content=body.model_dump(exclude_none=True),
        )

    @app.exception_handler(ProviderError)
    async def handle_provider_error(_request: Request, exc: ProviderError) -> JSONResponse:
        body = ErrorResponse(
            error=ErrorDetail(
                code=exc.code,
                message=str(exc),
            )
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=body.model_dump(exclude_none=True),
        )

    @app.exception_handler(ValueError)
    async def handle_value_error(_request: Request, exc: ValueError) -> JSONResponse:
        body = ErrorResponse(
            error=ErrorDetail(
                code="invalid_request",
                message=str(exc),
            )
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content=body.model_dump(exclude_none=True),
        )


@router.post(
    "/rephrase",
    response_model=RephraseResponse,
    responses=COMMON_ERROR_RESPONSES,
    dependencies=[Depends(_verify_client_api_key)],
)
async def rephrase_report(
    payload: RephraseRequest,
    request: Request,
) -> RephraseResponse:
    service: TriageService = request.app.state.triage_service
    return await service.rephrase(payload)


@router.post(
    "/analyze",
    response_model=TriageAnalyzeResponse,
    responses=COMMON_ERROR_RESPONSES,
    dependencies=[Depends(_verify_client_api_key)],
)
async def analyze_report(
    payload: TriageAnalyzeRequest,
    request: Request,
) -> TriageAnalyzeResponse:
    service: TriageService = request.app.state.triage_service
    return await service.analyze(payload)


@router.post(
    "/summarize-ticket",
    response_model=SummarizeTicketResponse,
    responses=COMMON_ERROR_RESPONSES,
    dependencies=[Depends(_verify_client_api_key)],
)
async def summarize_ticket(
    payload: SummarizeTicketRequest,
    request: Request,
) -> SummarizeTicketResponse:
    service: TriageService = request.app.state.triage_service
    return await service.summarize_ticket(payload)


@router.post(
    "/embed-ticket",
    response_model=EmbedTicketResponse,
    responses=COMMON_ERROR_RESPONSES,
    dependencies=[Depends(_verify_client_api_key)],
)
async def embed_ticket(
    payload: EmbedTicketRequest,
    request: Request,
) -> EmbedTicketResponse:
    service: TriageService = request.app.state.triage_service
    return await service.embed_ticket(payload)
