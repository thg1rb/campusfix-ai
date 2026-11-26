from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header, Request, status
from fastapi.responses import JSONResponse

from campusfix_ai.api.schemas import (
    EmbedTicketRequest,
    EmbedTicketResponse,
    ErrorDetail,
    ErrorResponse,
    RephraseRequest,
    RephraseResponse,
    SummarizeTicketRequest,
    SummarizeTicketResponse,
    TriageAnalyzeRequest,
    TriageAnalyzeResponse,
)
from campusfix_ai.application.triage_service import TriageService
from campusfix_ai.config import Settings
from campusfix_ai.providers.base import ProviderError

router = APIRouter(prefix="/v1/triage", tags=["triage"])


def _verify_client_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> None:
    settings: Settings = request.app.state.settings
    if not settings.client_api_keys:
        return
    if not x_api_key or not any(
        hmac.compare_digest(x_api_key, allowed) for allowed in settings.client_api_keys
    ):
        raise _UnauthorizedClientError()


class _UnauthorizedClientError(Exception):
    pass


def register_error_handlers(app) -> None:
    @app.exception_handler(_UnauthorizedClientError)
    async def handle_unauthorized(_request: Request, _exc: _UnauthorizedClientError) -> JSONResponse:
        body = ErrorResponse(
            error=ErrorDetail(
                code="unauthorized_client",
                message="Missing or invalid X-API-Key header",
            )
        )
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content=body.model_dump(),
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
            content=body.model_dump(),
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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=body.model_dump(),
        )


@router.post(
    "/rephrase",
    response_model=RephraseResponse,
    responses={
        401: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
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
    responses={
        401: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
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
    responses={
        401: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
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
    responses={
        401: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
    dependencies=[Depends(_verify_client_api_key)],
)
async def embed_ticket(
    payload: EmbedTicketRequest,
    request: Request,
) -> EmbedTicketResponse:
    service: TriageService = request.app.state.triage_service
    return await service.embed_ticket(payload)
