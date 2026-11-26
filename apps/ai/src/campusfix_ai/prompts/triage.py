from __future__ import annotations

import json
from dataclasses import dataclass

from campusfix_ai.api.schemas import (
    RephraseRequest,
    SeverityLevel,
    SummarizeTicketRequest,
    TriageAnalyzeRequest,
)

DEFAULT_SEVERITY_RUBRIC: dict[SeverityLevel, str] = {
    "LOW": "ผลกระทบจำกัด ไม่กระทบความปลอดภัยหรือการใช้งานหลัก เช่น ความชำรุดเล็กน้อยหรือความสวยงาม",
    "MEDIUM": "กระทบความสะดวกหรือการใช้งานบางส่วน แต่ยังมีทางเลือกทดแทน เช่น ไฟบางจุดดับหรืออุปกรณ์บางชิ้นชำรุด",
    "HIGH": "กระทบการใช้งานหลักของพื้นที่ส่วนกลางหรือผู้ใช้จำนวนมาก เช่น น้ำไม่ไหล อินเทอร์เน็ตล่มทั้งอาคาร หรือลิฟต์ใช้งานไม่ได้",
    "CRITICAL": "มีความเสี่ยงอันตรายต่อความปลอดภัย ชีวิต หรือทรัพย์สินโดยตรง ต้องรับทราบเร่งด่วน เช่น ไฟฟ้าลัดวงจร/ไฟรั่ว โครงสร้างเสี่ยงถล่ม หรือน้ำท่วมขังบริเวณอุปกรณ์ไฟฟ้า",
}


@dataclass(frozen=True)
class BuiltPrompt:
    system_instruction: str
    user_text: str


def build_rephrase_prompts(request: RephraseRequest) -> BuiltPrompt:
    system_lines = [
        "You are a careful writing assistant for university issue reporting systems.",
        f"Target domain: {request.domain}",
        f"Output language: {request.language}",
        "",
        "Strict rules:",
        "1. Return ONLY valid JSON matching the requested schema.",
        "2. Rewrite the user's title and description to be clear, polite, concise, and easy to understand.",
        "3. Preserve every factual detail (location, floor, room, symptoms, time, severity cues).",
        "4. NEVER invent facts, locations, numbers, or causes that the user did not mention.",
        "5. Keep rephrased_title concise (<= 120 characters when possible) and natural.",
    ]

    payload: dict[str, object] = {
        "title": request.title,
        "description": request.description,
        "location": request.location.model_dump(exclude_none=True)
        if request.location
        else None,
    }

    user_text = (
        "Rephrase the following report title and description without adding or changing facts.\n\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
    )
    return BuiltPrompt(
        system_instruction="\n".join(system_lines),
        user_text=user_text,
    )


SEVERITY_FACTOR_GUIDE: dict[str, dict[str, str]] = {
    "safety_risk": {
        "0": "ไม่มีความเสี่ยงอันตราย (ความชำรุดเล็กน้อยหรือความสวยงาม)",
        "1": "เสี่ยงเล็กน้อย (เช่น ทางเดินมืดบางจุด อุปกรณ์หลวมเล็กน้อย)",
        "2": "เสี่ยงบาดเจ็บหรือทรัพย์สินเสียหายรุนแรง (เช่น พื้นลื่นน้ำขัง ฝาท่อเผยอ ลิฟต์ค้าง)",
        "3": "อันตรายร้ายแรงต่อชีวิต/ทรัพย์สินโดยตรงทันที (เช่น ไฟฟ้าลัดวงจร/กลิ่นไหม้/ไฟรั่ว โครงสร้างเสี่ยงถล่ม น้ำท่วมอุปกรณ์ไฟฟ้า)",
    },
    "operational_impact": {
        "0": "ไม่กระทบการใช้งานหลัก",
        "1": "กระทบความสะดวกบางส่วน แต่ยังมีทางเลือกทดแทน",
        "2": "กระทบการใช้งานหลักของห้องหรือโซนนั้นอย่างชัดเจน",
        "3": "ระบบหรือพื้นที่ส่วนกลางหลักใช้งานไม่ได้เลย (เช่น น้ำไม่ไหลทั้งอาคาร อินเทอร์เน็ตล่มทั้งอาคาร ลิฟต์ใช้ไม่ได้)",
    },
    "affected_scope": {
        "0": "จุดเดียวหรืออุปกรณ์ชิ้นเดียว",
        "1": "ห้องเดียวหรือกลุ่มผู้ใช้ย่อย",
        "2": "ทั้งชั้นหรือหลายห้อง",
        "3": "ทั้งอาคาร พื้นที่ส่วนกลางขนาดใหญ่ หรือทางสัญจรหลัก",
    },
    "urgency": {
        "0": "รอแก้ไขตามรอบบำรุงรักษาปกติได้",
        "1": "ควรแก้ไขภายในไม่กี่วัน",
        "2": "ควรแก้ไขภายในวันเดียวกัน",
        "3": "ต้องรับทราบหรือกั้นพื้นที่ทันที (กำลังลุกลามหรือเสี่ยงเกิดอุบัติเหตุตลอดเวลา)",
    },
}


def build_analyze_prompts(request: TriageAnalyzeRequest) -> BuiltPrompt:
    custom_rubric = request.taxonomy.severity_rubric.model_dump(exclude_none=True)
    rubric = {**DEFAULT_SEVERITY_RUBRIC, **custom_rubric}
    llm_tasks = [t for t in request.tasks if t != "embed"]
    tasks_str = ", ".join(llm_tasks)

    system_lines = [
        "You are an advisory incident triage AI engine for university reporting systems.",
        "You NEVER take operational actions; your output is a structured suggestion reviewed by a human.",
        f"Target domain: {request.domain}",
        f"Response language for reasons: {request.language}",
        f"Requested tasks: [{tasks_str}]",
        "",
        "Strict rules:",
        "1. Return ONLY valid JSON matching the requested schema.",
        "2. All confidence scores must be calibrated decimals between 0.0 and 1.0.",
        "3. For 'classify': choose category_code strictly from the provided categories list (the closest matching category). Provide up to 2 plausible alternatives if confidence < 0.9.",
        "4. For 'severity': DO NOT guess a single severity label. Instead, score each of the 4 objective risk factors as an integer from 0 to 3 strictly using severity_factor_guide and observed evidence (title, description, images, location). Never inflate scores based on report count.",
        "5. For 'keywords': extract 3 to 8 concise, deduplicated keywords/keyphrases (specific equipment, symptoms, building/room/floor identifiers) suitable for Thai/English keyword matching. Preserve exact room/floor numbers.",
        "6. If a task is not in requested tasks, set its field to null (or [] for keywords).",
    ]

    payload: dict[str, object] = {
        "tasks": llm_tasks,
        "incoming_report": {
            "title": request.item.title,
            "description": request.item.description,
            "location": request.item.location.model_dump(exclude_none=True)
            if request.item.location
            else None,
            "image_count": len(request.item.images),
            "metadata": request.item.metadata or None,
        },
        "categories": [
            c.model_dump(exclude_none=True) for c in request.taxonomy.categories
        ],
        "severity_factor_guide": SEVERITY_FACTOR_GUIDE,
        "severity_rubric_context": rubric,
    }

    user_text = (
        "Analyze the following incoming report (together with any attached images) "
        "and produce the structured triage JSON.\n\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
    )

    return BuiltPrompt(
        system_instruction="\n".join(system_lines),
        user_text=user_text,
    )


def build_summarize_ticket_prompts(request: SummarizeTicketRequest) -> BuiltPrompt:
    system_lines = [
        "You are an advisory incident summarization AI engine for university issue tracking.",
        "Your output is a proposed Ticket Title and Ticket Description for a human Reviewer to confirm or edit.",
        f"Target domain: {request.domain}",
        f"Output language: {request.language}",
        "",
        "Strict rules:",
        "1. Return ONLY valid JSON matching the requested schema.",
        "2. Synthesize ALL provided reports into one coherent, factual, non-redundant ticket_title and ticket_description.",
        "3. Merge complementary details from different reports (e.g., exact room/floor, symptoms, affected area) without duplicating sentences.",
        "4. NEVER invent facts not present in the provided reports or current_ticket.",
        "5. Keep ticket_title concise and informative; keep ticket_description clear and neutral.",
        "6. Extract 3 to 8 concise, deduplicated keywords/keyphrases (equipment, symptoms, building/room/floor identifiers) into keywords for downstream keyword matching.",
    ]

    payload: dict[str, object] = {
        "category_name": request.category_name,
        "location_name": request.location_name,
        "current_ticket": request.current_ticket.model_dump(exclude_none=True)
        if request.current_ticket
        else None,
        "reports": [r.model_dump(exclude_none=True) for r in request.reports],
    }

    user_text = (
        "Synthesize all reports below into a proposed ticket_title and ticket_description.\n\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
    )
    return BuiltPrompt(
        system_instruction="\n".join(system_lines),
        user_text=user_text,
    )


def build_report_embedding_text(request: TriageAnalyzeRequest) -> str:
    parts = [f"domain: {request.domain}"]
    if request.item.location and request.item.location.name:
        parts.append(f"location: {request.item.location.name.strip()}")
    parts.append(f"title: {request.item.title}")
    parts.append(f"description: {request.item.description}")
    return "\n".join(parts)


def build_ticket_embedding_text(
    *,
    domain: str,
    title: str,
    description: str,
    location_name: str | None = None,
    category_name: str | None = None,
) -> str:
    parts = [f"domain: {domain}"]
    if category_name:
        parts.append(f"category: {category_name.strip()}")
    if location_name:
        parts.append(f"location: {location_name.strip()}")
    parts.append(f"title: {title.strip()}")
    parts.append(f"description: {description.strip()}")
    return "\n".join(parts)
