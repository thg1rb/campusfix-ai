import type {
  AIAnalysisRun,
  Category,
  Department,
  Report,
  Severity,
  Ticket,
  TicketAIReevaluation,
} from "../../types/domain";
import { isActiveTicket } from "../domain/permissions";

const categoryRules = [
  {
    id: "cat-elec",
    words: ["ไฟ", "ดับ", "หลอดไฟ", "ปลั๊ก", "ไฟรั่ว", "ไฟช็อต", "มืด", "แสงสว่าง"],
    departments: ["dept-bldg"],
  },
  {
    id: "cat-it",
    words: ["wifi", "wi-fi", "เน็ต", "อินเทอร์เน็ต", "สัญญาณ", "เครือข่าย", "โปรเจคเตอร์"],
    departments: ["dept-it"],
  },
  {
    id: "cat-clean",
    words: ["ขยะ", "สกปรก", "เหม็น", "ห้องน้ำ", "เศษอาหาร", "แมลง", "ล้น"],
    departments: ["dept-clean"],
  },
  {
    id: "cat-sec",
    words: ["อันตราย", "มืดมาก", "ลื่น", "ไฟไหม้", "ควัน", "รั้วพัง", "สัตว์มีพิษ", "ขโมย", "กล้อง"],
    departments: ["dept-sec"],
  },
  {
    id: "cat-bldg",
    words: ["น้ำรั่ว", "ท่วม", "ท่อ", "แอร์", "ลิฟต์", "โต๊ะ", "เก้าอี้", "ประตู", "ผนัง", "หลังคา", "ถนน", "หลุม"],
    departments: ["dept-bldg"],
  },
];
const severityRules: [Severity, string[]][] = [
  ["CRITICAL", ["ไฟไหม้", "ไฟดูด", "ไฟช็อต", "ลิฟต์ค้าง", "ถล่ม", "แก๊สรั่ว", "อันตรายร้ายแรง", "บาดเจ็บ"]],
  ["HIGH", ["อันตราย", "ดับหลายดวง", "น้ำท่วม", "ลิฟต์เสีย", "ใช้ไม่ได้ทั้งหมด", "น้ำรั่วหนัก", "มืดมาก"]],
  ["MEDIUM", ["แอร์ไม่เย็น", "wifi ช้า", "น้ำรั่ว", "ขยะล้น", "ไฟดับ", "ประตูเสีย"]],
];
const severityOrder: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

interface AIContext {
  categories: Category[];
  departments: Department[];
  tickets: Ticket[];
  reports: Report[];
}

const segmenter = new Intl.Segmenter("th", { granularity: "grapheme" });
const thaiWords = new Intl.Segmenter("th", { granularity: "word" });
function titleFor(report: Report) {
  const clean = report.description.trim().replace(/\s+/g, " ");
  const place = report.location?.locationName;
  const content = place && !clean.includes(place) ? `${clean} · ${place}` : clean;
  const characters = [...segmenter.segment(content)].map((item) => item.segment);
  return characters.length > 55 ? characters.slice(0, 54).join("").trimEnd() + "…" : content;
}

function classify(report: Report, context: AIContext) {
  const text = [
    report.description,
    ...report.images.map((image) => `${image.fileName} ${image.alt}`),
  ]
    .join(" ")
    .toLowerCase();
  const ranked = categoryRules
    .filter((rule) => context.categories.some((cat) => cat.id === rule.id && cat.isActive))
    .map((rule) => ({ ...rule, count: rule.words.filter((word) => text.includes(word)).length }))
    .filter((rule) => rule.count > 0)
    .sort((a, b) => b.count - a.count);
  const best = ranked[0];
  const safety = /มืด|อันตราย/.test(text) && /ทางเดิน|หอพัก|ถนน/.test(text);
  const equipment = /โปรเจคเตอร์|เก้าอี้|โต๊ะ/.test(text);
  const recommendations = [
    ...new Set([
      ...(best?.departments ?? ["dept-bldg"]),
      ...(safety ? ["dept-sec"] : []),
      ...(equipment ? ["dept-av"] : []),
    ]),
  ]
    .filter((id) => context.departments.some((dept) => dept.id === id && dept.isActive))
    .slice(0, 2);
  const severityRule = severityRules.find(([, words]) => words.some((word) => text.includes(word)));
  const cue = severityRule?.[1].find((word) => text.includes(word));
  return {
    suggestedTitle: titleFor(report),
    suggestedSummary: report.description.trim(),
    suggestedCategoryId:
      best?.id ??
      context.categories.find((cat) => cat.id === "cat-other" && cat.isActive)?.id ??
      context.categories.find((cat) => cat.isActive)?.id ??
      "",
    suggestedSeverity: severityRule?.[0] ?? ("LOW" as Severity),
    recommendedDepartmentIds: recommendations,
    categoryConfidence: best ? Math.min(94, 64 + best.count * 7) : 62,
    alternativeCategoryId: ranked[1]?.id ?? null,
    severityRationale: cue ? `พบคำว่า “${cue}” ในข้อมูลที่แจ้ง` : "ลักษณะปัญหาเบื้องต้นเข้าข่ายงานบำรุงรักษาทั่วไป",
  };
}

function textTokens(value: string) {
  const words = [...thaiWords.segment(value.toLowerCase())]
    .filter((item) => item.isWordLike)
    .map((item) => item.segment);
  return new Set([...words, ...words.slice(1).map((word, index) => words[index] + word)]);
}

function overlap(a: Set<string>, b: Set<string>) {
  const length = Math.min(a.size, b.size);
  return length ? [...a].filter((token) => b.has(token)).length / length : 0;
}

function meters(a: NonNullable<Report["location"]>, b: Ticket["location"]) {
  const r = Math.PI / 180;
  const haversine =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(haversine));
}

function duplicateScore(
  report: Report,
  ticket: Ticket,
  related: Report[],
  categoryId: string,
  now: string,
) {
  if (!report.location) return 0;
  const tokens = textTokens(report.description);
  const descriptions = [ticket.title, ticket.summary, ...related.map((item) => item.description)];
  const text = Math.max(
    ...descriptions.map((description) => overlap(tokens, textTokens(description))),
  );
  const distance = meters(report.location, ticket.location);
  const sameLocation =
    report.location.locationId && report.location.locationId === ticket.location.locationId;
  const location =
    distance <= 50 ? 1 : sameLocation ? 0.9 : distance <= 150 ? 0.7 : distance <= 300 ? 0.3 : 0;
  const age = Math.max(0, Date.parse(now) - Date.parse(ticket.confirmedAt)) / 86400000;
  const time = age <= 3 ? 1 : age <= 7 ? 0.5 : 0.2;
  return text * 0.5 + location * 0.3 + (ticket.categoryId === categoryId ? 0.1 : 0) + time * 0.1;
}

function rankTickets(report: Report, context: AIContext, now: string, categoryId: string) {
  return context.tickets
    .filter((ticket) => isActiveTicket(ticket.status))
    .map((ticket) => ({
      ticketId: ticket.id,
      similarity:
        duplicateScore(
          report,
          ticket,
          context.reports.filter(
            (item) => item.status === "CONFIRMED" && item.ticketId === ticket.id,
          ),
          categoryId,
          now,
        ) * 100,
    }))
    .sort((a, b) => b.similarity - a.similarity || a.ticketId.localeCompare(b.ticketId))
    .slice(0, 3);
}

export function rankSimilarActiveTickets(
  report: Report,
  context: AIContext,
  now: string,
  categoryId?: string,
) {
  return rankTickets(
    report,
    context,
    now,
    categoryId ?? classify(report, context).suggestedCategoryId,
  );
}

export function analyzeReport(
  report: Report,
  context: AIContext,
  failure: boolean,
  now: string,
): AIAnalysisRun {
  const base = {
    id: `ai-${report.id}-${report.version}`,
    reportId: report.id,
    reportVersion: report.version,
    isOutdated: false,
    createdAt: now,
  };
  if (failure)
    return {
      ...base,
      status: "FAILED",
      generatedReportTitle: null,
      suggestedCategoryId: null,
      alternativeCategoryId: null,
      categoryConfidence: null,
      suggestedSeverity: null,
      severityRationale: null,
      recommendedDepartmentIds: [],
      matchDecision: null,
      candidateTicketId: null,
      candidateSimilarity: null,
      ticketCandidateDraft: null,
      errorMessage: "บริการ AI ไม่ตอบสนอง (จำลองความขัดข้อง)",
    };
  const candidate = classify(report, context);
  const similarCandidates = rankTickets(report, context, now, candidate.suggestedCategoryId);
  const top = similarCandidates[0];
  const best = top && top.similarity >= 0.58 * 100 ? top : undefined;
  return {
    ...base,
    status: "COMPLETED",
    generatedReportTitle: candidate.suggestedTitle,
    suggestedCategoryId: candidate.suggestedCategoryId || null,
    categoryConfidence: candidate.categoryConfidence,
    alternativeCategoryId: candidate.alternativeCategoryId,
    suggestedSeverity: candidate.suggestedSeverity,
    severityRationale: candidate.severityRationale,
    recommendedDepartmentIds: candidate.recommendedDepartmentIds,
    matchDecision: best ? "MATCHED" : "NO_MATCH",
    candidateTicketId: best?.ticketId ?? null,
    candidateSimilarity: best ? Math.round(best.similarity) : null,
    similarCandidates,
    ticketCandidateDraft: best
      ? null
      : {
          suggestedTitle: candidate.suggestedTitle,
          suggestedSummary: candidate.suggestedSummary,
          suggestedCategoryId: candidate.suggestedCategoryId,
          suggestedSeverity: candidate.suggestedSeverity,
          recommendedDepartmentIds: candidate.recommendedDepartmentIds,
        },
    errorMessage: null,
  };
}

export function reevaluateTicket(
  ticket: Ticket,
  trigger: Report,
  context: AIContext,
  failure: boolean,
  now: string,
): TicketAIReevaluation {
  const base = {
    id: `reeval-${trigger.id}-${trigger.version}`,
    ticketId: ticket.id,
    triggeredByReportId: trigger.id,
    isReviewed: false,
    createdAt: now,
  };
  if (failure)
    return {
      ...base,
      status: "FAILED",
      suggestedTitle: null,
      suggestedSummary: null,
      suggestedSeverity: null,
      recommendedDepartmentIds: [],
      rationale: "บริการ AI ไม่ตอบสนอง (จำลองความขัดข้อง)",
    };
  const candidates = context.reports
    .filter((report) => report.ticketId === ticket.id && report.status === "CONFIRMED")
    .map((report) => classify(report, context));
  const strongest = candidates.reduce(
    (best, item) =>
      severityOrder.indexOf(item.suggestedSeverity) > severityOrder.indexOf(best.suggestedSeverity)
        ? item
        : best,
    classify(trigger, context),
  );
  return {
    ...base,
    status: "COMPLETED",
    suggestedTitle: strongest.suggestedTitle,
    suggestedSummary: [...new Set(candidates.map((item) => item.suggestedSummary))].join("\n"),
    suggestedSeverity: strongest.suggestedSeverity,
    rationale: strongest.severityRationale,
    recommendedDepartmentIds: [
      ...new Set(candidates.flatMap((item) => item.recommendedDepartmentIds)),
    ],
  };
}
