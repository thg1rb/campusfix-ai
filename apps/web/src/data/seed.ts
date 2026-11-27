import type {
  AIAnalysisRun,
  AuditLogEntry,
  CampusLocation,
  Category,
  Department,
  EmailNotificationLog,
  FeedbackSubmission,
  PublicActivityEvent,
  Report,
  ReportImage,
  Role,
  Severity,
  ThreadMessage,
  Ticket,
  TicketAffected,
  TicketStatus,
  User,
} from "../types/domain";
import { analyzeReport } from "../lib/ai/mockAiService";
import { platformName } from "../lib/brand";
import {
  bangkokYear,
  formatNumber,
  issueNumber,
  reserveNumber,
  type NumberSequences,
} from "../lib/domain/numbers";

export const demoRejectionReportId = "seed-report-18";
export const demoRejectionReasonPrefix = "เป็นข้อร้องเรียนส่วนบุคคลซึ่งอยู่นอกขอบเขตของระบบ ";
export const demoRejectionReason = demoRejectionReasonPrefix + platformName;

const locations: CampusLocation[] = [
  {
    id: "loc-sr1",
    name: "อาคารเรียนรวม 1 (ศร.1)",
    type: "BUILDING",
    lat: 13.8479,
    lng: 100.5693,
    isActive: true,
  },
  {
    id: "loc-sr3",
    name: "อาคารเรียนรวม 3 (ศร.3)",
    type: "BUILDING",
    lat: 13.8468,
    lng: 100.5712,
    isActive: true,
  },
  {
    id: "loc-dorm-m",
    name: "บริเวณหอพักนิสิตชาย",
    type: "BUILDING",
    lat: 13.8438,
    lng: 100.5724,
    isActive: true,
  },
  {
    id: "loc-lib",
    name: "สำนักหอสมุด มก.",
    type: "BUILDING",
    lat: 13.8489,
    lng: 100.5698,
    isActive: true,
  },
  {
    id: "loc-eng",
    name: "อาคารชูชาติ กำภู (คณะวิศวกรรมศาสตร์)",
    type: "BUILDING",
    lat: 13.8459,
    lng: 100.5701,
    isActive: true,
  },
  {
    id: "loc-barmai",
    name: "ศูนย์อาหารกลาง 1 (บาร์ใหม่)",
    type: "COMMON_AREA",
    lat: 13.8473,
    lng: 100.5708,
    isActive: true,
  },
  {
    id: "loc-chak",
    name: "อาคารจักรพันธ์เพ็ญศิริ",
    type: "BUILDING",
    lat: 13.8511,
    lng: 100.5685,
    isActive: true,
  },
  {
    id: "loc-rd-chuchat",
    name: "ถนนชูชาติกำภู (แนวทางเดินหลัก)",
    type: "ROAD",
    lat: 13.8463,
    lng: 100.5692,
    isActive: true,
  },
  {
    id: "loc-park-it",
    name: "ลานจอดรถหน้าอาคารสำนักบริการคอมพิวเตอร์",
    type: "SERVICE_POINT",
    lat: 13.8495,
    lng: 100.5715,
    isActive: true,
  },
  {
    id: "loc-plaza",
    name: "ลานอนุสาวรีย์สามบูรพาจารย์",
    type: "ACTIVITY_PLAZA",
    lat: 13.8483,
    lng: 100.5679,
    isActive: true,
  },
];

const categories: Category[] = [
  {
    id: "cat-bldg",
    name: "อาคารและสถานที่",
    description: "อาคารและสถานที่",
    isActive: true,
  },
  {
    id: "cat-elec",
    name: "ไฟฟ้าและแสงสว่าง",
    description: "ไฟฟ้าและแสงสว่าง",
    isActive: true,
  },
  {
    id: "cat-clean",
    name: "ความสะอาด",
    description: "ความสะอาด",
    isActive: true,
  },
  {
    id: "cat-it",
    name: "อินเทอร์เน็ตและระบบสารสนเทศ",
    description: "อินเทอร์เน็ตและระบบสารสนเทศ",
    isActive: true,
  },
  {
    id: "cat-sec",
    name: "ความปลอดภัย",
    description: "ความปลอดภัย",
    isActive: true,
  },
  {
    id: "cat-other",
    name: "อื่น ๆ",
    description: "อื่น ๆ",
    isActive: true,
  },
];

const departments: Department[] = [
  {
    id: "dept-bldg",
    name: "กองอาคารสถานที่",
    responsibilityScope: "ซ่อมบำรุงอาคาร ไฟฟ้าแสงสว่าง ประปา แอร์ ลิฟต์ ถนน และท่อระบายน้ำ",
    isActive: true,
  },
  {
    id: "dept-it",
    name: "สำนักบริการคอมพิวเตอร์",
    responsibilityScope: "เครือข่าย KU-WiFi ระบบสารสนเทศ และจุดกระจายสัญญาณภายในวิทยาเขต",
    isActive: true,
  },
  {
    id: "dept-clean",
    name: "งานรักษาความสะอาดและภูมิทัศน์",
    responsibilityScope: "จัดเก็บขยะ ทำความสะอาดพื้นที่ส่วนกลาง ห้องน้ำ และดูแลต้นไม้/ภูมิทัศน์",
    isActive: true,
  },
  {
    id: "dept-sec",
    name: "งานรักษาความปลอดภัยและจราจร",
    responsibilityScope: "ความปลอดภัยพื้นที่ จุดเสี่ยงแสงสว่างน้อย การจราจร และพื้นที่จอดรถ",
    isActive: true,
  },
  {
    id: "dept-av",
    name: "งานโสตทัศนูปกรณ์และห้องเรียน",
    responsibilityScope: "อุปกรณ์การเรียนการสอน โต๊ะ เก้าอี้ โปรเจคเตอร์ และไมโครโฟนในอาคารเรียนรวม",
    isActive: true,
  },
];

const personas: [string, string, string, Role[], string | null][] = [
  ["usr-rep1", "nattapong_ku", "ณัฐพงศ์ ใจดี", ["REPORTER"], null],
  ["usr-rep2", "suda_eng67", "สุดา พัฒนกิจ", ["REPORTER"], null],
  ["usr-rev1", "somchai_rev", "สมชาย รัตนวงศ์", ["REVIEWER"], null],
  ["usr-multi-rev", "ploy_reviewer", "พลอยไพลิน สุขสันต์", ["REPORTER", "REVIEWER"], null],
  ["usr-dept-bldg", "wichai_bldg", "วิชัย ช่างซ่อม", ["REPORTER", "DEPARTMENT_STAFF"], "dept-bldg"],
  ["usr-dept-it", "kanya_it", "กัญญา เครือข่าย", ["DEPARTMENT_STAFF"], "dept-it"],
  ["usr-admin", "admin_ku", "อรุณ ผู้ดูแลระบบ", ["ADMINISTRATOR"], null],
];

type SeedIssue = [string, string, TicketStatus, string, Severity, string, string[], string];
const issues: SeedIssue[] = [
  [
    "ไฟทางเดินหน้าหอพักนิสิตชายดับหลายดวง ช่วงค่ำมืดและเสี่ยงอันตราย",
    "ไฟทางเดินหน้าหอพักนิสิตชายดับหลายดวง ทำให้ทางเดินมืดในช่วงค่ำ",
    "IN_PROGRESS",
    "cat-elec",
    "HIGH",
    "loc-dorm-m",
    ["dept-sec", "dept-bldg"],
    "walkway-light",
  ],
  [
    "สัญญาณ KU-WiFi หลุดบ่อยที่อาคารเรียนรวม 1 ชั้น 3",
    "สัญญาณอินเทอร์เน็ตหลุดระหว่างเรียนตลอดช่วงบ่าย",
    "WAITING_INFORMATION",
    "cat-it",
    "MEDIUM",
    "loc-sr1",
    ["dept-it"],
    "wifi-down",
  ],
  [
    "ท่อน้ำประปาข้างศูนย์อาหารกลาง 1 รั่วซึมและมีน้ำขัง",
    "พบแอ่งน้ำขังจากท่อด้านข้างศูนย์อาหาร",
    "CONFIRMED",
    "cat-bldg",
    "HIGH",
    "loc-barmai",
    ["dept-bldg", "dept-clean"],
    "water-leak",
  ],
  [
    "ขยะล้นจุดคัดแยกด้านข้างอาคารชูชาติ กำภู และมีกลิ่นรบกวน",
    "จุดคัดแยกขยะเต็มและมีกลิ่นในช่วงพักกลางวัน",
    "CONFIRMED",
    "cat-clean",
    "MEDIUM",
    "loc-eng",
    ["dept-clean"],
    "overflow-bin",
  ],
  [
    "เก้าอี้เลกเชอร์ชำรุดหลายตัวในห้องเรียนอาคาร ศร.3",
    "พนักพิงหลวมและขาเก้าอี้โยกหลายตัว",
    "IN_PROGRESS",
    "cat-bldg",
    "LOW",
    "loc-sr3",
    ["dept-av"],
    "broken-desk",
  ],
  [
    "ไฟหน้าลานจอดรถสำนักบริการคอมพิวเตอร์กะพริบและดับบางช่วง",
    "ไฟกะพริบเป็นระยะและดับช่วงหัวค่ำ",
    "RESOLVED",
    "cat-elec",
    "MEDIUM",
    "loc-park-it",
    ["dept-bldg"],
    "dark-parking",
  ],
  [
    "ขอติดตั้งหลังคาคลุมทางเดินเชื่อมอาคารจักรพันธ์เพ็ญศิริเพิ่มเติม",
    "ทางเดินเชื่อมไม่มีหลังคาบางช่วง",
    "CONFIRMED",
    "cat-bldg",
    "LOW",
    "loc-chak",
    ["dept-bldg"],
    "walkway-light",
  ],
  [
    "ฝาท่อบนถนนชูชาติกำภูยุบตัว",
    "ฝาท่อทรุดใกล้ทางข้าม ทำให้คนเดินสะดุดได้",
    "CONFIRMED",
    "cat-sec",
    "HIGH",
    "loc-rd-chuchat",
    ["dept-bldg", "dept-sec"],
    "water-leak",
  ],
  [
    "ถังขยะใกล้ลานอนุสาวรีย์สามบูรพาจารย์ชำรุด",
    "ฝาถังขยะปิดไม่ได้และมีขยะหล่นรอบถัง",
    "IN_PROGRESS",
    "cat-clean",
    "LOW",
    "loc-plaza",
    ["dept-clean"],
    "overflow-bin",
  ],
  [
    "ปลั๊กไฟริมโต๊ะอ่านหนังสือที่สำนักหอสมุดใช้งานไม่ได้",
    "ปลั๊กไฟหลายช่องฝั่งหน้าต่างไม่มีไฟ",
    "CONFIRMED",
    "cat-elec",
    "MEDIUM",
    "loc-lib",
    ["dept-bldg"],
    "broken-desk",
  ],
];

const site = (id: string) => {
  const location = locations.find((item) => item.id === id)!;
  return { locationId: id, locationName: location.name, lat: location.lat, lng: location.lng };
};

export function demoImage(name: string, alt: string): ReportImage {
  return {
    id: `demo-${name}`,
    fileName: `${name}.png`,
    mimeType: "image/png",
    sizeBytes: 1024,
    url: `/demo-images/${name}.svg`,
    alt,
  };
}

export function createSeed(now = Date.now(), existingSequences?: NumberSequences) {
  const numberSequences: NumberSequences = existingSequences
    ? structuredClone(existingSequences)
    : { RPT: {}, TKT: {} };
  function seedNumber(kind: "RPT" | "TKT", instant: string, ordinal: number) {
    if (existingSequences) return issueNumber(numberSequences, kind, instant);
    const year = bangkokYear(instant);
    reserveNumber(numberSequences, kind, year, ordinal);
    return formatNumber(kind, year, ordinal);
  }
  const seedId = (kind: "report" | "ticket", n: number) =>
    existingSequences ? crypto.randomUUID() : `seed-${kind}-${n}`;
  const daysAgo = (days: number) => new Date(now - days * 86400000).toISOString();
  const users: User[] = personas.map(([id, username, realName, roles, departmentId]) => ({
    id,
    username,
    realName,
    roles,
    departmentId,
    email: `${username}@ku.th`,
    authProvider: "GOOGLE",
    providerSubjectId: `google-sub-${id}`,
    emailVerified: true,
    hostedDomain: "ku.th",
    avatarUrl: null,
    isActive: true,
    createdAt: daysAgo(70),
  }));
  const tickets: Ticket[] = issues.map(
    ([title, summary, status, categoryId, severity, locationId, ids], index) => {
      const confirmedAt = daysAgo(0.8 + index / 10);
      return {
        id: seedId("ticket", index + 1),
        ticketNumber: seedNumber("TKT", confirmedAt, index + 1),
        title,
        summary,
        status,
        categoryId,
        severity,
        location: site(locationId),
        departments: ids.map((departmentId) => {
          const isCompleted = status === "RESOLVED" || (index === 0 && departmentId === "dept-sec");
          return {
            departmentId,
            assignedAt: confirmedAt,
            assignedBy: "usr-rev1",
            isCompleted,
            completedAt: isCompleted ? daysAgo(0.3) : null,
            completedBy: isCompleted ? "usr-rev1" : null,
            completionNote: isCompleted
              ? index === 0
                ? "ตรวจพื้นที่และวางกรวยเตือนชั่วคราวแล้ว"
                : "เปลี่ยนโคมไฟและทดสอบแล้ว"
              : null,
          };
        }),
        confirmedBy: "usr-rev1",
        confirmedAt,
        updatedAt: confirmedAt,
        resolvedAt: status === "RESOLVED" ? daysAgo(0.3) : null,
        resolutionSummary: status === "RESOLVED" ? "เปลี่ยนโคมไฟและทดสอบแสงสว่างแล้ว" : null,
        pendingReevaluation: null,
      };
    },
  );
  const makeReport = (n: number, reporterId: string, fields: Partial<Report> = {}): Report => ({
    id: seedId("report", n),
    reportNumber:
      fields.status === "DRAFT" ? null : seedNumber("RPT", fields.submittedAt ?? daysAgo(1), n),
    reporterId,
    status: "PENDING_REVIEW",
    version: 1,
    description: "",
    location: null,
    images: [],
    aiGeneratedTitle: null,
    requestedTargetTicketId: null,
    ticketId: null,
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: daysAgo(2),
    updatedAt: daysAgo(1),
    submittedAt: daysAgo(1),
    cancelledAt: null,
    ...fields,
  });
  const links: [number, number, string][] = [
    [1, 1, "usr-rep1"],
    [2, 1, "usr-rep2"],
    [3, 1, "usr-multi-rev"],
    [4, 2, "usr-rep1"],
    [5, 3, "usr-dept-bldg"],
    [6, 4, "usr-rep2"],
    [7, 5, "usr-rep2"],
    [8, 6, "usr-rep1"],
    [9, 6, "usr-rep2"],
    [10, 7, "usr-rep2"],
    [11, 8, "usr-rep1"],
    [20, 9, "usr-rep2"],
    [21, 10, "usr-rep1"],
  ];
  const reports: Report[] = links.map(([n, ticketNumber, user]) => {
    const ticket = tickets[ticketNumber - 1];
    return makeReport(n, user, {
      status: "CONFIRMED",
      ticketId: ticket.id,
      aiGeneratedTitle: ticket.title,
      description: ticket.summary,
      location: ticket.location,
      images: [demoImage(issues[ticketNumber - 1][7], ticket.title)],
      submittedAt: daysAgo(2),
      reviewedBy: ticket.confirmedBy,
      reviewedAt: ticket.confirmedAt,
    });
  });
  const pending: [number, string, string, string, string][] = [
    [
      12,
      "usr-rep1",
      "ไฟทางเดินหน้าหอพักนิสิตชายดับหลายดวง ทางเดินมืดและเสี่ยงอันตรายช่วงค่ำ",
      "loc-dorm-m",
      "walkway-light",
    ],
    [13, "usr-rep2", "ตู้กดน้ำดื่มชั้นล่างของสำนักหอสมุดกดน้ำไม่ออก", "loc-lib", "water-leak"],
    [14, "usr-multi-rev", "ห้องน้ำอาคารเรียนรวม 3 สกปรกและพื้นลื่น", "loc-sr3", "overflow-bin"],
    [15, "usr-rep1", "ประตูทางเข้าด้านข้างศูนย์อาหารเปิดไม่ได้", "loc-barmai", "broken-desk"],
  ];
  const aiRuns: AIAnalysisRun[] = [];
  for (const [n, user, description, location, image] of pending) {
    const report = makeReport(n, user, {
      description,
      location: site(location),
      images: [demoImage(image, description)],
    });
    const run = analyzeReport(
      report,
      { categories, departments, tickets, reports },
      n === 15,
      daysAgo(0.2),
    );
    if (n === 12) {
      run.matchDecision = "MATCHED";
      run.candidateTicketId = tickets[0].id;
      run.candidateSimilarity = 87;
      run.ticketCandidateDraft = null;
      // Keep the seeded demonstration score consistent across both Reviewer views.
      run.similarCandidates = run.similarCandidates?.map((candidate) =>
        candidate.ticketId === tickets[0].id ? { ...candidate, similarity: 87 } : candidate,
      );
    }
    reports.push({ ...report, aiGeneratedTitle: run.generatedReportTitle });
    aiRuns.push(run);
  }
  reports.push(
    makeReport(16, "usr-rep1", {
      status: "DRAFT",
      description: "น้ำหยดจากเพดานหน้าห้องเรียน",
      submittedAt: null,
    }),
    makeReport(17, "usr-rep1", { status: "DRAFT", createdAt: daysAgo(35), submittedAt: null }),
    makeReport(18, "usr-rep1", {
      status: "REJECTED",
      description: "ข้อร้องเรียนส่วนบุคคล",
      reviewedBy: "usr-rev1",
      reviewedAt: daysAgo(0.5),
      rejectionReason: demoRejectionReason,
    }),
    makeReport(19, "usr-rep1", {
      status: "CANCELLED",
      createdAt: daysAgo(33),
      submittedAt: daysAgo(33),
      cancelledAt: daysAgo(32),
    }),
  );
  const affected: TicketAffected[] = ["usr-dept-it", "usr-rep1", "usr-rep2", "usr-multi-rev"].map(
    (userId) => ({ ticketId: tickets[0].id, userId, createdAt: daysAgo(0.4) }),
  );
  const threadMessages: ThreadMessage[] = [
    {
      id: "thread-seed-1",
      ticketId: tickets[1].id,
      authorId: "usr-dept-it",
      authorRole: "DEPARTMENT_STAFF",
      authorDepartmentId: "dept-it",
      body: "รบกวนระบุหมายเลขห้องและชื่อเครือข่าย (SSID) ที่เชื่อมต่อครับ",
      createdAt: daysAgo(0.4),
    },
    {
      id: "thread-seed-2",
      ticketId: tickets[1].id,
      authorId: "usr-rep1",
      authorRole: "REPORTER",
      authorDepartmentId: null,
      body: "ห้อง 304 อาคารเรียนรวม 1 ครับ เชื่อมต่อ KU-WiFi แล้วหลุดช่วงประมาณบ่ายสองโมง",
      createdAt: daysAgo(0.35),
    },
    {
      id: "thread-seed-3",
      ticketId: tickets[4].id,
      authorId: "usr-rev1",
      authorRole: "REVIEWER",
      authorDepartmentId: null,
      body: "รบกวนระบุหมายเลขห้องและแถวที่มีเก้าอี้ชำรุด เพื่อให้เจ้าหน้าที่เข้าตรวจได้ตรงจุดครับ",
      createdAt: daysAgo(1.05),
    },
    {
      id: "thread-seed-4",
      ticketId: tickets[4].id,
      authorId: "usr-rep2",
      authorRole: "REPORTER",
      authorDepartmentId: null,
      body: "พบที่ห้อง 302 แถวกลางฝั่งประตูค่ะ มีเก้าอี้ขาโยกอยู่ 3 ตัว",
      createdAt: daysAgo(0.95),
    },
  ];
  const feedbacks: FeedbackSubmission[] = [
    {
      id: "feedback-seed-1",
      ticketId: tickets[5].id,
      reporterId: "usr-rep2",
      ratings: { speed: 4, quality: 5, communication: 4, overall: 5 },
      createdAt: daysAgo(0.1),
      updatedAt: daysAgo(0.1),
    },
  ];
  const publicActivities: PublicActivityEvent[] = tickets.map((ticket) => ({
    id: `activity-${ticket.id}`,
    ticketId: ticket.id,
    type: "TICKET_CONFIRMED",
    actorId: "usr-rev1",
    actorRole: "REVIEWER",
    departmentId: null,
    oldStatus: null,
    newStatus: "CONFIRMED",
    summary: "ตรวจสอบและยืนยันเรื่องแล้ว",
    evidenceImages: [],
    createdAt: ticket.confirmedAt,
  }));
  const timelineFixtures: [
    number,
    PublicActivityEvent["type"],
    PublicActivityEvent["actorRole"],
    string,
    string | null,
    TicketStatus,
    TicketStatus,
    number,
    string,
  ][] = [
    [
      0,
      "STATUS_CHANGED",
      "DEPARTMENT_STAFF",
      "usr-dept-bldg",
      "dept-bldg",
      "CONFIRMED",
      "IN_PROGRESS",
      0.7,
      "กองอาคารสถานที่เริ่มตรวจสอบไฟทางเดิน",
    ],
    [
      0,
      "DEPARTMENT_COMPLETED",
      "SYSTEM",
      "SYSTEM",
      "dept-sec",
      "IN_PROGRESS",
      "IN_PROGRESS",
      0.3,
      "ตรวจพื้นที่และวางกรวยเตือนชั่วคราวแล้ว",
    ],
    [
      1,
      "STATUS_CHANGED",
      "DEPARTMENT_STAFF",
      "usr-dept-it",
      "dept-it",
      "CONFIRMED",
      "WAITING_INFORMATION",
      0.4,
      "ขอข้อมูลเพิ่มเติมจากผู้แจ้ง",
    ],
    [
      5,
      "STATUS_CHANGED",
      "DEPARTMENT_STAFF",
      "usr-dept-bldg",
      "dept-bldg",
      "CONFIRMED",
      "IN_PROGRESS",
      1,
      "เริ่มตรวจสอบโคมไฟหน้าลานจอดรถ",
    ],
  ];
  publicActivities.push(
    ...timelineFixtures.map(
      ([index, type, actorRole, actorId, departmentId, oldStatus, newStatus, days, summary]) => ({
        id: `activity-${index}-${type}`,
        ticketId: tickets[index].id,
        type,
        actorRole,
        actorId,
        departmentId,
        oldStatus,
        newStatus,
        summary,
        createdAt: daysAgo(days),
        evidenceImages: [],
      }),
    ),
  );
  publicActivities.push({
    id: "activity-repair",
    ticketId: tickets[5].id,
    type: "DEPARTMENT_ACTION",
    actorId: "usr-dept-bldg",
    actorRole: "DEPARTMENT_STAFF",
    departmentId: "dept-bldg",
    oldStatus: "IN_PROGRESS",
    newStatus: "IN_PROGRESS",
    summary: "เปลี่ยนโคมไฟและทดสอบแสงสว่างแล้ว",
    evidenceImages: [demoImage("repair-evidence", "โคมไฟหลังซ่อม")],
    createdAt: daysAgo(0.3),
  });
  publicActivities.push({
    id: "activity-resolved",
    ticketId: tickets[5].id,
    type: "AUTO_RESOLVED",
    actorId: "SYSTEM",
    actorRole: "SYSTEM",
    departmentId: null,
    oldStatus: "IN_PROGRESS",
    newStatus: "RESOLVED",
    summary: "หน่วยงานที่รับผิดชอบดำเนินการเสร็จสิ้นครบแล้ว",
    createdAt: tickets[5].resolvedAt!,
    evidenceImages: [],
  });
  return {
    users,
    categories: structuredClone(categories),
    departments: structuredClone(departments),
    locations: structuredClone(locations),
    reports,
    aiRuns,
    tickets,
    affected,
    threadMessages,
    publicActivities,
    feedbacks,
    numberSequences,
    auditLogs: [] as AuditLogEntry[],
    emailLogs: [] as EmailNotificationLog[],
    currentUserId: null as string | null,
    demoConfig: { simulateAiFailure: false, simulateEmailFailure: false },
  };
}

export type PrototypeState = ReturnType<typeof createSeed>;
