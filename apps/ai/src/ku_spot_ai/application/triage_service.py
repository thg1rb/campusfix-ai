from __future__ import annotations

import asyncio
import time
import uuid

from ku_spot_ai.api.schemas import (
    AlternativeCategory,
    CategoryOption,
    ClassificationResult,
    EmbeddingResult,
    EmbedTicketRequest,
    EmbedTicketResponse,
    ProviderAnalyzeOutput,
    ProviderRephraseOutput,
    ProviderSummarizeTicketOutput,
    RephraseRequest,
    RephraseResponse,
    SeverityFactorsResult,
    SeverityResult,
    SummarizeTicketRequest,
    SummarizeTicketResponse,
    TriageAnalyzeRequest,
    TriageAnalyzeResponse,
)
from ku_spot_ai.prompts.triage import (
    build_analyze_prompts,
    build_rephrase_prompts,
    build_report_embedding_text,
    build_summarize_ticket_prompts,
    build_ticket_embedding_text,
)
from ku_spot_ai.providers.base import (
    EmbeddingProviderResult,
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


def _clamp_score(value: float) -> float:
    return round(max(0.0, min(1.0, float(value))), 4)


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


class TriageService:
    def __init__(self, provider: TriageProvider) -> None:
        self._provider = provider

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

        return RephraseResponse(
            request_id=request_id,
            provider=result.provider,
            model=result.model,
            latency_ms=latency_ms,
            rephrased_title=result.output.rephrased_title.strip(),
            rephrased_description=result.output.rephrased_description.strip(),
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
            llm_result, embed_result = await asyncio.gather(
                self._provider.generate_structured(
                    system_instruction=built.system_instruction,
                    user_text=built.user_text,
                    response_schema=ProviderAnalyzeOutput,
                    images=request.item.images,
                ),
                self._provider.embed(
                    text=embed_text,
                    images=request.item.images,
                ),
            )
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
        built = build_summarize_ticket_prompts(request)

        started = time.perf_counter()
        llm_result = await self._provider.generate_structured(
            system_instruction=built.system_instruction,
            user_text=built.user_text,
            response_schema=ProviderSummarizeTicketOutput,
        )
        ticket_title = llm_result.output.ticket_title.strip()
        ticket_description = llm_result.output.ticket_description.strip()
        keywords = _clean_keywords(llm_result.output.keywords)

        summary_embedding: EmbeddingResult | None = None
        blended_embedding: EmbeddingResult | None = None

        if request.include_embedding:
            summary_embedding, blended_embedding = await self._compute_ticket_embeddings(
                domain=request.domain,
                title=ticket_title,
                description=ticket_description,
                location_name=request.location_name,
                category_name=request.category_name,
                report_embeddings=request.report_embeddings,
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
            keywords=keywords,
            summary_embedding=summary_embedding,
            blended_embedding=blended_embedding,
        )

    async def embed_ticket(self, request: EmbedTicketRequest) -> EmbedTicketResponse:
        request_id = f"embed_ticket_{uuid.uuid4().hex[:12]}"
        started = time.perf_counter()

        summary_embedding, blended_embedding = await self._compute_ticket_embeddings(
            domain=request.domain,
            title=request.title,
            description=request.description,
            location_name=request.location_name,
            category_name=request.category_name,
            report_embeddings=request.report_embeddings,
            summary_weight=request.summary_weight,
            reports_weight=request.reports_weight,
        )

        latency_ms = int((time.perf_counter() - started) * 1000)

        return EmbedTicketResponse(
            request_id=request_id,
            provider=self._provider.name,
            latency_ms=latency_ms,
            summary_embedding=summary_embedding,
            blended_embedding=blended_embedding,
        )

    async def _compute_ticket_embeddings(
        self,
        *,
        domain: str,
        title: str,
        description: str,
        location_name: str | None,
        category_name: str | None,
        report_embeddings: list[list[float]],
        summary_weight: float,
        reports_weight: float,
    ) -> tuple[EmbeddingResult, EmbeddingResult]:
        embed_text = build_ticket_embedding_text(
            domain=domain,
            title=title,
            description=description,
            location_name=location_name,
            category_name=category_name,
        )
        embed_result = await self._provider.embed(text=embed_text)
        normalized_summary = l2_normalize(embed_result.values)
        summary_embedding = EmbeddingResult(
            model=embed_result.model,
            dimensions=len(normalized_summary),
            values=normalized_summary,
        )

        if report_embeddings:
            blended_values = weighted_blend(
                normalized_summary,
                report_embeddings,
                summary_weight=summary_weight,
                reports_weight=reports_weight,
            )
            blended_embedding = EmbeddingResult(
                model=embed_result.model,
                dimensions=len(blended_values),
                values=blended_values,
            )
        else:
            blended_embedding = summary_embedding

        return summary_embedding, blended_embedding

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
        if (
            "classify" in requested
            and raw is not None
            and raw.classification is not None
            and request.taxonomy.categories
        ):
            matched = _resolve_category(
                raw.classification.category_code, request.taxonomy.categories
            )
            chosen = matched or request.taxonomy.categories[0]
            confidence = (
                _clamp_score(raw.classification.confidence)
                if matched is not None
                else 0.0
            )
            alternatives: list[AlternativeCategory] = []
            seen_codes = {chosen.code}
            for alt in raw.classification.alternatives:
                resolved_alt = _resolve_category(
                    alt.category_code, request.taxonomy.categories
                )
                if resolved_alt is None or resolved_alt.code in seen_codes:
                    continue
                seen_codes.add(resolved_alt.code)
                alternatives.append(
                    AlternativeCategory(
                        category_code=resolved_alt.code,
                        category_name=resolved_alt.name,
                        confidence=_clamp_score(alt.confidence),
                    )
                )
            classification = ClassificationResult(
                category_code=chosen.code,
                category_name=chosen.name,
                confidence=confidence,
                alternatives=alternatives[:2],
                reason=raw.classification.reason.strip(),
            )

        severity: SeverityResult | None = None
        if "severity" in requested and raw is not None and raw.severity is not None:
            w = request.taxonomy.severity_weights
            t = request.taxonomy.severity_thresholds
            computed = compute_severity(
                SeverityFactors(
                    safety_risk=raw.severity.safety_risk,
                    operational_impact=raw.severity.operational_impact,
                    affected_scope=raw.severity.affected_scope,
                    urgency=raw.severity.urgency,
                ),
                weights=SeverityWeights(
                    safety_risk=w.safety_risk,
                    operational_impact=w.operational_impact,
                    affected_scope=w.affected_scope,
                    urgency=w.urgency,
                ),
                thresholds=SeverityThresholds(
                    medium=t.medium,
                    high=t.high,
                    critical=t.critical,
                ),
                safety_override=request.taxonomy.safety_override,
            )
            severity = SeverityResult(
                level=computed.level,
                risk_score=computed.risk_score,
                factors=SeverityFactorsResult(
                    safety_risk=computed.factors.safety_risk,
                    operational_impact=computed.factors.operational_impact,
                    affected_scope=computed.factors.affected_scope,
                    urgency=computed.factors.urgency,
                ),
                safety_override_triggered=computed.safety_override_triggered,
                confidence=_clamp_score(raw.severity.confidence),
                reason=raw.severity.reason.strip(),
            )

        keywords: list[str] = []
        if "keywords" in requested and raw is not None:
            keywords = _clean_keywords(raw.keywords)

        embedding: EmbeddingResult | None = None
        if "embed" in requested and embed_result is not None:
            normalized = l2_normalize(embed_result.values)
            embedding = EmbeddingResult(
                model=embed_result.model,
                dimensions=len(normalized),
                values=normalized,
            )

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
