from __future__ import annotations

import base64
import binascii
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

AnalyzeTask = Literal["classify", "severity", "keywords", "embed"]
SeverityLevel = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
AllowedImageMime = Literal["image/jpeg", "image/png"]

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB per BRD §5.3


def _require_non_blank(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError(f"{field_name} cannot be blank")
    return cleaned


class LocationInput(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=None, ge=-180.0, le=180.0)


class ImageInput(BaseModel):
    mime_type: AllowedImageMime
    data_base64: str = Field(min_length=1)

    @field_validator("data_base64")
    @classmethod
    def validate_base64_payload(cls, value: str) -> str:
        payload = value.strip()
        if payload.startswith("data:") and "," in payload:
            payload = payload.split(",", 1)[1].strip()
        try:
            decoded = base64.b64decode(payload, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("data_base64 must be valid base64") from exc
        if not decoded:
            raise ValueError("image payload cannot be empty")
        if len(decoded) > MAX_IMAGE_BYTES:
            raise ValueError("image exceeds 10 MB limit")
        return payload

    def decode_bytes(self) -> bytes:
        return base64.b64decode(self.data_base64, validate=True)


# ---------------------------------------------------------------------------
# 1. Rephrase Report (Optional before submit)
# ---------------------------------------------------------------------------


class RephraseRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "domain": "campus_facilities",
                "language": "th",
                "title": "ตู้ไฟ ศร3 ชั้น2 เหม็นไหม้",
                "description": "เดินผ่านหน้าลิฟต์ชั้น 2 ตึก ศร.3 ได้กลิ่นเหม็นไหม้ออกมาจากตู้ควบคุมไฟ มีเสียงช็อตเป็นระยะ",
                "location": {"name": "อาคารศูนย์เรียนรวม 3 (ศร.3)"},
            }
        }
    )

    domain: str = Field(default="campus_facilities", min_length=1, max_length=80)
    language: str = Field(default="th", min_length=2, max_length=16)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4000)
    location: LocationInput | None = None

    @field_validator("title")
    @classmethod
    def check_title(cls, value: str) -> str:
        return _require_non_blank(value, "title")

    @field_validator("description")
    @classmethod
    def check_description(cls, value: str) -> str:
        return _require_non_blank(value, "description")


class ProviderRephraseOutput(BaseModel):
    rephrased_title: str
    rephrased_description: str


class RephraseResponse(BaseModel):
    request_id: str
    provider: str
    model: str
    latency_ms: int = Field(ge=0)
    rephrased_title: str
    rephrased_description: str


# ---------------------------------------------------------------------------
# 2. Analyze Report (Category + Severity + Embedding Vector)
# ---------------------------------------------------------------------------


class ReportItemInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4000)
    location: LocationInput | None = None
    images: list[ImageInput] = Field(default_factory=list, max_length=5)
    metadata: dict[str, Any] = Field(default_factory=dict, examples=[{}])

    @field_validator("title")
    @classmethod
    def check_title(cls, value: str) -> str:
        return _require_non_blank(value, "title")

    @field_validator("description")
    @classmethod
    def check_description(cls, value: str) -> str:
        return _require_non_blank(value, "description")


class CategoryOption(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=400)


class SeverityRubricInput(BaseModel):
    """Optional custom severity definitions (defaults to BRD rubric when omitted)."""

    LOW: str | None = Field(default=None, max_length=400)
    MEDIUM: str | None = Field(default=None, max_length=400)
    HIGH: str | None = Field(default=None, max_length=400)
    CRITICAL: str | None = Field(default=None, max_length=400)


class SeverityWeightsInput(BaseModel):
    """Optional weights for deterministic severity scoring (normalized to sum to 1.0)."""

    safety_risk: float = Field(default=0.40, ge=0.0)
    operational_impact: float = Field(default=0.25, ge=0.0)
    affected_scope: float = Field(default=0.20, ge=0.0)
    urgency: float = Field(default=0.15, ge=0.0)

    @model_validator(mode="after")
    def validate_positive_sum(self) -> "SeverityWeightsInput":
        total = (
            self.safety_risk
            + self.operational_impact
            + self.affected_scope
            + self.urgency
        )
        if total <= 0:
            raise ValueError("severity_weights must have a positive sum")
        return self


class SeverityThresholdsInput(BaseModel):
    """Optional score thresholds (0 < medium < high < critical <= 3.0)."""

    medium: float = Field(default=0.80, gt=0.0, le=3.0)
    high: float = Field(default=1.60, gt=0.0, le=3.0)
    critical: float = Field(default=2.35, gt=0.0, le=3.0)

    @model_validator(mode="after")
    def validate_strict_order(self) -> "SeverityThresholdsInput":
        if not (0.0 < self.medium < self.high < self.critical <= 3.0):
            raise ValueError(
                "severity_thresholds must satisfy 0 < medium < high < critical <= 3.0"
            )
        return self


class TaxonomyInput(BaseModel):
    categories: list[CategoryOption] = Field(default_factory=list, max_length=50)
    severity_rubric: SeverityRubricInput = Field(default_factory=SeverityRubricInput)
    severity_weights: SeverityWeightsInput = Field(default_factory=SeverityWeightsInput)
    severity_thresholds: SeverityThresholdsInput = Field(
        default_factory=SeverityThresholdsInput
    )
    safety_override: bool = True


class TriageAnalyzeRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "domain": "campus_facilities",
                "language": "th",
                "tasks": ["classify", "severity", "keywords", "embed"],
                "item": {
                    "title": "ตู้ควบคุมไฟฟ้ามีกลิ่นไหม้และเสียงช็อต ชั้น 2 ศร.3",
                    "description": "พบกลิ่นเหม็นไหม้และเสียงช็อตเป็นระยะจากตู้ควบคุมไฟหน้าลิฟต์ชั้น 2 อาคาร ศร.3",
                    "location": {
                        "name": "อาคารศูนย์เรียนรวม 3 (ศร.3)",
                        "latitude": 13.8476,
                        "longitude": 100.5696,
                    },
                },
                "taxonomy": {
                    "categories": [
                        {"code": "ELECTRICAL", "name": "ไฟฟ้าและแสงสว่าง"},
                        {"code": "BUILDING", "name": "อาคารและสถานที่"},
                        {"code": "WATER", "name": "น้ำและท่อระบายน้ำ"},
                        {"code": "INTERNET", "name": "อินเทอร์เน็ตและอุปกรณ์"},
                        {"code": "SAFETY", "name": "ความปลอดภัยและการจราจร"},
                    ]
                },
            }
        }
    )

    domain: str = Field(default="campus_facilities", min_length=1, max_length=80)
    language: str = Field(default="th", min_length=2, max_length=16)
    tasks: list[AnalyzeTask] = Field(
        default_factory=lambda: ["classify", "severity", "keywords", "embed"],
        min_length=1,
    )
    item: ReportItemInput
    taxonomy: TaxonomyInput = Field(default_factory=TaxonomyInput)

    @model_validator(mode="after")
    def validate_taxonomy_requirements(self) -> "TriageAnalyzeRequest":
        if "classify" in self.tasks and not self.taxonomy.categories:
            raise ValueError("taxonomy.categories is required when 'classify' is in tasks")
        return self


class ProviderAlternativeCategory(BaseModel):
    category_code: str
    confidence: float


class ProviderClassification(BaseModel):
    category_code: str
    confidence: float
    alternatives: list[ProviderAlternativeCategory] = Field(default_factory=list)
    reason: str


class ProviderSeverity(BaseModel):
    safety_risk: int = Field(ge=0, le=3)
    operational_impact: int = Field(ge=0, le=3)
    affected_scope: int = Field(ge=0, le=3)
    urgency: int = Field(ge=0, le=3)
    confidence: float
    reason: str


class ProviderAnalyzeOutput(BaseModel):
    classification: ProviderClassification | None = None
    severity: ProviderSeverity | None = None
    keywords: list[str] = Field(default_factory=list)


class AlternativeCategory(BaseModel):
    category_code: str
    category_name: str
    confidence: float = Field(ge=0.0, le=1.0)


class ClassificationResult(BaseModel):
    category_code: str
    category_name: str
    confidence: float = Field(ge=0.0, le=1.0)
    alternatives: list[AlternativeCategory] = Field(default_factory=list)
    reason: str


class SeverityFactorsResult(BaseModel):
    safety_risk: int = Field(ge=0, le=3)
    operational_impact: int = Field(ge=0, le=3)
    affected_scope: int = Field(ge=0, le=3)
    urgency: int = Field(ge=0, le=3)


class SeverityResult(BaseModel):
    level: SeverityLevel
    risk_score: float = Field(ge=0.0, le=3.0)
    factors: SeverityFactorsResult
    safety_override_triggered: bool
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str


class EmbeddingResult(BaseModel):
    model: str
    dimensions: int = Field(ge=1)
    values: list[float]


class TriageAnalyzeResponse(BaseModel):
    request_id: str
    provider: str
    model: str | None = None
    latency_ms: int = Field(ge=0)
    classification: ClassificationResult | None = None
    severity: SeverityResult | None = None
    keywords: list[str] = Field(default_factory=list)
    embedding: EmbeddingResult | None = None


# ---------------------------------------------------------------------------
# 3. Summarize Ticket (Synthesize Title + Description + Optional Blended Vector)
# ---------------------------------------------------------------------------


class TicketReportSource(BaseModel):
    report_id: str | None = Field(default=None, max_length=128)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4000)
    location_name: str | None = Field(default=None, max_length=200)

    @field_validator("title")
    @classmethod
    def check_title(cls, value: str) -> str:
        return _require_non_blank(value, "title")

    @field_validator("description")
    @classmethod
    def check_description(cls, value: str) -> str:
        return _require_non_blank(value, "description")


class CurrentTicketInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4000)


class SummarizeTicketRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "domain": "campus_facilities",
                "language": "th",
                "location_name": "อาคารศูนย์เรียนรวม 3 (ศร.3)",
                "category_name": "ไฟฟ้าและแสงสว่าง",
                "reports": [
                    {
                        "report_id": "R-001",
                        "title": "ตู้ไฟหน้าลิฟต์ ศร.3 ชั้น 2 มีกลิ่นไหม้",
                        "description": "เดินผ่านหน้าลิฟต์ชั้น 2 ได้กลิ่นเหม็นไหม้และมีเสียงช็อตเบา ๆ เป็นระยะ",
                    },
                    {
                        "report_id": "R-002",
                        "title": "ตู้เบรกเกอร์ ศร.3 ชั้น 2 ร้อนผิดปกติ",
                        "description": "เพิ่งขึ้นลิฟต์มาชั้น 2 ตู้เบรกเกอร์ไฟข้างลิฟต์ร้อนมากและมีกลิ่นไหม้",
                    },
                ],
                "include_embedding": True,
            }
        }
    )

    domain: str = Field(default="campus_facilities", min_length=1, max_length=80)
    language: str = Field(default="th", min_length=2, max_length=16)
    location_name: str | None = Field(default=None, max_length=200)
    category_name: str | None = Field(default=None, max_length=120)
    current_ticket: CurrentTicketInput | None = None
    reports: list[TicketReportSource] = Field(min_length=1, max_length=50)
    include_embedding: bool = True
    report_embeddings: list[list[float]] = Field(default_factory=list, max_length=50)
    summary_weight: float = Field(default=0.6, ge=0.0, le=1.0)
    reports_weight: float = Field(default=0.4, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_weights_and_vectors(self) -> "SummarizeTicketRequest":
        if (self.summary_weight + self.reports_weight) == 0:
            raise ValueError("summary_weight and reports_weight cannot both be zero")
        if self.report_embeddings:
            dim = len(self.report_embeddings[0])
            if dim == 0:
                raise ValueError("report_embeddings vectors cannot be empty")
            if any(len(vec) != dim for vec in self.report_embeddings):
                raise ValueError("all report_embeddings must have the same dimension")
        return self


class ProviderSummarizeTicketOutput(BaseModel):
    ticket_title: str
    ticket_description: str
    keywords: list[str] = Field(default_factory=list)


class SummarizeTicketResponse(BaseModel):
    request_id: str
    provider: str
    model: str
    latency_ms: int = Field(ge=0)
    ticket_title: str
    ticket_description: str
    keywords: list[str] = Field(default_factory=list)
    summary_embedding: EmbeddingResult | None = None
    blended_embedding: EmbeddingResult | None = None


# ---------------------------------------------------------------------------
# 4. Embed Ticket Only (No LLM call — e.g. after Reviewer edits final Ticket)
# ---------------------------------------------------------------------------


class EmbedTicketRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "domain": "campus_facilities",
                "title": "ตู้ควบคุมไฟฟ้าหน้าลิฟต์ชั้น 2 อาคาร ศร.3 มีกลิ่นไหม้และเสียงช็อต",
                "description": "พบกลิ่นเหม็นไหม้ เสียงช็อต และความร้อนผิดปกติจากตู้ควบคุมไฟโถงลิฟต์ชั้น 2 อาคาร ศร.3",
                "location_name": "อาคารศูนย์เรียนรวม 3 (ศร.3)",
                "category_name": "ไฟฟ้าและแสงสว่าง",
            }
        }
    )

    domain: str = Field(default="campus_facilities", min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4000)
    location_name: str | None = Field(default=None, max_length=200)
    category_name: str | None = Field(default=None, max_length=120)
    report_embeddings: list[list[float]] = Field(default_factory=list, max_length=50)
    summary_weight: float = Field(default=0.6, ge=0.0, le=1.0)
    reports_weight: float = Field(default=0.4, ge=0.0, le=1.0)

    @field_validator("title")
    @classmethod
    def check_title(cls, value: str) -> str:
        return _require_non_blank(value, "title")

    @field_validator("description")
    @classmethod
    def check_description(cls, value: str) -> str:
        return _require_non_blank(value, "description")

    @model_validator(mode="after")
    def validate_weights_and_vectors(self) -> "EmbedTicketRequest":
        if (self.summary_weight + self.reports_weight) == 0:
            raise ValueError("summary_weight and reports_weight cannot both be zero")
        if self.report_embeddings:
            dim = len(self.report_embeddings[0])
            if dim == 0:
                raise ValueError("report_embeddings vectors cannot be empty")
            if any(len(vec) != dim for vec in self.report_embeddings):
                raise ValueError("all report_embeddings must have the same dimension")
        return self


class EmbedTicketResponse(BaseModel):
    request_id: str
    provider: str
    latency_ms: int = Field(ge=0)
    summary_embedding: EmbeddingResult
    blended_embedding: EmbeddingResult


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
