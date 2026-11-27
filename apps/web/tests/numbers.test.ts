import { IDBFactory } from "fake-indexeddb";
import { expect, it } from "vitest";
import { createSeed } from "../src/data/seed";
import {
  bangkokYear,
  formatNumber,
  issueNumber,
  type NumberSequences,
} from "../src/lib/domain/numbers";
import { canReadReport } from "../src/lib/domain/permissions";
import { migrateRecordNumbers } from "../src/lib/store/migrateRecordNumbers";
import { applyAction, type StoreAction } from "../src/lib/store/mutations";
import {
  commitPrototype,
  openPrototypeDatabase,
  readStoredPrototype,
} from "../src/lib/store/prototypeDatabase";

const at = "2026-06-15T10:00:00Z";
const setup = () => ({ ...createSeed(Date.parse(at)), currentUserId: "usr-rep1" });
const example = setup().reports[0];
const fields = {
  description: "ไฟทางเดินดับที่บริเวณหอพัก",
  images: example.images,
  location: example.location,
};
const submit = { type: "saveReport", draft: false, fields } as const;

it("formats independent, Gregorian yearly record numbers without truncating overflow", () => {
  expect(formatNumber("RPT", "2026", 1)).toBe("RPT-2026-00001");
  expect(formatNumber("TKT", "2026", 100000)).toBe("TKT-2026-100000");
  const ledger: NumberSequences = { RPT: { 2026: 99999 }, TKT: {} };
  const before = "2026-12-31T16:59:59.999Z";
  const after = "2026-12-31T17:00:00.000Z";
  expect(bangkokYear(before)).toBe("2026");
  expect(bangkokYear(after)).toBe("2027");
  expect(issueNumber(ledger, "RPT", before)).toBe("RPT-2026-100000");
  expect(issueNumber(ledger, "TKT", before)).toBe("TKT-2026-00001");
  expect(issueNumber(ledger, "RPT", after)).toBe("RPT-2027-00001");
  expect(issueNumber(ledger, "TKT", after)).toBe("TKT-2027-00001");
});

it("assigns a report number only at submission and retains it on edit and cancellation", () => {
  const state = setup();
  const draft = applyAction(state, { ...submit, draft: true }, at);
  const id = String(draft.data);
  expect(draft.state.reports.find((report) => report.id === id)?.reportNumber).toBeNull();
  expect(draft.state.numberSequences).toEqual(state.numberSequences);
  const submitted = applyAction(draft.state, { ...submit, id }, at);
  const number = submitted.state.reports.find((report) => report.id === id)?.reportNumber;
  expect(number).toBe("RPT-2026-00022");
  expect(id).not.toBe(number);
  const edited = applyAction(
    submitted.state,
    { ...submit, id, edit: true },
    "2026-12-31T17:00:00Z",
  );
  const cancelled = applyAction(edited.state, { type: "cancelReport", id }, at);
  expect(cancelled.state.reports.find((report) => report.id === id)?.reportNumber).toBe(number);
  const purged = applyAction(cancelled.state, { type: "purge" }, "2026-08-01T00:00:00Z");
  expect(purged.state.reports.some((report) => report.id === id)).toBe(false);
  const later = applyAction(purged.state, submit, "2026-08-01T00:00:01Z");
  expect(later.state.reports.find((report) => report.id === later.data)?.reportNumber).toBe(
    "RPT-2026-00023",
  );
  const reset = applyAction(later.state, { type: "reset" }, "2026-08-01T00:01:00Z");
  expect(
    reset.state.reports.every(
      (report) => !report.reportNumber || Number(report.reportNumber.slice(-5)) > 23,
    ),
  ).toBe(true);
  expect(reset.state.tickets.every((ticket) => Number(ticket.ticketNumber.slice(-5)) > 10)).toBe(
    true,
  );
});

it("serializes simultaneous submissions and new-ticket confirmations across connections", async () => {
  const factory = new IDBFactory();
  const a = await openPrototypeDatabase(factory);
  const b = await openPrototypeDatabase(factory);
  const execute = (db: IDBDatabase, action: StoreAction) =>
    commitPrototype(db, setup, (state) => applyAction(state, action, at));
  const submissions = await Promise.all(
    Array.from({ length: 12 }, (_, i) => execute(i % 2 ? a : b, submit)),
  );
  await execute(a, { type: "login", userId: "usr-rev1" });
  const decisions = await Promise.all(
    submissions.map(({ data }, i) =>
      execute(i % 2 ? b : a, {
        type: "review",
        id: String(data),
        version: 1,
        decision: {
          kind: "new",
          reportTitle: "ไฟทางเดินดับ",
          title: "ซ่อมไฟทางเดิน",
          summary: "ตรวจสอบหลอดไฟ",
          categoryId: "cat-elec",
          severity: "MEDIUM",
          departmentIds: ["dept-bldg"],
        },
      }),
    ),
  );
  const saved = (await readStoredPrototype(a))!;
  const reportNumbers = submissions.map(
    ({ data }) => saved.reports.find((report) => report.id === data)?.reportNumber,
  );
  const ticketNumbers = decisions.map(
    ({ data }) => saved.tickets.find((ticket) => ticket.id === data)?.ticketNumber,
  );
  expect([...reportNumbers].sort()).toEqual(
    Array.from({ length: 12 }, (_, i) => formatNumber("RPT", "2026", i + 22)),
  );
  expect([...ticketNumbers].sort()).toEqual(
    Array.from({ length: 12 }, (_, i) => formatNumber("TKT", "2026", i + 11)),
  );
  await expect(
    commitPrototype(b, setup, (state) => ({
      state: {
        ...state,
        tickets: [...state.tickets, { ...state.tickets[0], id: "duplicate-ticket" }],
      },
    })),
  ).rejects.toMatchObject({ name: "ConstraintError" });
  await expect(
    commitPrototype(a, setup, (state) => ({
      state: {
        ...state,
        reports: [...state.reports, { ...state.reports[0], id: "duplicate-report" }],
      },
    })),
  ).rejects.toMatchObject({ name: "ConstraintError" });
  expect(await readStoredPrototype(b)).toEqual(saved);
  a.close();
  b.close();
});

it("migrates legacy links and reserves numbers found only in retention history", () => {
  const seed = setup();
  const ticket = { ...seed.tickets[0], id: "CF-2026-0001" };
  const report = { ...seed.reports[0], id: "RPT-2026-0001", ticketId: ticket.id };
  const legacy = {
    ...seed,
    numberSequences: undefined,
    tickets: [ticket],
    reports: [report],
    auditLogs: [
      {
        id: "test",
        entityType: "RETENTION",
        entityId: "RPT-2026-0042",
        action: "PURGE_REPORT",
        actorId: "SYSTEM",
        actorRoles: ["SYSTEM"],
        departmentId: null,
        details: {},
        createdAt: at,
      },
    ],
  } as unknown as ReturnType<typeof setup>;
  const state = migrateRecordNumbers(legacy);
  expect(state.reports[0].id).not.toBe(report.id);
  expect(state.tickets[0].id).not.toBe(ticket.id);
  expect(state.reports[0].ticketId).toBe(state.tickets[0].id);
  expect(state.reports[0].reportNumber).toBe("RPT-2026-00001");
  expect(state.tickets[0].ticketNumber).toBe("TKT-2026-00001");
  expect(state.auditLogs[0].details.reportNumber).toBe("RPT-2026-00042");
  const submitted = applyAction(state, submit, at);
  expect(submitted.state.reports.at(-1)?.reportNumber).toBe("RPT-2026-00043");
});

it("keeps private reports scoped to their owner and the reviewer workspace", () => {
  const seed = setup();
  const report = seed.reports.find(
    (item) => item.status === "PENDING_REVIEW" && item.reporterId === seed.currentUserId,
  )!;
  const user = (id: string) => seed.users.find((item) => item.id === id)!;
  expect(canReadReport(null, report)).toBe(false);
  expect(canReadReport(user("usr-rep2"), report)).toBe(false);
  expect(canReadReport(user("usr-admin"), report)).toBe(false);
  expect(canReadReport(user("usr-rep1"), report)).toBe(true);
  expect(canReadReport(user("usr-rev1"), report)).toBe(true);
  expect(canReadReport(null, { ...report, status: "CONFIRMED" })).toBe(true);
});
