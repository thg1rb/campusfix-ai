import { describe, expect, it } from "vitest";
import { createSeed } from "../src/data/seed";
import { analyzeReport, rankSimilarActiveTickets } from "../src/lib/ai/mockAiService";
import { aggregateFeedback, summarize } from "../src/lib/domain/analytics";
import {
  canAccessTicketThread,
  canOperateAsDepartmentOnTicket,
  canPostTicketThread,
  canReviewOrManageTicket,
  canReviewReport,
  canSubmitOrEditFeedback,
  canToggleAffected,
  canViewTicketThread,
  isActiveTicket,
  isFinalTicket,
  validateUserRolesAndDepartment,
} from "../src/lib/domain/permissions";
import { expiredReports } from "../src/lib/domain/retention";
import {
  assertReportTransition,
  assertReviewDecision,
  completeDepartment,
  replaceDepartments,
  transitionTicket,
} from "../src/lib/domain/transitions";
import { reportErrors, usernameError } from "../src/lib/domain/validation";
import { formatThaiDateTime } from "../src/lib/format";
import type { ReportStatus, TicketStatus } from "../src/types/domain";

const timestamp = "2026-11-23T09:00:00Z";
const now = Date.parse(timestamp);
const seed = createSeed(now);
const findUser = (id: string) => seed.users.find((user) => user.id === id)!;
const reviewer = findUser("usr-rev1");
const ploy = findUser("usr-multi-rev");
const staff = findUser("usr-dept-bldg");
const admin = findUser("usr-admin");
const primary = seed.tickets[0];
const pending = seed.reports.find((report) => report.id === "seed-report-12")!;

describe("Freeze 1 lifecycles", () => {
  const reportStates: ReportStatus[] = [
    "DRAFT",
    "PENDING_REVIEW",
    "CANCELLED",
    "CONFIRMED",
    "REJECTED",
  ];
  const allowedReports = [
    "DRAFT:DRAFT",
    "DRAFT:PENDING_REVIEW",
    "PENDING_REVIEW:PENDING_REVIEW",
    "PENDING_REVIEW:CANCELLED",
    "PENDING_REVIEW:CONFIRMED",
    "PENDING_REVIEW:REJECTED",
  ];
  it.each(reportStates)("enforces report transitions from %s", (status) => {
    for (const next of reportStates) {
      const action = () => assertReportTransition({ ...pending, status }, next);
      if (allowedReports.includes(`${status}:${next}`)) expect(action).not.toThrow();
      else expect(action).toThrow(expect.objectContaining({ code: "TRANSITION_FORBIDDEN" }));
    }
  });

  const ticketStates: TicketStatus[] = [
    "CONFIRMED",
    "IN_PROGRESS",
    "WAITING_INFORMATION",
    "RESOLVED",
  ];
  const allowedTickets = [
    "CONFIRMED:IN_PROGRESS",
    "CONFIRMED:WAITING_INFORMATION",
    "IN_PROGRESS:WAITING_INFORMATION",
    "WAITING_INFORMATION:IN_PROGRESS",
  ];
  it.each(ticketStates)("enforces manual ticket transitions from %s", (status) => {
    for (const next of ticketStates) {
      const action = () =>
        transitionTicket({ ...primary, status }, next, timestamp, "ต้องตรวจสอบพื้นที่เพิ่มเติม");
      if (allowedTickets.includes(`${status}:${next}`)) expect(action().status).toBe(next);
      else
        expect(action).toThrow(
          expect.objectContaining({
            code: status === "RESOLVED" ? "TICKET_IS_FINAL" : "TRANSITION_FORBIDDEN",
          }),
        );
    }
  });

  it("has three active states and one final state", () => {
    expect(ticketStates.filter(isActiveTicket)).toEqual([
      "CONFIRMED",
      "IN_PROGRESS",
      "WAITING_INFORMATION",
    ]);
    expect(ticketStates.filter(isFinalTicket)).toEqual(["RESOLVED"]);
    expect(new Set(seed.tickets.map((ticket) => ticket.status))).toEqual(new Set(ticketStates));
  });

  it("requires a question and rejects unrecognized manual destinations", () => {
    expect(() => transitionTicket(primary, "WAITING_INFORMATION", timestamp)).toThrow();
    expect(() => transitionTicket(primary, "UNKNOWN" as TicketStatus, timestamp)).toThrow(
      expect.objectContaining({ code: "TRANSITION_FORBIDDEN" }),
    );
  });

  it("resolves immediately on the last assigned department's completion", () => {
    const result = completeDepartment(primary, "dept-bldg", staff.id, "ซ่อมไฟแล้ว", timestamp);
    expect(result.status).toBe("RESOLVED");
    expect(result.resolvedAt).toBe(timestamp);
    expect(result.departments.every((dept) => dept.isCompleted)).toBe(true);
    expect(primary.status).toBe("IN_PROGRESS");
  });

  it("keeps partial completion and blocks repeat or unassigned completion", () => {
    const ticket = replaceDepartments(
      primary,
      ["dept-sec", "dept-bldg", "dept-it"],
      reviewer.id,
      timestamp,
    );
    const result = completeDepartment(ticket, "dept-bldg", staff.id, "", timestamp);
    expect(result.departments.filter((dept) => dept.isCompleted)).toHaveLength(2);
    expect(result.status).toBe("IN_PROGRESS");
    expect(() => completeDepartment(result, "dept-bldg", staff.id, "", timestamp)).toThrow();
    expect(() => completeDepartment(result, "dept-clean", staff.id, "", timestamp)).toThrow();
  });

  it("resolves immediately after removing the last incomplete department in any active state", () => {
    for (const status of ["CONFIRMED", "IN_PROGRESS", "WAITING_INFORMATION"] as const) {
      const result = replaceDepartments(
        { ...primary, status },
        ["dept-sec"],
        reviewer.id,
        timestamp,
      );
      expect(result.status).toBe("RESOLVED");
      expect(result.departments).toEqual([primary.departments[0]]);
    }
    expect(() => replaceDepartments(primary, [], reviewer.id, timestamp)).toThrow();
    expect(() =>
      replaceDepartments(seed.tickets[5], ["dept-bldg"], reviewer.id, timestamp),
    ).toThrow();
  });
});

describe("Freeze 1 permissions, validation and retention", () => {
  it("blocks own reports and tickets and checks stale versions", () => {
    const own = seed.reports.find((report) => report.id === "seed-report-14")!;
    expect(canReviewReport(ploy, own).allowed).toBe(false);
    expect(canReviewOrManageTicket(ploy, primary, seed.reports).allowed).toBe(false);
    expect(canOperateAsDepartmentOnTicket(staff, seed.tickets[2], seed.reports).allowed).toBe(
      false,
    );
    expect(canOperateAsDepartmentOnTicket(staff, primary, seed.reports).allowed).toBe(true);
    expect(() => assertReviewDecision(ploy, own, own.version, "CONFIRMED")).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
    expect(() => assertReviewDecision(reviewer, pending, 0, "REJECTED")).toThrow(
      expect.objectContaining({ code: "STALE_REPORT_VERSION" }),
    );
  });

  it("enforces exclusive admin and one department", () => {
    expect(validateUserRolesAndDepartment(["ADMINISTRATOR", "REPORTER"], null)).not.toBeNull();
    expect(validateUserRolesAndDepartment(["ADMINISTRATOR"], "dept-it")).not.toBeNull();
    expect(validateUserRolesAndDepartment(["DEPARTMENT_STAFF"], null)).not.toBeNull();
    expect(validateUserRolesAndDepartment(["DEPARTMENT_STAFF"], "dept-it")).toBeNull();
    expect(
      canReviewReport({ ...admin, roles: ["ADMINISTRATOR", "REVIEWER"] }, pending).allowed,
    ).toBe(false);
    expect(
      canOperateAsDepartmentOnTicket(
        { ...staff, roles: ["ADMINISTRATOR", "DEPARTMENT_STAFF"] },
        primary,
        seed.reports,
      ).allowed,
    ).toBe(false);
    expect(canToggleAffected(admin, primary).allowed).toBe(false);
  });

  it("limits private threads, affected toggles and feedback", () => {
    const waiting = seed.tickets[1];
    for (const user of [reviewer, findUser("usr-rep1"), findUser("usr-dept-it")]) {
      expect(canAccessTicketThread(user, waiting, seed.reports)).toBe(true);
    }
    for (const user of [null, admin, findUser("usr-rep2")]) {
      expect(canAccessTicketThread(user, waiting, seed.reports)).toBe(false);
    }
    expect(canToggleAffected(staff, seed.tickets[5]).allowed).toBe(false);
    expect(
      canSubmitOrEditFeedback(findUser("usr-rep1"), seed.tickets[5], seed.reports).allowed,
    ).toBe(true);
    expect(
      canSubmitOrEditFeedback(findUser("usr-dept-it"), seed.tickets[5], seed.reports).allowed,
    ).toBe(false);
  });

  it("checks report imagery, campus bounds and username uniqueness", () => {
    expect(Object.values(reportErrors(pending)).filter(Boolean)).toEqual([]);
    expect(
      Object.values(reportErrors({ description: " ", images: [], location: null })).filter(Boolean),
    ).toHaveLength(3);
    expect(
      reportErrors({ ...pending, images: Array(6).fill(pending.images[0]) }).images,
    ).toBeTruthy();
    expect(
      reportErrors({ ...pending, images: [{ ...pending.images[0], fileName: "wrong.gif" }] })
        .images,
    ).toBeTruthy();
    expect(
      reportErrors({ ...pending, images: [{ ...pending.images[0], sizeBytes: 10485761 }] }).images,
    ).toBeTruthy();
    expect(
      reportErrors({ ...pending, location: { ...pending.location!, lat: NaN } }).location,
    ).toBeTruthy();
    expect(usernameError("SUDA_ENG67", seed.users, "usr-rep1")).toBeTruthy();
  });

  it("purges drafts and cancellations at the 30-day boundary only", () => {
    expect(expiredReports(seed.reports, now).map((item) => item.id)).toEqual([
      "seed-report-17",
      "seed-report-19",
    ]);
    expect(
      expiredReports(
        [{ ...pending, status: "DRAFT", createdAt: new Date(now - 30 * 86400000).toISOString() }],
        now,
      ),
    ).toHaveLength(1);
    expect(
      expiredReports(
        [{ ...pending, status: "REJECTED", createdAt: new Date(0).toISOString() }],
        now,
      ),
    ).toHaveLength(0);
  });
});

describe("Phase 18 thread lifecycle", () => {
  const waiting = seed.tickets[1];
  const visibility: [TicketStatus, boolean, boolean][] = [
    ["WAITING_INFORMATION", true, true],
    ["IN_PROGRESS", false, true],
    ["CONFIRMED", false, false],
    ["RESOLVED", false, false],
  ];

  it.each(visibility)(
    "applies the %s thread rules with and without history",
    (status, withoutHistory, withHistory) => {
      const ticket = { ...waiting, status };
      for (const participant of [reviewer, findUser("usr-rep1"), findUser("usr-dept-it")]) {
        expect(canAccessTicketThread(participant, ticket, seed.reports)).toBe(true);
        expect(canViewTicketThread(participant, ticket, seed.reports, false)).toBe(withoutHistory);
        expect(canViewTicketThread(participant, ticket, seed.reports, true)).toBe(withHistory);
        expect(canPostTicketThread(participant, ticket, seed.reports)).toBe(
          status === "WAITING_INFORMATION",
        );
      }
      for (const outsider of [
        null,
        admin,
        findUser("usr-rep2"),
        staff,
        { ...reviewer, isActive: false },
      ]) {
        expect(canViewTicketThread(outsider, ticket, seed.reports, false)).toBe(false);
        expect(canViewTicketThread(outsider, ticket, seed.reports, true)).toBe(false);
        expect(canPostTicketThread(outsider, ticket, seed.reports)).toBe(false);
      }
    },
  );
});

it("matches active tickets deterministically and reports an independent AI failure", () => {
  const match = analyzeReport(pending, seed, false, timestamp);
  expect(match).toEqual(analyzeReport(pending, seed, false, timestamp));
  expect(match.candidateTicketId).toBe(primary.id);
  expect(
    analyzeReport(
      pending,
      { ...seed, tickets: [{ ...primary, status: "RESOLVED" }] },
      false,
      timestamp,
    ).matchDecision,
  ).toBe("NO_MATCH");
  expect(analyzeReport(pending, seed, true, timestamp).status).toBe("FAILED");
  expect(pending.status).toBe("PENDING_REVIEW");
});

it("ranks only the three highest-scoring active tickets by descending similarity", () => {
  const medium = { ...primary, id: "medium", title: "wifi", summary: "wifi" };
  const low = { ...medium, id: "low", categoryId: "cat-it" };
  const older = { ...low, id: "older", confirmedAt: "2026-11-01T00:00:00Z" };
  const context = {
    ...seed,
    tickets: [
      low,
      { ...primary, id: "resolved", status: "RESOLVED" as const },
      older,
      medium,
      primary,
    ],
  };
  const ranked = rankSimilarActiveTickets(pending, context, timestamp);
  expect(ranked.map((candidate) => candidate.ticketId)).toEqual([primary.id, medium.id, low.id]);
  expect(ranked[0].similarity).toBeGreaterThan(ranked[1].similarity);
  expect(ranked[1].similarity).toBeGreaterThan(ranked[2].similarity);
  expect(analyzeReport(pending, context, false, timestamp).similarCandidates).toEqual(ranked);
  expect(analyzeReport(pending, context, true, timestamp).similarCandidates).toBeUndefined();
});

it("returns fewer than three candidates when necessary and breaks ties by ticket ID", () => {
  const context = {
    ...seed,
    tickets: [
      { ...primary, id: "b" },
      { ...primary, id: "a" },
    ],
  };
  const ranked = rankSimilarActiveTickets(pending, context, timestamp);
  expect(ranked.map((candidate) => candidate.ticketId)).toEqual(["a", "b"]);
  expect(ranked[0].similarity).toBe(ranked[1].similarity);
  expect(rankSimilarActiveTickets(pending, { ...context, tickets: [] }, timestamp)).toEqual([]);
});

it("ranks by the reviewed category without rewriting the original AI run", () => {
  const context = {
    ...seed,
    tickets: [
      { ...primary, id: "lighting", categoryId: "cat-elec" },
      { ...primary, id: "safety", categoryId: "cat-sec" },
    ],
  };
  const run = analyzeReport(pending, context, false, timestamp);
  expect(run.similarCandidates?.map((item) => item.ticketId)).toEqual(["lighting", "safety"]);
  expect(
    rankSimilarActiveTickets(pending, context, timestamp, "cat-sec").map((item) => item.ticketId),
  ).toEqual(["safety", "lighting"]);
  expect(run.suggestedCategoryId).toBe("cat-elec");
  expect(run.candidateTicketId).toBe("lighting");
});

it("keeps analytics counts distinct and formats Thai Buddhist Era dates", () => {
  expect(summarize(seed.tickets, seed.reports, seed.affected, now)).toMatchObject({
    ticketCount: 10,
    reportCount: 13,
    affectedUserCount: 4,
    activeCount: 9,
    resolvedCount: 1,
  });
  expect(aggregateFeedback(seed.feedbacks).average).toBe(4.5);
  expect(formatThaiDateTime(timestamp)).toBe("23 พ.ย. 2569, 16:00 น.");
});
