from __future__ import annotations

import base64
import math
from dataclasses import dataclass, field
from typing import TypeVar

from fastapi.testclient import TestClient
from pydantic import BaseModel

from campusfix_ai.api.schemas import (
    ImageInput,
    ProviderAlternativeCategory,
    ProviderAnalyzeOutput,
    ProviderClassification,
    ProviderRephraseOutput,
    ProviderSeverity,
    ProviderSummarizeTicketOutput,
)
from campusfix_ai.bootstrap import create_app
from campusfix_ai.config import Settings
from campusfix_ai.providers.base import (
    EmbeddingProviderResult,
    ProviderError,
    ProviderNotConfiguredError,
    ProviderTimeoutError,
    StructuredProviderResult,
)
from campusfix_ai.scoring.severity import (
    SeverityFactors,
    SeverityThresholds,
    SeverityWeights,
    compute_severity,
)
from campusfix_ai.scoring.vectors import l2_normalize, weighted_blend


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0

SchemaT = TypeVar("SchemaT", bound=BaseModel)


@dataclass
class FakeProvider:
    outputs: dict[type[BaseModel], BaseModel] = field(default_factory=dict)
    embedding_values: list[float] = field(default_factory=lambda: [1.0, 0.0, 0.0])
    error: ProviderError | None = None
    generate_calls: int = 0
    embed_calls: int = 0
    last_system: str = ""
    last_user: str = ""
    last_embed_text: str = ""
    last_images_count: int = 0

    @property
    def name(self) -> str:
        return "fake"

    @property
    def model(self) -> str:
        return "fake-llm-v1"

    @property
    def embedding_model(self) -> str:
        return "fake-embed-v1"

    async def generate_structured(
        self,
        *,
        system_instruction: str,
        user_text: str,
        response_schema: type[SchemaT],
        images: list[ImageInput] | None = None,
    ) -> StructuredProviderResult[SchemaT]:
        self.generate_calls += 1
        self.last_system = system_instruction
        self.last_user = user_text
        self.last_images_count = len(images or [])
        if self.error is not None:
            raise self.error
        out = self.outputs[response_schema]
        assert isinstance(out, response_schema)
        return StructuredProviderResult(provider=self.name, model=self.model, output=out)

    async def embed(
        self,
        *,
        text: str,
        images: list[ImageInput] | None = None,
    ) -> EmbeddingProviderResult:
        self.embed_calls += 1
        self.last_embed_text = text
        self.last_images_count = len(images or [])
        if self.error is not None:
            raise self.error
        return EmbeddingProviderResult(
            provider=self.name,
            model=self.embedding_model,
            values=self.embedding_values,
        )


TINY_PNG_B64 = base64.b64encode(
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\nIDATx\x9cc`\x00\x00\x00"
    b"\x02\x00\x01H\xaf\xa4q\x00\x00\x00\x00IEND\xaeB`\x82"
).decode("ascii")


def test_healthz_works_without_api_key() -> None:
    app = create_app(Settings(port=8000, gemini_api_key=""))
    client = TestClient(app)

    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_rephrase_requires_both_title_and_description() -> None:
    fake = FakeProvider(
        outputs={
            ProviderRephraseOutput: ProviderRephraseOutput(
                rephrased_title="ตู้ควบคุมไฟฟ้าโถงลิฟต์ชั้น 2 อาคาร ศร.3 มีกลิ่นไหม้",
                rephrased_description="พบกลิ่นเหม็นไหม้และเสียงช็อตจากตู้ควบคุมไฟฟ้าบริเวณโถงลิฟต์ชั้น 2 อาคาร ศร.3",
            )
        }
    )
    client = TestClient(create_app(Settings(port=8000), provider=fake))

    # Blank title or description must be rejected with 422
    assert (
        client.post(
            "/v1/triage/rephrase",
            json={"title": "   ", "description": "ไฟดับ"},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/v1/triage/rephrase",
            json={"title": "ไฟดับ", "description": ""},
        ).status_code
        == 422
    )

    ok = client.post(
        "/v1/triage/rephrase",
        json={
            "domain": "campus_facilities",
            "title": "ตู้ไฟศร3เหม็นไหม้",
            "description": "เดินผ่านลิฟต์ชั้น 2 ศร.3 เหม็นไหม้ตู้ไฟมีเสียงช็อตด้วย",
            "location": {"name": "อาคารศูนย์เรียนรวม 3 (ศร.3)"},
        },
    )
    assert ok.status_code == 200
    body = ok.json()
    assert body["request_id"].startswith("rephrase_")
    assert body["rephrased_title"].startswith("ตู้ควบคุมไฟฟ้า")
    assert fake.generate_calls == 1
    assert fake.embed_calls == 0


def test_analyze_report_returns_category_severity_and_unit_vector() -> None:
    fake = FakeProvider(
        outputs={
            ProviderAnalyzeOutput: ProviderAnalyzeOutput(
                classification=ProviderClassification(
                    category_code="ELECTRICAL",
                    confidence=1.4,  # clamped to 1.0
                    alternatives=[
                        ProviderAlternativeCategory(category_code="BUILDING", confidence=0.12),
                        ProviderAlternativeCategory(category_code="UNKNOWN", confidence=0.5),
                    ],
                    reason="มีกลิ่นไหม้จากตู้ควบคุมไฟฟ้า",
                ),
                severity=ProviderSeverity(
                    safety_risk=3,
                    operational_impact=2,
                    affected_scope=2,
                    urgency=3,
                    confidence=0.95,
                    reason="มีความเสี่ยงไฟฟ้าลัดวงจรและอันตรายต่อความปลอดภัย",
                ),
                keywords=["ตู้ควบคุมไฟ", "กลิ่นไหม้", "ตู้ควบคุมไฟ", "  ", "ศร.3", "ชั้น 2"],
            )
        },
        embedding_values=[3.0, 4.0, 0.0],
    )
    client = TestClient(create_app(Settings(port=8000), provider=fake))

    res = client.post(
        "/v1/triage/analyze",
        json={
            "domain": "campus_facilities",
            "language": "th",
            "item": {
                "title": "ตู้ไฟหน้าลิฟต์ชั้น 2 ศร.3 มีกลิ่นไหม้",
                "description": "ตู้ไฟหน้าลิฟต์ชั้น 2 ศร.3 มีกลิ่นไหม้และเสียงเปรี๊ยะ ๆ",
                "location": {
                    "name": "อาคารศูนย์เรียนรวม 3 (ศร.3)",
                    "latitude": 13.8476,
                    "longitude": 100.5696,
                },
                "images": [{"mime_type": "image/png", "data_base64": TINY_PNG_B64}],
            },
            "taxonomy": {
                "categories": [
                    {"code": "ELECTRICAL", "name": "ไฟฟ้าและแสงสว่าง"},
                    {"code": "BUILDING", "name": "อาคารและสถานที่"},
                ]
            },
        },
    )

    assert res.status_code == 200
    body = res.json()
    assert body["request_id"].startswith("triage_")
    assert body["model"] == "fake-llm-v1"
    assert fake.generate_calls == 1
    assert fake.embed_calls == 1
    assert fake.last_images_count == 1
    assert body["classification"]["category_code"] == "ELECTRICAL"
    assert body["classification"]["category_name"] == "ไฟฟ้าและแสงสว่าง"
    assert body["classification"]["confidence"] == 1.0
    assert len(body["classification"]["alternatives"]) == 1
    assert body["severity"]["level"] == "CRITICAL"
    assert body["severity"]["safety_override_triggered"] is True
    assert math.isclose(body["severity"]["risk_score"], 2.55, rel_tol=1e-6)
    assert body["severity"]["factors"] == {
        "safety_risk": 3,
        "operational_impact": 2,
        "affected_scope": 2,
        "urgency": 3,
    }
    assert body["keywords"] == ["ตู้ควบคุมไฟ", "กลิ่นไหม้", "ศร.3", "ชั้น 2"]

    vec = body["embedding"]["values"]
    assert body["embedding"]["dimensions"] == 3
    assert math.isclose(vec[0], 0.6, rel_tol=1e-6)
    assert math.isclose(vec[1], 0.8, rel_tol=1e-6)


def test_embed_only_skips_llm_call() -> None:
    fake = FakeProvider(embedding_values=[0.0, 3.0, 4.0])
    client = TestClient(create_app(Settings(port=8000), provider=fake))

    res = client.post(
        "/v1/triage/analyze",
        json={
            "domain": "ku_it_helpdesk",
            "tasks": ["embed"],
            "item": {
                "title": "Wi-Fi KUWIN ใช้งานไม่ได้",
                "description": "Wi-Fi KUWIN ชั้น 4 หอสมุดรับ IP ไม่ได้",
                "location": {"name": "สำนักหอสมุด มก."},
            },
        },
    )

    assert res.status_code == 200
    body = res.json()
    assert fake.generate_calls == 0
    assert fake.embed_calls == 1
    assert body["model"] is None
    assert body["classification"] is None
    assert body["severity"] is None
    assert body["embedding"]["dimensions"] == 3
    assert "สำนักหอสมุด มก." in fake.last_embed_text


def test_summarize_ticket_synthesizes_reports_and_computes_weighted_blend_vector() -> None:
    fake = FakeProvider(
        outputs={
            ProviderSummarizeTicketOutput: ProviderSummarizeTicketOutput(
                ticket_title="ตู้ควบคุมไฟหน้าลิฟต์ชั้น 2 อาคาร ศร.3 มีกลิ่นไหม้และเสียงช็อต",
                ticket_description="ได้รับรายงานหลายรายการว่าตู้ควบคุมไฟบริเวณโถงลิฟต์ชั้น 2 อาคาร ศร.3 มีกลิ่นไหม้ เสียงช็อต และเบรกเกอร์ร้อนผิดปกติ",
            )
        },
        embedding_values=[1.0, 0.0, 0.0],  # summary vector
    )
    client = TestClient(create_app(Settings(port=8000), provider=fake))

    res = client.post(
        "/v1/triage/summarize-ticket",
        json={
            "domain": "campus_facilities",
            "location_name": "อาคารศูนย์เรียนรวม 3 (ศร.3)",
            "category_name": "ไฟฟ้าและแสงสว่าง",
            "reports": [
                {
                    "report_id": "R-001",
                    "title": "ตู้ไฟชั้น 2 ศร.3 มีกลิ่นไหม้",
                    "description": "เดินผ่านหน้าลิฟต์ชั้น 2 ได้กลิ่นเหม็นไหม้และเสียงช็อต",
                },
                {
                    "report_id": "R-002",
                    "title": "ตู้เบรกเกอร์ ศร.3 ร้อนมาก",
                    "description": "หน้าลิฟต์ชั้น 2 ตู้เบรกเกอร์ร้อนผิดปกติและมีกลิ่นไหม้",
                },
            ],
            "include_embedding": True,
            "report_embeddings": [
                [0.0, 1.0, 0.0],
                [0.0, 1.0, 0.0],
            ],
            "summary_weight": 0.6,
            "reports_weight": 0.4,
        },
    )

    assert res.status_code == 200
    body = res.json()
    assert body["request_id"].startswith("ticket_")
    assert fake.generate_calls == 1
    assert fake.embed_calls == 1
    assert body["summary_embedding"]["values"] == [1.0, 0.0, 0.0]

    expected = weighted_blend([1.0, 0.0, 0.0], [[0.0, 1.0, 0.0], [0.0, 1.0, 0.0]])
    blended = body["blended_embedding"]["values"]
    assert all(math.isclose(a, b, rel_tol=1e-6) for a, b in zip(blended, expected, strict=True))
    assert math.isclose(_cosine_similarity(blended, l2_normalize([0.6, 0.4, 0.0])), 1.0, rel_tol=1e-6)


def test_client_api_key_authentication_across_endpoints() -> None:
    fake = FakeProvider(
        outputs={
            ProviderRephraseOutput: ProviderRephraseOutput(
                rephrased_title="หัวข้อใหม่",
                rephrased_description="รายละเอียดใหม่",
            )
        }
    )
    app = create_app(
        Settings(port=8000, client_api_keys=("secret-campusfix", "secret-it")),
        provider=fake,
    )
    client = TestClient(app)
    payload = {"title": "ไฟดับ", "description": "ไฟทางเดินดับ"}

    assert client.post("/v1/triage/rephrase", json=payload).status_code == 401
    assert (
        client.post("/v1/triage/rephrase", json=payload, headers={"X-API-Key": "wrong"}).status_code
        == 401
    )
    assert (
        client.post(
            "/v1/triage/rephrase",
            json=payload,
            headers={"X-API-Key": "secret-it"},
        ).status_code
        == 200
    )


def test_provider_timeout_and_missing_key_return_503() -> None:
    timeout_app = create_app(
        Settings(port=8000),
        provider=FakeProvider(error=ProviderTimeoutError("timed out")),
    )
    res = TestClient(timeout_app).post(
        "/v1/triage/analyze",
        json={"tasks": ["embed"], "item": {"title": "น้ำไม่ไหล", "description": "น้ำไม่ไหลชั้น 2"}},
    )
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "provider_timeout"

    unconfigured_app = create_app(
        Settings(port=8000),
        provider=FakeProvider(error=ProviderNotConfiguredError("missing key")),
    )
    res2 = TestClient(unconfigured_app).post(
        "/v1/triage/rephrase",
        json={"title": "น้ำไม่ไหล", "description": "น้ำไม่ไหลทั้งอาคาร"},
    )
    assert res2.status_code == 503
    assert res2.json()["error"]["code"] == "provider_not_configured"


def test_validation_rejects_missing_categories_and_too_many_images() -> None:
    client = TestClient(create_app(Settings(port=8000), provider=FakeProvider()))

    res = client.post(
        "/v1/triage/analyze",
        json={"tasks": ["classify"], "item": {"title": "ไฟดับ", "description": "ไฟทางเดินดับ"}},
    )
    assert res.status_code == 422

    res_img = client.post(
        "/v1/triage/analyze",
        json={
            "tasks": ["severity"],
            "item": {
                "title": "ไฟดับ",
                "description": "ไฟทางเดินดับ",
                "images": [{"mime_type": "image/png", "data_base64": TINY_PNG_B64}] * 6,
            },
        },
    )
    assert res_img.status_code == 422


def test_deterministic_severity_formula_bands_override_and_custom_weights() -> None:
    low = compute_severity(SeverityFactors(0, 1, 0, 1))
    assert low.level == "LOW"
    assert math.isclose(low.risk_score, 0.40, rel_tol=1e-6)
    assert low.safety_override_triggered is False

    med = compute_severity(SeverityFactors(1, 1, 1, 1))
    assert med.level == "MEDIUM"
    assert math.isclose(med.risk_score, 1.00, rel_tol=1e-6)

    high = compute_severity(SeverityFactors(1, 3, 3, 2))
    assert high.level == "HIGH"
    assert math.isclose(high.risk_score, 2.05, rel_tol=1e-6)

    # Hard safety override: localized deadly electrical hazard forces CRITICAL even if score < 2.35
    override = compute_severity(SeverityFactors(3, 0, 0, 0))
    assert override.level == "CRITICAL"
    assert override.safety_override_triggered is True
    assert math.isclose(override.risk_score, 1.20, rel_tol=1e-6)

    # External IT Helpdesk system can customize weights (e.g. emphasize operational_impact)
    it_weights = SeverityWeights(
        safety_risk=0.10,
        operational_impact=0.50,
        affected_scope=0.25,
        urgency=0.15,
    )
    it_outage = compute_severity(
        SeverityFactors(0, 3, 3, 3),
        weights=it_weights,
        safety_override=True,
    )
    assert it_outage.level == "CRITICAL"
    assert it_outage.safety_override_triggered is False
    assert math.isclose(it_outage.risk_score, 2.70, rel_tol=1e-6)

    # Custom tighter thresholds (e.g. chemistry lab triggers CRITICAL at >= 2.00)
    lab_res = compute_severity(
        SeverityFactors(1, 3, 3, 2),  # risk_score = 2.05 (HIGH by default)
        thresholds=SeverityThresholds(medium=0.70, high=1.40, critical=2.00),
    )
    assert lab_res.level == "CRITICAL"


def test_custom_severity_thresholds_via_api_and_invalid_order_rejected() -> None:
    fake = FakeProvider(
        outputs={
            ProviderAnalyzeOutput: ProviderAnalyzeOutput(
                severity=ProviderSeverity(
                    safety_risk=1,
                    operational_impact=3,
                    affected_scope=3,
                    urgency=2,
                    confidence=0.9,
                    reason="กระทบทั้งชั้น",
                )
            )
        }
    )
    client = TestClient(create_app(Settings(port=8000), provider=fake))

    # Invalid ordering (high >= critical) must return 422
    bad = client.post(
        "/v1/triage/analyze",
        json={
            "tasks": ["severity"],
            "item": {"title": "แล็บไฟดับ", "description": "ไฟดับทั้งห้องปฏิบัติการ"},
            "taxonomy": {
                "severity_thresholds": {"medium": 0.8, "high": 2.5, "critical": 2.0}
            },
        },
    )
    assert bad.status_code == 422

    # Valid custom threshold turns risk_score=2.05 from HIGH into CRITICAL
    ok = client.post(
        "/v1/triage/analyze",
        json={
            "tasks": ["severity"],
            "item": {"title": "แล็บไฟดับ", "description": "ไฟดับทั้งห้องปฏิบัติการ"},
            "taxonomy": {
                "severity_thresholds": {"medium": 0.70, "high": 1.40, "critical": 2.00}
            },
        },
    )
    assert ok.status_code == 200
    assert ok.json()["severity"]["level"] == "CRITICAL"
    assert math.isclose(ok.json()["severity"]["risk_score"], 2.05, rel_tol=1e-6)


def test_embed_ticket_skips_llm_and_computes_weighted_blend() -> None:
    fake = FakeProvider(embedding_values=[1.0, 0.0, 0.0])
    client = TestClient(create_app(Settings(port=8000), provider=fake))

    res = client.post(
        "/v1/triage/embed-ticket",
        json={
            "domain": "campus_facilities",
            "title": "ตู้ควบคุมไฟหน้าลิฟต์ชั้น 2 อาคาร ศร.3 (Reviewer แก้ข้อความแล้ว)",
            "description": "ตรวจสอบพบกลิ่นไหม้และเสียงช็อตจากตู้ควบคุมไฟฟ้าบริเวณหน้าลิฟต์ชั้น 2",
            "location_name": "อาคารศูนย์เรียนรวม 3 (ศร.3)",
            "category_name": "ไฟฟ้าและแสงสว่าง",
            "report_embeddings": [[0.0, 1.0, 0.0]],
            "summary_weight": 0.6,
            "reports_weight": 0.4,
        },
    )

    assert res.status_code == 200
    body = res.json()
    assert body["request_id"].startswith("embed_ticket_")
    assert fake.generate_calls == 0
    assert fake.embed_calls == 1
    assert body["summary_embedding"]["values"] == [1.0, 0.0, 0.0]
    expected = weighted_blend([1.0, 0.0, 0.0], [[0.0, 1.0, 0.0]])
    assert all(
        math.isclose(a, b, rel_tol=1e-6)
        for a, b in zip(body["blended_embedding"]["values"], expected, strict=True)
    )
