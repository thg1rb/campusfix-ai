from __future__ import annotations

import asyncio
import math
import time
import uuid

from ku_spot_ai.api.schemas import (
    AlternativeCategory,
    CategoryOption,
    ClassificationResult,
    EmbeddingIdentity,
    EmbeddingResult,
    EmbedTicketRequest,
    EmbedTicketResponse,
    ProviderAnalyzeOutput,
    ProviderRephraseOutput,
    ProviderSeverity,
    ProviderSummarizeTicketOutput,
    RephraseRequest,
    RephraseResponse,
    SeverityFactorsResult,
    SeverityResult,
    SeverityThresholdsInput,
    SeverityWeightsInput,
    SummarizeTicketRequest,
    SummarizeTicketResponse,
    TriageAnalyzeRequest,
    TriageAnalyzeResponse,
)
from ku_spot_ai.prompts.triage import (
    EMBEDDING_TEXT_VERSION,
    build_analyze_prompts,
    build_rephrase_prompts,
    build_report_embedding_text,
    build_summarize_ticket_prompts,
    build_ticket_embedding_text,
)
from ku_spot_ai.providers.base import (
    EmbeddingProviderResult,
    ProviderUpstreamError,
    StructuredProviderResult,
    TriageProvider,
)
from ku_spot_ai.scoring.severity import (
    SeverityFactors,
    SeverityThresholds,
    SeverityWeights,
    compute_severity,
)
from ku_spot_ai.scoring.vectors import l2_normalize, weighted_blend

ANALYZE_LLM_TASKS = frozenset({"classify", "severity", "keywords"})


def _clamp_confidence(value: float, *, field_name: str) -> float:
    numeric = float(value)
    if not math.isfinite(numeric):
        raise ProviderUpstreamError(f"AI provider returned a non-finite {field_name}")
    return round(max(0.0, min(1.0, numeric)), 4)


def _clean_keywords(raw_keywords: list[str], *, limit: int = 8) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in raw_keywords:
        token = item.strip()
        if not token:
            continue
        key = token.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(token)
        if len(cleaned) >= limit:
            break
    return cleaned


def _resolve_category(
    code_or_name: str,
    categories: list[CategoryOption],
) -> CategoryOption | None:
    needle = code_or_name.strip().lower()
    for cat in categories:
        if cat.code.strip().lower() == needle:
            return cat
    for cat in categories:
        if cat.name.strip().lower() == needle:
            return cat
    return None


def _build_severity_result(
    raw_severity: ProviderSeverity | None,
    *,
    weights_input: SeverityWeightsInput,
    thresholds_input: SeverityThresholdsInput,
    safety_override: bool,
) -> SeverityResult:
    if raw_severity is None:
        raise ProviderUpstreamError("AI provider omitted required severity output")
    severity_confidence = _clamp_confidence(
        raw_severity.confidence, field_name="severity.confidence"
    )
    severity_reason = raw_severity.reason.strip()
    if not severity_reason:
        raise ProviderUpstreamError("AI provider returned an empty severity reason")
    computed = compute_severity(
        SeverityFactors(
            safety_risk=raw_severity.safety_risk,
            operational_impact=raw_severity.operational_impact,
            affected_scope=raw_severity.affected_scope,
            urgency=raw_severity.urgency,
        ),
        weights=SeverityWeights(
            safety_risk=weights_input.safety_risk,
            operational_impact=weights_input.operational_impact,
            affected_scope=weights_input.affected_scope,
            urgency=weights_input.urgency,
        ),
        thresholds=SeverityThresholds(
            medium=thresholds_input.medium,
            high=thresholds_input.high,
            critical=thresholds_input.critical,
        ),
        safety_override=safety_override,
    )
    return SeverityResult(
        level=computed.level,
        risk_score=computed.risk_score,
        factors=SeverityFactorsResult(
            safety_risk=computed.factors.safety_risk,
            operational_impact=computed.factors.operational_impact,
            affected_scope=computed.factors.affected_scope,
            urgency=computed.factors.urgency,
        ),
        safety_override_triggered=computed.safety_override_triggered,
        confidence=severity_confidence,
        reason=severity_reason,
    )


class TriageService:
    def __init__(self, provider: TriageProvider) -> None:
        self._provider = provider

    def _normalize_upstream_embedding(
        self, embed_result: EmbeddingProviderResult
    ) -> EmbeddingResult:
        expected_dim = self._provider.embedding_dimensions
        if expected_dim > 0 and len(embed_result.values) != expected_dim:
            raise ProviderUpstreamError(
                "AI provider returned an embedding with unexpected dimensions"
            )
        try:
            normalized = l2_normalize(embed_result.values)
        except ValueError as exc:
            raise ProviderUpstreamError("AI provider returned an invalid embedding vector") from exc
        return EmbeddingResult(
            model=embed_result.model,
            dimensions=len(normalized),
            text_version=EMBEDDING_TEXT_VERSION,
            values=normalized,
        )

    async def rephrase(self, request: RephraseRequest) -> RephraseResponse:
        request_id = f"rephrase_{uuid.uuid4().hex[:12]}"
        built = build_rephrase_prompts(request)

        started = time.perf_counter()
        result = await self._provider.generate_structured(
            system_instruction=built.system_instruction,
            user_text=built.user_text,
            response_schema=ProviderRephraseOutput,
        )
        latency_ms = int((time.perf_counter() - started) * 1000)

        rephrased_title = result.output.rephrased_title.strip()
        rephrased_description = result.output.rephrased_description.strip()
        if not rephrased_title or not rephrased_description:
            raise ProviderUpstreamError("AI provider returned an incomplete rephrase response")

        return RephraseResponse(
            request_id=request_id,
            provider=result.provider,
            model=result.model,
            latency_ms=latency_ms,
            rephrased_title=rephrased_title,
            rephrased_description=rephrased_description,
        )

    async def analyze(self, request: TriageAnalyzeRequest) -> TriageAnalyzeResponse:
        request_id = f"triage_{uuid.uuid4().hex[:12]}"
        requested = set(request.tasks)
        needs_llm = bool(requested & ANALYZE_LLM_TASKS)
        needs_embed = "embed" in requested

        started = time.perf_counter()

        llm_result: StructuredProviderResult[ProviderAnalyzeOutput] | None = None
        embed_result: EmbeddingProviderResult | None = None

        if needs_llm and needs_embed:
            built = build_analyze_prompts(request)
            embed_text = build_report_embedding_text(request)
            llm_task = asyncio.create_task(
                self._provider.generate_structured(
                    system_instruction=built.system_instruction,
                    user_text=built.user_text,
                    response_schema=ProviderAnalyzeOutput,
                    images=request.item.images,
                )
            )
            embed_task = asyncio.create_task(
                self._provider.embed(
                    text=embed_text,
                    images=request.item.images,
                )
            )
            done, pending = await asyncio.wait(
                {llm_task, embed_task},
                return_when=asyncio.FIRST_EXCEPTION,
            )
            failed: BaseException | None = None
            for task in done:
                exc = task.exception()
                if exc is not None and failed is None:
                    failed = exc
            if failed is not None:
                for task in pending:
                    task.cancel()
                if pending:
                    await asyncio.gather(*pending, return_exceptions=True)
                raise failed
            llm_result = llm_task.result()
            embed_result = embed_task.result()
        elif needs_llm:
            built = build_analyze_prompts(request)
            llm_result = await self._provider.generate_structured(
                system_instruction=built.system_instruction,
                user_text=built.user_text,
                response_schema=ProviderAnalyzeOutput,
                images=request.item.images,
            )
        elif needs_embed:
            embed_text = build_report_embedding_text(request)
            embed_result = await self._provider.embed(
                text=embed_text,
                images=request.item.images,
            )

        latency_ms = int((time.perf_counter() - started) * 1000)

        return self._build_analyze_response(
            request_id=request_id,
            provider=self._provider.name,
            model=llm_result.model if llm_result is not None else None,
            latency_ms=latency_ms,
            request=request,
            raw=llm_result.output if llm_result is not None else None,
            embed_result=embed_result,
        )

    async def summarize_ticket(
        self,
        request: SummarizeTicketRequest,
    ) -> SummarizeTicketResponse:
        request_id = f"ticket_{uuid.uuid4().hex[:12]}"
        if request.include_embedding:
            self._validate_report_embedding_space(
                request.report_embeddings,
                request.report_embedding_meta,
            )
        built = build_summarize_ticket_prompts(request)

        started = time.perf_counter()
        llm_result = await self._provider.generate_structured(
            system_instruction=built.system_instruction,
            user_text=built.user_text,
            response_schema=ProviderSummarizeTicketOutput,
        )
        ticket_title = llm_result.output.ticket_title.strip()
        ticket_description = llm_result.output.ticket_description.strip()
        if not ticket_title or not ticket_description:
            raise ProviderUpstreamError("AI provider returned an incomplete ticket summary")
        severity = _build_severity_result(
            llm_result.output.severity,
            weights_input=request.severity_weights,
            thresholds_input=request.severity_thresholds,
            safety_override=request.safety_override,
        )
        keywords = _clean_keywords(llm_result.output.keywords)

        blended_embedding: EmbeddingResult | None = None

        if request.include_embedding:
            blended_embedding = await self._compute_ticket_embedding(
                domain=request.domain,
                title=ticket_title,
                description=ticket_description,
                location_name=request.location_name,
                category_name=request.category_name,
                report_embeddings=request.report_embeddings,
                report_embedding_meta=request.report_embedding_meta,
                summary_weight=request.summary_weight,
                reports_weight=request.reports_weight,
            )

        latency_ms = int((time.perf_counter() - started) * 1000)

        return SummarizeTicketResponse(
            request_id=request_id,
            provider=llm_result.provider,
            model=llm_result.model,
            latency_ms=latency_ms,
            ticket_title=ticket_title,
            ticket_description=ticket_description,
            severity=severity,
            keywords=keywords,
            blended_embedding=blended_embedding,
        )

    async def embed_ticket(self, request: EmbedTicketRequest) -> EmbedTicketResponse:
        request_id = f"embed_ticket_{uuid.uuid4().hex[:12]}"
        started = time.perf_counter()

        blended_embedding = await self._compute_ticket_embedding(
            domain=request.domain,
            title=request.title,
            description=request.description,
            location_name=request.location_name,
            category_name=request.category_name,
            report_embeddings=request.report_embeddings,
            report_embedding_meta=request.report_embedding_meta,
            summary_weight=request.summary_weight,
            reports_weight=request.reports_weight,
        )

        latency_ms = int((time.perf_counter() - started) * 1000)

        return EmbedTicketResponse(
            request_id=request_id,
            provider=self._provider.name,
            latency_ms=latency_ms,
            blended_embedding=blended_embedding,
        )

    def _validate_report_embedding_space(
        self,
        report_embeddings: list[list[float]],
        report_embedding_meta: EmbeddingIdentity | None,
    ) -> EmbeddingIdentity | None:
        if not report_embeddings:
            return None
        if report_embedding_meta is None:
            raise ValueError(
                "report_embedding_meta is required when report_embeddings are provided"
            )
        expected_model = self._provider.embedding_model
        expected_dim = self._provider.embedding_dimensions
        if (
            report_embedding_meta.model != expected_model
            or (expected_dim > 0 and report_embedding_meta.dimensions != expected_dim)
            or report_embedding_meta.text_version != EMBEDDING_TEXT_VERSION
        ):
            raise ValueError(
                "report_embedding_meta does not match active embedding space "
                f"({expected_model}, dim={expected_dim}, text_version={EMBEDDING_TEXT_VERSION}); "
                "re-embed reports before blending"
            )
        return report_embedding_meta

    async def _compute_ticket_embedding(
        self,
        *,
        domain: str,
        title: str,
        description: str,
        location_name: str | None,
        category_name: str | None,
        report_embeddings: list[list[float]],
        report_embedding_meta: EmbeddingIdentity | None,
        summary_weight: float,
        reports_weight: float,
    ) -> EmbeddingResult:
        validated_meta = self._validate_report_embedding_space(
            report_embeddings,
            report_embedding_meta,
        )

        embed_text = build_ticket_embedding_text(
            domain=domain,
            title=title,
            description=description,
            location_name=location_name,
            category_name=category_name,
        )
        embed_result = await self._provider.embed(text=embed_text)
        summary_embedding = self._normalize_upstream_embedding(embed_result)

        if validated_meta is not None:
            if (
                validated_meta.model != summary_embedding.model
                or validated_meta.dimensions != summary_embedding.dimensions
                or validated_meta.text_version != summary_embedding.text_version
            ):
                raise ValueError(
                    "report_embedding_meta does not match active embedding space "
                    f"({summary_embedding.model}, dim={summary_embedding.dimensions}, "
                    f"text_version={summary_embedding.text_version}); "
                    "re-embed reports before blending"
                )
            blended_values = weighted_blend(
                summary_embedding.values,
                report_embeddings,
                summary_weight=summary_weight,
                reports_weight=reports_weight,
            )
            return EmbeddingResult(
                model=summary_embedding.model,
                dimensions=len(blended_values),
                text_version=summary_embedding.text_version,
                values=blended_values,
            )

        return summary_embedding

    def _build_analyze_response(
        self,
        *,
        request_id: str,
        provider: str,
        model: str | None,
        latency_ms: int,
        request: TriageAnalyzeRequest,
        raw: ProviderAnalyzeOutput | None,
        embed_result: EmbeddingProviderResult | None,
    ) -> TriageAnalyzeResponse:
        requested = set(request.tasks)

        classification: ClassificationResult | None = None
        if "classify" in requested:
            if raw is None or raw.classification is None:
                raise ProviderUpstreamError("AI provider omitted required classification output")
            matched = _resolve_category(
                raw.classification.category_code, request.taxonomy.categories
            )
            if matched is None:
                raise ProviderUpstreamError("AI provider returned an unrecognized category code")
            confidence = _clamp_confidence(
                raw.classification.confidence, field_name="classification.confidence"
            )
            reason = raw.classification.reason.strip()
            if not reason:
                raise ProviderUpstreamError("AI provider returned an empty classification reason")
            alternatives: list[AlternativeCategory] = []
            seen_codes = {matched.code}
            for alt in raw.classification.alternatives:
                resolved_alt = _resolve_category(alt.category_code, request.taxonomy.categories)
                if resolved_alt is None or resolved_alt.code in seen_codes:
                    continue
                seen_codes.add(resolved_alt.code)
                alternatives.append(
                    AlternativeCategory(
                        category_code=resolved_alt.code,
                        category_name=resolved_alt.name,
                        confidence=_clamp_confidence(
                            alt.confidence, field_name="classification.alternative.confidence"
                        ),
                    )
                )
            classification = ClassificationResult(
                category_code=matched.code,
                category_name=matched.name,
                confidence=confidence,
                alternatives=alternatives[:2],
                reason=reason,
            )

        severity: SeverityResult | None = None
        if "severity" in requested:
            severity = _build_severity_result(
                raw.severity if raw is not None else None,
                weights_input=request.taxonomy.severity_weights,
                thresholds_input=request.taxonomy.severity_thresholds,
                safety_override=request.taxonomy.safety_override,
            )

        keywords: list[str] = []
        if "keywords" in requested:
            if raw is None:
                raise ProviderUpstreamError("AI provider omitted required keywords output")
            keywords = _clean_keywords(raw.keywords)

        embedding: EmbeddingResult | None = None
        if "embed" in requested:
            if embed_result is None:
                raise ProviderUpstreamError("AI provider omitted required embedding output")
            embedding = self._normalize_upstream_embedding(embed_result)

        return TriageAnalyzeResponse(
            request_id=request_id,
            provider=provider,
            model=model,
            latency_ms=latency_ms,
            classification=classification,
            severity=severity,
            keywords=keywords,
            embedding=embedding,
        )
