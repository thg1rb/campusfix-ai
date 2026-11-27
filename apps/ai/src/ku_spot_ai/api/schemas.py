from __future__ import annotations

import base64
import binascii
import json
import math
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

AnalyzeTask = Literal["classify", "severity", "keywords", "departments", "embed"]
SeverityLevel = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
AllowedImageMime = Literal["image/jpeg", "image/png"]
NonBlankCodeItem = Annotated[str, Field(min_length=1, max_length=64, pattern=r"\S")]

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MiB per image (BRD §5.3)
MAX_TOTAL_IMAGE_BYTES = 15 * 1024 * 1024  # 15 MiB aggregate (within Gemini 20 MB inline budget)
MAX_IMAGE_BASE64_CHARS = ((MAX_IMAGE_BYTES + 2) // 3) * 4
MAX_EMBEDDING_DIMENSIONS = 3072
MAX_METADATA_KEYS = 20
MAX_METADATA_KEY_LENGTH = 64
MAX_METADATA_JSON_BYTES = 4096
MAX_SEVERITY_WEIGHT = 1_000_000.0
DEFAULT_DEPARTMENT_MIN_CONFIDENCE = 0.45
DEFAULT_MAX_RECOMMENDED_DEPARTMENTS = 3
MAX_RECOMMENDED_DEPARTMENTS_LIMIT = 10

DOMAIN_PATTERN = r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$"
LANGUAGE_PATTERN = r"^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$"

_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
_JPEG_SIGNATURE = b"\xff\xd8\xff"


def _require_non_blank(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError(f"{field_name} cannot be blank")
    return cleaned


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _require_unique_option_codes(options: list[Any], field_name: str) -> list[Any]:
    seen: set[str] = set()
    for opt in options:
        key = opt.code.strip().lower()
        if key in seen:
            raise ValueError(f"{field_name} must not contain duplicate codes")
        seen.add(key)
    return options


def _validate_image_magic_bytes(data: bytes, mime_type: AllowedImageMime) -> None:
    if mime_type == "image/png" and not data.startswith(_PNG_SIGNATURE):
        raise ValueError("image bytes do not match declared mime_type image/png")
    if mime_type == "image/jpeg" and not data.startswith(_JPEG_SIGNATURE):
        raise ValueError("image bytes do not match declared mime_type image/jpeg")


def _validate_report_embeddings(
    report_embeddings: list[list[float]],
    report_embedding_meta: EmbeddingIdentity | None,
) -> None:
    if not report_embeddings:
        return
    if report_embedding_meta is None:
        raise ValueError("report_embedding_meta is required when report_embeddings are provided")
    dim = len(report_embeddings[0])
    if dim == 0:
        raise ValueError("report_embeddings vectors cannot be empty")
    if dim > MAX_EMBEDDING_DIMENSIONS:
        raise ValueError(f"report_embeddings vector dimension exceeds {MAX_EMBEDDING_DIMENSIONS}")
    if dim != report_embedding_meta.dimensions:
        raise ValueError(
            "report_embeddings vector dimension must match report_embedding_meta.dimensions"
        )
    for vec in report_embeddings:
        if len(vec) != dim:
            raise ValueError("all report_embeddings must have the same dimension")
        has_nonzero = False
        for value in vec:
            if not math.isfinite(value):
                raise ValueError("report_embeddings values must be finite")
            if value != 0.0:
                has_nonzero = True
        if not has_nonzero:
            raise ValueError("report_embeddings vectors cannot be zero vectors")


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"


class LocationInput(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

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
        if not payload:
            raise ValueError("image payload cannot be empty")
        if len(payload) > MAX_IMAGE_BASE64_CHARS:
            raise ValueError("image exceeds 10 MB limit")
        try:
            decoded = base64.b64decode(payload, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("data_base64 must be valid base64") from exc
        if not decoded:
            raise ValueError("image payload cannot be empty")
        if len(decoded) > MAX_IMAGE_BYTES:
            raise ValueError("image exceeds 10 MB limit")
        return payload

    @model_validator(mode="after")
    def validate_magic_bytes(self) -> ImageInput:
        decoded = self.decode_bytes()
        _validate_image_magic_bytes(decoded, self.mime_type)
        return self

    def decode_bytes(self) -> bytes:
        return base64.b64decode(self.data_base64, validate=True)


# ---------------------------------------------------------------------------
# 1. Rephrase Report (Optional before submit)
# ---------------------------------------------------------------------------


class RephraseRequest(BaseModel):
    model_config = ConfigDict(
        allow_inf_nan=False,
        json_schema_extra={
            "example": {
                "domain": "campus_facilities",
                "language": "th",
                "title": "ตู้ไฟ ศร3 ชั้น2 เหม็นไหม้",
                "description": "เดินผ่านหน้าลิฟต์ชั้น 2 ตึก ศร.3 ได้กลิ่นเหม็นไหม้ออกมาจากตู้ควบคุมไฟ มีเสียงช็อตเป็นระยะ",
                "location": {
                    "name": "อาคารศูนย์เรียนรวม 3 (ศร.3)",
                    "latitude": 13.8476,
                    "longitude": 100.5696,
                },
            }
        },
    )

    domain: str = Field(
        default="campus_facilities",
        min_length=1,
        max_length=80,
        pattern=DOMAIN_PATTERN,
    )
    language: str = Field(
        default="th",
        min_length=2,
        max_length=16,
        pattern=LANGUAGE_PATTERN,
    )
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
    model_config = ConfigDict(allow_inf_nan=False)

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

    @field_validator("metadata")
    @classmethod
    def check_metadata_bounds(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(value) > MAX_METADATA_KEYS:
            raise ValueError(f"metadata cannot contain more than {MAX_METADATA_KEYS} keys")
        for key in value:
            if not key or len(key) > MAX_METADATA_KEY_LENGTH:
                raise ValueError(f"metadata keys must be 1..{MAX_METADATA_KEY_LENGTH} characters")
        serialized = json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8")
        if len(serialized) > MAX_METADATA_JSON_BYTES:
            raise ValueError(
                f"metadata serialized size cannot exceed {MAX_METADATA_JSON_BYTES} bytes"
            )
        return value

    @model_validator(mode="after")
    def check_total_image_budget(self) -> ReportItemInput:
        total_bytes = sum(len(img.decode_bytes()) for img in self.images)
        if total_bytes > MAX_TOTAL_IMAGE_BYTES:
            raise ValueError(
                f"combined decoded images exceed {MAX_TOTAL_IMAGE_BYTES // (1024 * 1024)} MB inline budget"
            )
        return self


class CategoryOption(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=400)

    @field_validator("code")
    @classmethod
    def check_code(cls, value: str) -> str:
        return _require_non_blank(value, "code")

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str) -> str:
        return _require_non_blank(value, "name")


class DepartmentOption(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    responsibility_scope: str = Field(min_length=1, max_length=600)
    supported_categories: list[NonBlankCodeItem] = Field(default_factory=list, max_length=20)
    location_scope: str | None = Field(default=None, max_length=200)

    @field_validator("code")
    @classmethod
    def check_code(cls, value: str) -> str:
        return _require_non_blank(value, "code")

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str) -> str:
        return _require_non_blank(value, "name")

    @field_validator("responsibility_scope")
    @classmethod
    def check_responsibility_scope(cls, value: str) -> str:
        return _require_non_blank(value, "responsibility_scope")

    @field_validator("supported_categories")
    @classmethod
    def check_supported_categories(cls, values: list[str]) -> list[str]:
        return [_require_non_blank(item, "supported_categories") for item in values]

    @field_validator("location_scope")
    @classmethod
    def check_location_scope(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class SeverityRubricInput(BaseModel):
    """Optional custom severity definitions (defaults to BRD rubric when omitted)."""

    LOW: str | None = Field(default=None, max_length=400)
    MEDIUM: str | None = Field(default=None, max_length=400)
    HIGH: str | None = Field(default=None, max_length=400)
    CRITICAL: str | None = Field(default=None, max_length=400)


class SeverityWeightsInput(BaseModel):
    """Optional weights for deterministic severity scoring (normalized to sum to 1.0)."""

    model_config = ConfigDict(allow_inf_nan=False)

    safety_risk: float = Field(default=0.40, ge=0.0, le=MAX_SEVERITY_WEIGHT)
    operational_impact: float = Field(default=0.25, ge=0.0, le=MAX_SEVERITY_WEIGHT)
    affected_scope: float = Field(default=0.20, ge=0.0, le=MAX_SEVERITY_WEIGHT)
    urgency: float = Field(default=0.15, ge=0.0, le=MAX_SEVERITY_WEIGHT)

    @model_validator(mode="after")
    def validate_positive_sum(self) -> SeverityWeightsInput:
        total = self.safety_risk + self.operational_impact + self.affected_scope + self.urgency
        if not math.isfinite(total) or total <= 0:
            raise ValueError("severity_weights must have a positive finite sum")
        return self


class SeverityThresholdsInput(BaseModel):
    """Optional score thresholds (0 < medium < high < critical <= 3.0)."""

    model_config = ConfigDict(allow_inf_nan=False)

    medium: float = Field(default=0.80, gt=0.0, le=3.0)
    high: float = Field(default=1.60, gt=0.0, le=3.0)
    critical: float = Field(default=2.35, gt=0.0, le=3.0)

    @model_validator(mode="after")
    def validate_strict_order(self) -> SeverityThresholdsInput:
        if not (0.0 < self.medium < self.high < self.critical <= 3.0):
            raise ValueError("severity_thresholds must satisfy 0 < medium < high < critical <= 3.0")
        return self


class TaxonomyInput(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    categories: list[CategoryOption] = Field(default_factory=list, max_length=50)
    departments: list[DepartmentOption] = Field(default_factory=list, max_length=50)
    department_min_confidence: float = Field(
        default=DEFAULT_DEPARTMENT_MIN_CONFIDENCE, ge=0.0, le=1.0
    )
    max_recommended_departments: int = Field(
        default=DEFAULT_MAX_RECOMMENDED_DEPARTMENTS,
        ge=1,
        le=MAX_RECOMMENDED_DEPARTMENTS_LIMIT,
    )
    severity_rubric: SeverityRubricInput = Field(default_factory=SeverityRubricInput)
    severity_weights: SeverityWeightsInput = Field(default_factory=SeverityWeightsInput)
    severity_thresholds: SeverityThresholdsInput = Field(default_factory=SeverityThresholdsInput)
    safety_override: bool = True

    @field_validator("categories")
    @classmethod
    def check_unique_categories(cls, value: list[CategoryOption]) -> list[CategoryOption]:
        return _require_unique_option_codes(value, "categories")

    @field_validator("departments")
    @classmethod
    def check_unique_departments(cls, value: list[DepartmentOption]) -> list[DepartmentOption]:
        return _require_unique_option_codes(value, "departments")


class TriageAnalyzeRequest(BaseModel):
    model_config = ConfigDict(
        allow_inf_nan=False,
        json_schema_extra={
            "example": {
                "domain": "campus_facilities",
                "language": "th",
                "tasks": ["classify", "severity", "departments", "keywords", "embed"],
                "item": {
                    "title": "ตู้ควบคุมไฟฟ้ามีกลิ่นไหม้และเสียงช็อต ชั้น 2 ศร.3",
                    "description": "พบกลิ่นเหม็นไหม้และเสียงช็อตเป็นระยะจากตู้ควบคุมไฟหน้าลิฟต์ชั้น 2 อาคาร ศร.3",
                    "location": {
                        "name": "อาคารศูนย์เรียนรวม 3 (ศร.3)",
                        "latitude": 13.8476,
                        "longitude": 100.5696,
                    },
                    "images": [],
                    "metadata": {"building_code": "LH3", "floor": 2},
                },
                "taxonomy": {
                    "categories": [
                        {
                            "code": "ELECTRICAL",
                            "name": "ไฟฟ้าและแสงสว่าง",
                            "description": "ระบบไฟฟ้า ตู้ควบคุม ไฟส่องสว่าง ปลั๊ก และสายไฟ",
                        },
                        {
                            "code": "BUILDING",
                            "name": "อาคารและสถานที่",
                            "description": "โครงสร้างอาคาร ประตู หน้าต่าง ลิฟต์ และเฟอร์นิเจอร์ส่วนกลาง",
                        },
                        {
                            "code": "WATER",
                            "name": "น้ำและท่อระบายน้ำ",
                            "description": "ระบบประปา น้ำรั่ว ท่ออุดตัน และน้ำท่วมขัง",
                        },
                        {
                            "code": "INTERNET",
                            "name": "อินเทอร์เน็ตและอุปกรณ์",
                            "description": "เครือข่าย Wi-Fi KUWIN สาย LAN และอุปกรณ์ไอทีส่วนกลาง",
                        },
                        {
                            "code": "SAFETY",
                            "name": "ความปลอดภัยและการจราจร",
                            "description": "จุดเสี่ยงอันตราย อัคคีภัย สิ่งกีดขวาง และการจราจร",
                        },
                    ],
                    "departments": [
                        {
                            "code": "BUILDINGS_UTILITIES",
                            "name": "กองอาคารสถานที่และสาธารณูปโภค",
                            "responsibility_scope": "ซ่อมบำรุงระบบไฟฟ้า ตู้ควบคุมไฟ แสงสว่าง ประปา ท่อระบายน้ำ และโครงสร้างอาคารส่วนกลาง",
                            "supported_categories": ["ELECTRICAL", "BUILDING", "WATER"],
                            "location_scope": "อาคารและพื้นที่ส่วนกลาง มก. บางเขน",
                        },
                        {
                            "code": "SAFETY_SECURITY",
                            "name": "งานรักษาความปลอดภัยและจราจร",
                            "responsibility_scope": "กั้นพื้นที่อันตราย ระงับเหตุฉุกเฉินเบื้องต้น อัคคีภัย และความปลอดภัยการสัญจรภายในวิทยาเขต",
                            "supported_categories": ["SAFETY", "ELECTRICAL"],
                            "location_scope": "ทุกพื้นที่ภายใน มก. บางเขน",
                        },
                        {
                            "code": "OCS_NETWORK",
                            "name": "สำนักบริการคอมพิวเตอร์ (เครือข่าย)",
                            "responsibility_scope": "ดูแลระบบอินเทอร์เน็ต Wi-Fi KUWIN เครือข่ายสาย LAN และระบบบัญชีผู้ใช้ไอที",
                            "supported_categories": ["INTERNET"],
                            "location_scope": "ทุกอาคารเรียนและหอสมุด มก. บางเขน",
                        },
                    ],
                    "department_min_confidence": DEFAULT_DEPARTMENT_MIN_CONFIDENCE,
                    "max_recommended_departments": DEFAULT_MAX_RECOMMENDED_DEPARTMENTS,
                    "severity_rubric": {
                        "LOW": "ผลกระทบจำกัด ไม่กระทบความปลอดภัยหรือการใช้งานหลัก เช่น ความชำรุดเล็กน้อยหรือความสวยงาม",
                        "MEDIUM": "กระทบความสะดวกหรือการใช้งานบางส่วน แต่ยังมีทางเลือกทดแทน เช่น ไฟบางจุดดับหรืออุปกรณ์บางชิ้นชำรุด",
                        "HIGH": "กระทบการใช้งานหลักของพื้นที่ส่วนกลางหรือผู้ใช้จำนวนมาก เช่น น้ำไม่ไหล อินเทอร์เน็ตล่มทั้งอาคาร หรือลิฟต์ใช้งานไม่ได้",
                        "CRITICAL": "มีความเสี่ยงอันตรายต่อความปลอดภัย ชีวิต หรือทรัพย์สินโดยตรง ต้องรับทราบเร่งด่วน เช่น ไฟฟ้าลัดวงจร/ไฟรั่ว โครงสร้างเสี่ยงถล่ม หรือน้ำท่วมขังบริเวณอุปกรณ์ไฟฟ้า",
                    },
                    "severity_weights": {
                        "safety_risk": 0.4,
                        "operational_impact": 0.25,
                        "affected_scope": 0.2,
                        "urgency": 0.15,
                    },
                    "severity_thresholds": {
                        "medium": 0.8,
                        "high": 1.6,
                        "critical": 2.35,
                    },
                    "safety_override": True,
                },
            }
        },
    )

    domain: str = Field(
        default="campus_facilities",
        min_length=1,
        max_length=80,
        pattern=DOMAIN_PATTERN,
    )
    language: str = Field(
        default="th",
        min_length=2,
        max_length=16,
        pattern=LANGUAGE_PATTERN,
    )
    tasks: list[AnalyzeTask] = Field(
        default_factory=lambda: ["classify", "severity", "keywords", "embed"],
        min_length=1,
        max_length=5,
    )
    item: ReportItemInput
    taxonomy: TaxonomyInput = Field(default_factory=TaxonomyInput)

    @field_validator("tasks")
    @classmethod
    def check_unique_tasks(cls, value: list[AnalyzeTask]) -> list[AnalyzeTask]:
        if len(set(value)) != len(value):
            raise ValueError("tasks must not contain duplicates")
        return value

    @model_validator(mode="after")
    def validate_taxonomy_requirements(self) -> TriageAnalyzeRequest:
        if "classify" in self.tasks and not self.taxonomy.categories:
            raise ValueError("taxonomy.categories is required when 'classify' is in tasks")
        if "departments" in self.tasks and not self.taxonomy.departments:
            raise ValueError("taxonomy.departments is required when 'departments' is in tasks")
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


class ProviderDepartmentRecommendation(BaseModel):
    department_code: str
    confidence: float
    reason: str


class ProviderAnalyzeOutput(BaseModel):
    classification: ProviderClassification | None = None
    severity: ProviderSeverity | None = None
    recommended_departments: list[ProviderDepartmentRecommendation] = Field(default_factory=list)
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


class DepartmentRecommendation(BaseModel):
    department_code: str
    department_name: str
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str


class EmbeddingIdentity(BaseModel):
    model: str = Field(min_length=1, max_length=120)
    dimensions: int = Field(ge=1, le=MAX_EMBEDDING_DIMENSIONS)
    text_version: str = Field(default="v1", min_length=1, max_length=32)

    @field_validator("model")
    @classmethod
    def check_model(cls, value: str) -> str:
        return _require_non_blank(value, "model")

    @field_validator("text_version")
    @classmethod
    def check_text_version(cls, value: str) -> str:
        return _require_non_blank(value, "text_version")


class EmbeddingResult(BaseModel):
    model: str
    dimensions: int = Field(ge=1)
    text_version: str = "v1"
    values: list[float]


class TriageAnalyzeResponse(BaseModel):
    request_id: str
    provider: str
    model: str | None = None
    latency_ms: int = Field(ge=0)
    classification: ClassificationResult | None = None
    severity: SeverityResult | None = None
    recommended_departments: list[DepartmentRecommendation] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    embedding: EmbeddingResult | None = None


# ---------------------------------------------------------------------------
# 3. Summarize Ticket (Title + Description + Ticket Severity + Blended Vector)
# ---------------------------------------------------------------------------


class TicketReportSource(BaseModel):
    report_id: str | None = Field(default=None, max_length=128)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4000)
    location_name: str | None = Field(default=None, max_length=200)
    observed_severity: SeverityLevel | None = None

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
    severity: SeverityLevel | None = None
    department_codes: list[NonBlankCodeItem] = Field(default_factory=list, max_length=20)

    @field_validator("title")
    @classmethod
    def check_title(cls, value: str) -> str:
        return _require_non_blank(value, "title")

    @field_validator("description")
    @classmethod
    def check_description(cls, value: str) -> str:
        return _require_non_blank(value, "description")

    @field_validator("department_codes")
    @classmethod
    def check_department_codes(cls, values: list[str]) -> list[str]:
        return [_require_non_blank(item, "department_codes") for item in values]


class SummarizeTicketRequest(BaseModel):
    model_config = ConfigDict(
        allow_inf_nan=False,
        json_schema_extra={
            "example": {
                "domain": "campus_facilities",
                "language": "th",
                "location_name": "อาคารศูนย์เรียนรวม 3 (ศร.3)",
                "category_name": "ไฟฟ้าและแสงสว่าง",
                "current_ticket": {
                    "title": "ตู้ไฟหน้าลิฟต์ ศร.3 ชั้น 2 มีกลิ่นไหม้",
                    "description": "เดินผ่านหน้าลิฟต์ชั้น 2 ได้กลิ่นเหม็นไหม้และมีเสียงช็อตเบา ๆ เป็นระยะ",
                    "severity": "HIGH",
                    "department_codes": ["BUILDINGS_UTILITIES"],
                },
                "reports": [
                    {
                        "report_id": "R-001",
                        "title": "ตู้ไฟหน้าลิฟต์ ศร.3 ชั้น 2 มีกลิ่นไหม้",
                        "description": "เดินผ่านหน้าลิฟต์ชั้น 2 ได้กลิ่นเหม็นไหม้และมีเสียงช็อตเบา ๆ เป็นระยะ",
                        "location_name": "อาคารศูนย์เรียนรวม 3 (ศร.3) ชั้น 2",
                        "observed_severity": "HIGH",
                    },
                    {
                        "report_id": "R-002",
                        "title": "ตู้เบรกเกอร์ ศร.3 ชั้น 2 ร้อนผิดปกติและมีประกายไฟ",
                        "description": "เพิ่งขึ้นลิฟต์มาชั้น 2 ตู้เบรกเกอร์ไฟข้างลิฟต์ร้อนมาก มีกลิ่นไหม้แรง และเห็นประกายไฟเล็กน้อย",
                        "location_name": "อาคารศูนย์เรียนรวม 3 (ศร.3) โถงลิฟต์ชั้น 2",
                        "observed_severity": "CRITICAL",
                    },
                ],
                "categories": [
                    {
                        "code": "ELECTRICAL",
                        "name": "ไฟฟ้าและแสงสว่าง",
                        "description": "ระบบไฟฟ้า ตู้ควบคุม ไฟส่องสว่าง ปลั๊ก และสายไฟ",
                    },
                    {
                        "code": "BUILDING",
                        "name": "อาคารและสถานที่",
                        "description": "โครงสร้างอาคาร ประตู หน้าต่าง ลิฟต์ และเฟอร์นิเจอร์ส่วนกลาง",
                    },
                    {
                        "code": "WATER",
                        "name": "น้ำและท่อระบายน้ำ",
                        "description": "ระบบประปา น้ำรั่ว ท่ออุดตัน และน้ำท่วมขัง",
                    },
                    {
                        "code": "INTERNET",
                        "name": "อินเทอร์เน็ตและอุปกรณ์",
                        "description": "เครือข่าย Wi-Fi KUWIN สาย LAN และอุปกรณ์ไอทีส่วนกลาง",
                    },
                    {
                        "code": "SAFETY",
                        "name": "ความปลอดภัยและการจราจร",
                        "description": "จุดเสี่ยงอันตราย อัคคีภัย สิ่งกีดขวาง และการจราจร",
                    },
                ],
                "departments": [
                    {
                        "code": "BUILDINGS_UTILITIES",
                        "name": "กองอาคารสถานที่และสาธารณูปโภค",
                        "responsibility_scope": "ซ่อมบำรุงระบบไฟฟ้า ตู้ควบคุมไฟ แสงสว่าง ประปา ท่อระบายน้ำ และโครงสร้างอาคารส่วนกลาง",
                        "supported_categories": ["ELECTRICAL", "BUILDING", "WATER"],
                        "location_scope": "อาคารและพื้นที่ส่วนกลาง มก. บางเขน",
                    },
                    {
                        "code": "SAFETY_SECURITY",
                        "name": "งานรักษาความปลอดภัยและจราจร",
                        "responsibility_scope": "กั้นพื้นที่อันตราย ระงับเหตุฉุกเฉินเบื้องต้น อัคคีภัย และความปลอดภัยการสัญจรภายในวิทยาเขต",
                        "supported_categories": ["SAFETY", "ELECTRICAL"],
                        "location_scope": "ทุกพื้นที่ภายใน มก. บางเขน",
                    },
                    {
                        "code": "OCS_NETWORK",
                        "name": "สำนักบริการคอมพิวเตอร์ (เครือข่าย)",
                        "responsibility_scope": "ดูแลระบบอินเทอร์เน็ต Wi-Fi KUWIN เครือข่ายสาย LAN และระบบบัญชีผู้ใช้ไอที",
                        "supported_categories": ["INTERNET"],
                        "location_scope": "ทุกอาคารเรียนและหอสมุด มก. บางเขน",
                    },
                ],
                "department_min_confidence": DEFAULT_DEPARTMENT_MIN_CONFIDENCE,
                "max_recommended_departments": DEFAULT_MAX_RECOMMENDED_DEPARTMENTS,
                "severity_rubric": {
                    "LOW": "ผลกระทบจำกัด ไม่กระทบความปลอดภัยหรือการใช้งานหลัก เช่น ความชำรุดเล็กน้อยหรือความสวยงาม",
                    "MEDIUM": "กระทบความสะดวกหรือการใช้งานบางส่วน แต่ยังมีทางเลือกทดแทน เช่น ไฟบางจุดดับหรืออุปกรณ์บางชิ้นชำรุด",
                    "HIGH": "กระทบการใช้งานหลักของพื้นที่ส่วนกลางหรือผู้ใช้จำนวนมาก เช่น น้ำไม่ไหล อินเทอร์เน็ตล่มทั้งอาคาร หรือลิฟต์ใช้งานไม่ได้",
                    "CRITICAL": "มีความเสี่ยงอันตรายต่อความปลอดภัย ชีวิต หรือทรัพย์สินโดยตรง ต้องรับทราบเร่งด่วน เช่น ไฟฟ้าลัดวงจร/ไฟรั่ว โครงสร้างเสี่ยงถล่ม หรือน้ำท่วมขังบริเวณอุปกรณ์ไฟฟ้า",
                },
                "severity_weights": {
                    "safety_risk": 0.4,
                    "operational_impact": 0.25,
                    "affected_scope": 0.2,
                    "urgency": 0.15,
                },
                "severity_thresholds": {
                    "medium": 0.8,
                    "high": 1.6,
                    "critical": 2.35,
                },
                "safety_override": True,
                "include_embedding": True,
                "report_embeddings": [],
                "report_embedding_meta": {
                    "model": "gemini-embedding-2",
                    "dimensions": 768,
                    "text_version": "v1",
                },
                "summary_weight": 0.6,
                "reports_weight": 0.4,
            }
        },
    )

    domain: str = Field(
        default="campus_facilities",
        min_length=1,
        max_length=80,
        pattern=DOMAIN_PATTERN,
    )
    language: str = Field(
        default="th",
        min_length=2,
        max_length=16,
        pattern=LANGUAGE_PATTERN,
    )
    location_name: str | None = Field(default=None, max_length=200)
    category_name: str | None = Field(default=None, max_length=120)
    current_ticket: CurrentTicketInput | None = None
    reports: list[TicketReportSource] = Field(min_length=1, max_length=50)
    categories: list[CategoryOption] = Field(default_factory=list, max_length=50)
    departments: list[DepartmentOption] = Field(default_factory=list, max_length=50)
    department_min_confidence: float = Field(
        default=DEFAULT_DEPARTMENT_MIN_CONFIDENCE, ge=0.0, le=1.0
    )
    max_recommended_departments: int = Field(
        default=DEFAULT_MAX_RECOMMENDED_DEPARTMENTS,
        ge=1,
        le=MAX_RECOMMENDED_DEPARTMENTS_LIMIT,
    )
    severity_rubric: SeverityRubricInput = Field(default_factory=SeverityRubricInput)
    severity_weights: SeverityWeightsInput = Field(default_factory=SeverityWeightsInput)
    severity_thresholds: SeverityThresholdsInput = Field(default_factory=SeverityThresholdsInput)
    safety_override: bool = True
    include_embedding: bool = True
    report_embeddings: list[list[float]] = Field(default_factory=list, max_length=50)
    report_embedding_meta: EmbeddingIdentity | None = None
    summary_weight: float = Field(default=0.6, ge=0.0, le=1.0)
    reports_weight: float = Field(default=0.4, ge=0.0, le=1.0)

    @field_validator("location_name", "category_name")
    @classmethod
    def normalize_optional_names(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @field_validator("categories")
    @classmethod
    def check_unique_categories(cls, value: list[CategoryOption]) -> list[CategoryOption]:
        return _require_unique_option_codes(value, "categories")

    @field_validator("departments")
    @classmethod
    def check_unique_departments(cls, value: list[DepartmentOption]) -> list[DepartmentOption]:
        return _require_unique_option_codes(value, "departments")

    @model_validator(mode="after")
    def validate_weights_and_vectors(self) -> SummarizeTicketRequest:
        if (self.summary_weight + self.reports_weight) == 0:
            raise ValueError("summary_weight and reports_weight cannot both be zero")
        _validate_report_embeddings(self.report_embeddings, self.report_embedding_meta)
        return self


class ProviderSummarizeTicketOutput(BaseModel):
    ticket_title: str
    ticket_description: str
    classification: ProviderClassification | None = None
    severity: ProviderSeverity
    recommended_departments: list[ProviderDepartmentRecommendation] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)


class SummarizeTicketResponse(BaseModel):
    request_id: str
    provider: str
    model: str
    latency_ms: int = Field(ge=0)
    ticket_title: str
    ticket_description: str
    classification: ClassificationResult | None = None
    severity: SeverityResult
    recommended_departments: list[DepartmentRecommendation] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    blended_embedding: EmbeddingResult | None = None


# ---------------------------------------------------------------------------
# 4. Embed Ticket Only (No LLM call — e.g. after Reviewer edits final Ticket)
# ---------------------------------------------------------------------------


class EmbedTicketRequest(BaseModel):
    model_config = ConfigDict(
        allow_inf_nan=False,
        json_schema_extra={
            "example": {
                "domain": "campus_facilities",
                "title": "ตู้ควบคุมไฟฟ้าหน้าลิฟต์ชั้น 2 อาคาร ศร.3 มีกลิ่นไหม้และเสียงช็อต",
                "description": "พบกลิ่นเหม็นไหม้ เสียงช็อต และความร้อนผิดปกติจากตู้ควบคุมไฟโถงลิฟต์ชั้น 2 อาคาร ศร.3",
                "location_name": "อาคารศูนย์เรียนรวม 3 (ศร.3)",
                "category_name": "ไฟฟ้าและแสงสว่าง",
                "report_embeddings": [],
                "report_embedding_meta": {
                    "model": "gemini-embedding-2",
                    "dimensions": 768,
                    "text_version": "v1",
                },
                "summary_weight": 0.6,
                "reports_weight": 0.4,
            }
        },
    )

    domain: str = Field(
        default="campus_facilities",
        min_length=1,
        max_length=80,
        pattern=DOMAIN_PATTERN,
    )
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4000)
    location_name: str | None = Field(default=None, max_length=200)
    category_name: str | None = Field(default=None, max_length=120)
    report_embeddings: list[list[float]] = Field(default_factory=list, max_length=50)
    report_embedding_meta: EmbeddingIdentity | None = None
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

    @field_validator("location_name", "category_name")
    @classmethod
    def normalize_optional_names(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @model_validator(mode="after")
    def validate_weights_and_vectors(self) -> EmbedTicketRequest:
        if (self.summary_weight + self.reports_weight) == 0:
            raise ValueError("summary_weight and reports_weight cannot both be zero")
        _validate_report_embeddings(self.report_embeddings, self.report_embedding_meta)
        return self


class EmbedTicketResponse(BaseModel):
    request_id: str
    provider: str
    latency_ms: int = Field(ge=0)
    blended_embedding: EmbeddingResult


class FieldError(BaseModel):
    loc: str
    message: str
    type: str


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: list[FieldError] | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail
