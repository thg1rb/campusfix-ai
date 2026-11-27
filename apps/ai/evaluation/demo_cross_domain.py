"""Live end-to-end demo for all 3 Pluggable AI endpoints:
1. POST /v1/triage/rephrase         (Optional user text rephrasing)
2. POST /v1/triage/analyze          (Category + Severity + Report Embedding Vector)
3. POST /v1/triage/summarize-ticket (Multi-report Ticket Title/Description + Ticket-level Severity + Weighted-Blend Ticket Vector)

Run from apps/ai:
    uv run --locked --env-file .env python evaluation/demo_cross_domain.py
"""

from __future__ import annotations

import asyncio
import json
import math

from ku_spot_ai.api.schemas import (
    RephraseRequest,
    SummarizeTicketRequest,
    TriageAnalyzeRequest,
)
from ku_spot_ai.application.triage_service import TriageService
from ku_spot_ai.config import Settings
from ku_spot_ai.providers.gemini import GeminiTriageProvider


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0


CAMPUS_CATEGORIES = [
    {"code": "ELECTRICAL", "name": "ไฟฟ้าและแสงสว่าง"},
    {"code": "BUILDING", "name": "อาคารและสถานที่"},
    {"code": "WATER", "name": "น้ำและท่อระบายน้ำ"},
    {"code": "INTERNET", "name": "อินเทอร์เน็ตและอุปกรณ์"},
    {"code": "SAFETY", "name": "ความปลอดภัยและการจราจร"},
]

CAMPUS_DEPARTMENTS = [
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
]


def _truncate_embedding(dumped: dict, key: str) -> None:
    if dumped.get(key) and isinstance(dumped[key].get("values"), list):
        dumped[key]["values"] = [round(v, 5) for v in dumped[key]["values"][:5]] + ["..."]


async def main() -> None:
    settings = Settings.load()
    provider = GeminiTriageProvider(
        api_key=settings.gemini_api_key,
        model=settings.gemini_model,
        embedding_model=settings.gemini_embedding_model,
        embedding_dimensions=settings.gemini_embedding_dimensions,
        timeout_seconds=settings.timeout_seconds,
    )
    service = TriageService(provider)
    try:
        # 1. Optional Rephrase before submit
        print("\n=== Step 1: /v1/triage/rephrase (Optional before submit) ===")
        rephrase_res = await service.rephrase(
            RephraseRequest.model_validate(
                {
                    "domain": "campus_facilities",
                    "title": "ตู้ไฟ ศร3 ชั้น2 เหม็นไหม้",
                    "description": "เดินผ่านหน้าลิฟต์ชั้น 2 ตึก ศร.3 ได้กลิ่นเหม็นไหม้ออกมาจากตู้ควบคุมไฟ มีเสียงช็อตเปรี๊ยะๆ เป็นระยะ น่ากลัวมาก",
                    "location": {"name": "อาคารศูนย์เรียนรวม 3 (ศร.3)"},
                }
            )
        )
        print(json.dumps(rephrase_res.model_dump(), ensure_ascii=False, indent=2))

        # 2. Analyze Report #1 + Report #2 (Category + Severity + Departments + Report Embedding Vector)
        print("\n=== Step 2: /v1/triage/analyze (Report #1: KU Spot) ===")
        report1_res = await service.analyze(
            TriageAnalyzeRequest.model_validate(
                {
                    "domain": "campus_facilities",
                    "tasks": ["classify", "severity", "departments", "keywords", "embed"],
                    "item": {
                        "title": rephrase_res.rephrased_title,
                        "description": rephrase_res.rephrased_description,
                        "location": {"name": "อาคารศูนย์เรียนรวม 3 (ศร.3)"},
                    },
                    "taxonomy": {
                        "categories": CAMPUS_CATEGORIES,
                        "departments": CAMPUS_DEPARTMENTS,
                    },
                }
            )
        )
        r1_dump = report1_res.model_dump()
        _truncate_embedding(r1_dump, "embedding")
        print(json.dumps(r1_dump, ensure_ascii=False, indent=2))

        report2_res = await service.analyze(
            TriageAnalyzeRequest.model_validate(
                {
                    "domain": "campus_facilities",
                    "tasks": ["severity", "embed"],
                    "item": {
                        "title": "ตู้เบรกเกอร์หน้าลิฟต์ ศร.3 ชั้น 2 ร้อนและมีกลิ่นไหม้",
                        "description": "เพิ่งขึ้นลิฟต์มาชั้น 2 ศร.3 ตู้เบรกเกอร์ไฟข้างลิฟต์ร้อนผิดปกติและมีกลิ่นไหม้",
                        "location": {"name": "อาคารศูนย์เรียนรวม 3 (ศร.3)"},
                    },
                }
            )
        )

        # 3. Summarize Ticket from all reports + Ticket-level Severity + Departments + Weighted-Blend Vector
        print(
            "\n=== Step 3: /v1/triage/summarize-ticket (Ticket Severity + Departments + Blended Vector) ==="
        )
        assert report1_res.embedding is not None and report2_res.embedding is not None
        assert report1_res.severity is not None and report2_res.severity is not None
        ticket_res = await service.summarize_ticket(
            SummarizeTicketRequest.model_validate(
                {
                    "domain": "campus_facilities",
                    "location_name": "อาคารศูนย์เรียนรวม 3 (ศร.3)",
                    "category_name": "ไฟฟ้าและแสงสว่าง",
                    "current_ticket": {
                        "title": rephrase_res.rephrased_title,
                        "description": rephrase_res.rephrased_description,
                        "severity": report1_res.severity.level,
                        "department_codes": [
                            d.department_code for d in report1_res.recommended_departments
                        ],
                    },
                    "reports": [
                        {
                            "report_id": "R-001",
                            "title": rephrase_res.rephrased_title,
                            "description": rephrase_res.rephrased_description,
                            "observed_severity": report1_res.severity.level,
                        },
                        {
                            "report_id": "R-002",
                            "title": "ตู้เบรกเกอร์หน้าลิฟต์ ศร.3 ชั้น 2 ร้อนและมีกลิ่นไหม้",
                            "description": "เพิ่งขึ้นลิฟต์มาชั้น 2 ศร.3 ตู้เบรกเกอร์ไฟข้างลิฟต์ร้อนผิดปกติและมีกลิ่นไหม้",
                            "observed_severity": report2_res.severity.level,
                        },
                    ],
                    "categories": CAMPUS_CATEGORIES,
                    "departments": CAMPUS_DEPARTMENTS,
                    "include_embedding": True,
                    "report_embeddings": [
                        report1_res.embedding.values,
                        report2_res.embedding.values,
                    ],
                    "report_embedding_meta": {
                        "model": report1_res.embedding.model,
                        "dimensions": report1_res.embedding.dimensions,
                        "text_version": report1_res.embedding.text_version,
                    },
                }
            )
        )
        t_dump = ticket_res.model_dump()
        _truncate_embedding(t_dump, "blended_embedding")
        print(json.dumps(t_dump, ensure_ascii=False, indent=2))

        # 4. External System Demo (IT Helpdesk) + Cosine comparison against Blended Ticket Vector
        print("\n=== Step 4: External System (IT Helpdesk) + Cosine Check ===")
        it_res = await service.analyze(
            TriageAnalyzeRequest.model_validate(
                {
                    "domain": "ku_it_helpdesk",
                    "item": {
                        "title": "Wi-Fi KUWIN ชั้น 4 หอสมุดเชื่อมไม่ได้",
                        "description": "นิสิตทั้งห้องเรียนชั้น 4 หอสมุดกลางเชื่อมต่อ Wi-Fi KUWIN ไม่ได้ตั้งแต่ 9 โมง รับ IP ไม่ได้",
                        "location": {"name": "สำนักหอสมุด มก. ชั้น 4"},
                    },
                    "taxonomy": {
                        "categories": [
                            {"code": "NETWORK", "name": "เครือข่ายและ Wi-Fi"},
                            {"code": "ACCOUNT", "name": "บัญชีผู้ใช้และ SSO"},
                        ]
                    },
                }
            )
        )
        it_dump = it_res.model_dump()
        _truncate_embedding(it_dump, "embedding")
        print(json.dumps(it_dump, ensure_ascii=False, indent=2))

        dup_probe = await service.analyze(
            TriageAnalyzeRequest.model_validate(
                {
                    "domain": "campus_facilities",
                    "tasks": ["embed"],
                    "item": {
                        "title": "ไฟช็อตหน้าลิฟต์ชั้น 2 ศร.3",
                        "description": "ได้กลิ่นไหม้จากตู้ไฟใกล้ลิฟต์ชั้น 2 ตึก ศร.3",
                        "location": {"name": "อาคารศูนย์เรียนรวม 3 (ศร.3)"},
                    },
                }
            )
        )
        assert ticket_res.blended_embedding is not None
        assert dup_probe.embedding is not None and it_res.embedding is not None
        sim_dup = _cosine_similarity(
            dup_probe.embedding.values, ticket_res.blended_embedding.values
        )
        sim_diff = _cosine_similarity(it_res.embedding.values, ticket_res.blended_embedding.values)
        print(f"\nCosine vs Blended Ticket Vector (Duplicate ศร.3 report): {sim_dup:.4f}")
        print(f"Cosine vs Blended Ticket Vector (Unrelated IT Wi-Fi):    {sim_diff:.4f}")
    finally:
        await provider.aclose()


if __name__ == "__main__":
    asyncio.run(main())
