import { IDBFactory } from "fake-indexeddb";
import { expect, it } from "vitest";
import { createSeed } from "../src/data/seed";
import { applyAction } from "../src/lib/store/mutations";
import { migrateTicketLifecycle } from "../src/lib/store/migrateTicketLifecycle";
import {
  legacyStorageKey,
  migrateGoogleUsers,
  readPrototypeSnapshot,
} from "../src/lib/store/PrototypeStore";
import {
  commitPrototype,
  openPrototypeDatabase,
  readStoredPrototype,
} from "../src/lib/store/prototypeDatabase";
import type {
  MajorEmailEventType,
  PublicActivityType,
  TicketStatus,
  User,
} from "../src/types/domain";

const now = "2026-11-23T09:00:00.000Z";
const seeded = () => createSeed(Date.parse(now));
const verified = {
  reportTitle: "ไฟทางเดินดับ",
  categoryId: "cat-it",
  severity: "LOW" as const,
  departmentIds: ["dept-it", "dept-av"],
};

it("completes a multi-department ticket and sends exactly the reporter-only notices", () => {
  const seed = { ...seeded(), currentUserId: "usr-dept-bldg" };
  const { state } = applyAction(
    seed,
    { type: "operation", id: seed.tickets[0].id, complete: true, note: "ซ่อมแล้ว", evidence: [] },
    now,
  );
  expect(state.tickets[0].status).toBe("RESOLVED");
  expect(state.emailLogs.map((email) => email.recipientUserId).sort()).toEqual([
    "usr-multi-rev",
    "usr-rep1",
    "usr-rep2",
  ]);
  expect(
    state.emailLogs.every((email) => email.subject.startsWith("[KU Spot] TKT-2026-00001 · ")),
  ).toBe(true);
  expect(state.publicActivities.at(-1)?.type).toBe("AUTO_RESOLVED");
  expect(state.auditLogs[0].actorId).toBe("SYSTEM");
  expect(() => applyAction(state, { type: "affected", id: seed.tickets[0].id }, now)).toThrow();
  expect(seed.tickets[0].status).toBe("IN_PROGRESS");
});

it("rechecks a stale version and preserves history across simulated AI failure", () => {
  const seed = { ...seeded(), currentUserId: "usr-rev1" };
  seed.demoConfig.simulateAiFailure = true;
  const id = "seed-report-12";
  const { state } = applyAction(seed, { type: "simulateEdit", id }, now);
  expect(
    state.aiRuns
      .filter((item) => item.reportId === id)
      .map((run) => [run.reportVersion, run.status, run.isOutdated]),
  ).toEqual([
    [1, "COMPLETED", true],
    [2, "FAILED", false],
  ]);
  const decision = { kind: "existing", ticketId: seed.tickets[0].id, ...verified } as const;
  expect(() => applyAction(state, { type: "review", id, version: 1, decision }, now)).toThrow(
    expect.objectContaining({ code: "STALE_REPORT_VERSION" }),
  );
  const accepted = applyAction(state, { type: "review", id, version: 2, decision }, now).state;
  expect(accepted.tickets[0].title).toBe(seed.tickets[0].title);
  expect(accepted.tickets[0].pendingReevaluation?.status).toBe("FAILED");
  expect(accepted.emailLogs[0].recipientUserId).toBe("usr-rep1");
  expect(accepted.auditLogs[0].details.overrides).toEqual({
    categoryId: false,
    severity: false,
    departmentIds: false,
  });
});

it.each(["existing", "new"] as const)("audits verified fields for a %s Ticket", (kind) => {
  const seed = { ...seeded(), currentUserId: "usr-rev1" };
  const id = "seed-report-12";
  const original = seed.tickets[0];
  const decision =
    kind === "existing"
      ? { ...verified, kind, ticketId: original.id }
      : { ...verified, kind, title: "ไฟทางเดินชำรุด", summary: "ต้องตรวจระบบไฟ" };
  const result = applyAction(seed, { type: "review", id, version: 1, decision }, now);
  expect(result.state.reports.find((report) => report.id === id)).toMatchObject({
    status: "CONFIRMED",
    ticketId: result.data,
    aiGeneratedTitle: verified.reportTitle,
  });
  expect(
    result.state.auditLogs.find((log) => log.action === "CONFIRM" && log.entityId === id),
  ).toMatchObject({
    actorId: "usr-rev1",
    createdAt: now,
    details: {
      ...verified,
      kind,
      version: 1,
      ticketId: result.data,
      aiRunId: `ai-${id}-1`,
      overrides: { categoryId: true, severity: true, departmentIds: true },
    },
  });
  const ticket = result.state.tickets.find((item) => item.id === result.data)!;
  if (kind === "new") {
    expect(ticket).toMatchObject({
      categoryId: verified.categoryId,
      severity: verified.severity,
      status: "CONFIRMED",
    });
    expect(ticket.departments.map((item) => [item.departmentId, item.isCompleted])).toEqual([
      ["dept-it", false],
      ["dept-av", false],
    ]);
  } else {
    expect(ticket).toMatchObject({
      categoryId: original.categoryId,
      severity: original.severity,
      status: original.status,
    });
    expect(ticket.departments).toEqual(original.departments);
    expect(ticket.pendingReevaluation).toMatchObject({
      triggeredByReportId: id,
      status: "COMPLETED",
    });
  }
});

it("compares department selections without treating reordering as an AI override", () => {
  const seed = { ...seeded(), currentUserId: "usr-rev1" };
  const id = "seed-report-12";
  const run = seed.aiRuns.find((item) => item.reportId === id)!;
  const decision = {
    kind: "existing" as const,
    ticketId: seed.tickets[0].id,
    reportTitle: run.generatedReportTitle!,
    categoryId: run.suggestedCategoryId!,
    severity: run.suggestedSeverity!,
    departmentIds: run.recommendedDepartmentIds.toReversed(),
  };
  const { state } = applyAction(seed, { type: "review", id, version: 1, decision }, now);
  expect(state.auditLogs[0].details.overrides).toEqual({
    categoryId: false,
    severity: false,
    departmentIds: false,
  });
});

it.each(["existing", "new"] as const)(
  "rejects missing or invalid verified fields for a %s Ticket",
  (kind) => {
    const seed = { ...seeded(), currentUserId: "usr-rev1" };
    seed.categories.find((item) => item.id === "cat-clean")!.isActive = false;
    seed.departments.find((item) => item.id === "dept-clean")!.isActive = false;
    const decision =
      kind === "existing"
        ? { ...verified, kind, ticketId: seed.tickets[0].id }
        : { ...verified, kind, title: "ไฟทางเดินชำรุด", summary: "ต้องตรวจระบบไฟ" };
    const cases = [
      [{ categoryId: undefined }, "INVALID_CATEGORY"],
      [{ categoryId: "cat-clean" }, "INVALID_CATEGORY"],
      [{ categoryId: "missing" }, "INVALID_CATEGORY"],
      [{ severity: undefined }, "INVALID_SEVERITY"],
      [{ severity: "URGENT" }, "INVALID_SEVERITY"],
      [{ departmentIds: undefined }, "DEPARTMENT_REQUIRED"],
      [{ departmentIds: [] }, "DEPARTMENT_REQUIRED"],
      [{ departmentIds: ["dept-it", "dept-clean"] }, "INACTIVE_DEPARTMENT"],
      [{ departmentIds: ["missing"] }, "INACTIVE_DEPARTMENT"],
    ] as const;
    for (const [fields, code] of cases) {
      expect(() =>
        applyAction(
          seed,
          {
            type: "review",
            id: "seed-report-12",
            version: 1,
            decision: { ...decision, ...fields } as typeof decision,
          },
          now,
        ),
      ).toThrow(expect.objectContaining({ code }));
    }
    expect(seed.reports.find((report) => report.id === "seed-report-12")?.status).toBe(
      "PENDING_REVIEW",
    );
  },
);

it("keeps private requests out of public activity and allows simulated email retry", () => {
  const seed = { ...seeded(), currentUserId: "usr-rev1" };
  seed.demoConfig.simulateEmailFailure = true;
  const ticket = seed.tickets[0];
  const { state } = applyAction(
    seed,
    {
      type: "status",
      id: ticket.id,
      workspace: "reviewer",
      status: "WAITING_INFORMATION",
      reason: "โปรดระบุจุดที่ไฟดับ",
    },
    now,
  );
  expect(state.threadMessages.at(-1)?.body).toBe("โปรดระบุจุดที่ไฟดับ");
  expect(state.publicActivities.at(-1)?.summary).not.toContain("โปรดระบุ");
  expect(state.emailLogs).toHaveLength(3);
  const email = state.emailLogs[0];
  expect(email.status).toBe("FAILED");
  const enabled = applyAction(
    state,
    { type: "config", key: "simulateEmailFailure", value: false },
    now,
  ).state;
  expect(
    applyAction(enabled, { type: "retryEmail", id: email.id }, now).state.emailLogs[0].status,
  ).toBe("SENT");
});

it("guards exclusive administration and preserves linked records after disabling master data", () => {
  const seed = { ...seeded(), currentUserId: "usr-admin" };
  expect(() =>
    applyAction(
      seed,
      {
        type: "user",
        id: "usr-admin",
        roles: ["ADMINISTRATOR"],
        isActive: false,
        departmentId: null,
      },
      now,
    ),
  ).toThrow(expect.objectContaining({ code: "LAST_ADMIN" }));
  const category = seed.categories.find((item) => item.id === seed.tickets[0].categoryId)!;
  const { state } = applyAction(
    seed,
    { type: "master", collection: "categories", item: { ...category, isActive: false } },
    now,
  );
  expect(state.categories.find((item) => item.id === category.id)?.isActive).toBe(false);
  expect(state.tickets[0].categoryId).toBe(category.id);
});

const closedToPosting: TicketStatus[] = ["IN_PROGRESS", "CONFIRMED", "RESOLVED"];
it.each(closedToPosting)(
  "rejects a participant's message in %s without changing history",
  (status) => {
    const seed = { ...seeded(), currentUserId: "usr-rep1" };
    const ticket = seed.tickets[1];
    ticket.status = status;
    expect(() =>
      applyAction(seed, { type: "thread", id: ticket.id, body: "ข้อความใหม่" }, now),
    ).toThrow(
      expect.objectContaining({
        code: "THREAD_READ_ONLY",
        message: "สามารถส่งข้อความเพิ่มเติมได้เฉพาะเมื่อเรื่องอยู่ในสถานะรอข้อมูลเพิ่มเติมเท่านั้น",
      }),
    );
    expect(seed.threadMessages.filter((message) => message.ticketId === ticket.id)).toHaveLength(2);
  },
);

it("lets confirmed reporters, assigned staff, and reviewers reply without public activity or email", () => {
  const seed = seeded();
  const id = seed.tickets[1].id;
  const participants = [
    ["usr-rep1", "REPORTER", null],
    ["usr-dept-it", "DEPARTMENT_STAFF", "dept-it"],
    ["usr-rev1", "REVIEWER", null],
  ] as const;
  for (const [currentUserId, authorRole, authorDepartmentId] of participants) {
    const { state } = applyAction(
      { ...seed, currentUserId },
      { type: "thread", id, body: "  ข้อความตอบกลับ\nข้อมูลเพิ่มเติม  " },
      now,
    );
    expect(state.threadMessages.at(-1)).toMatchObject({
      ticketId: id,
      authorId: currentUserId,
      authorRole,
      authorDepartmentId,
      body: "ข้อความตอบกลับ\nข้อมูลเพิ่มเติม",
    });
    expect(state.tickets[1].status).toBe("WAITING_INFORMATION");
    expect(state.publicActivities).toEqual(seed.publicActivities);
    expect(state.emailLogs).toEqual(seed.emailLogs);
  }
});

it("blocks unrelated accounts and unauthenticated visitors from writing in an open chat", () => {
  const seed = seeded();
  for (const [currentUserId, code] of [
    [null, "LOGIN_REQUIRED"],
    ["usr-rep2", "FORBIDDEN"],
    ["usr-dept-bldg", "FORBIDDEN"],
    ["usr-admin", "FORBIDDEN"],
  ]) {
    const action = { type: "thread", id: seed.tickets[1].id, body: "ข้อความจากบุคคลภายนอก" } as const;
    expect(() => applyAction({ ...seed, currentUserId }, action, now)).toThrow(
      expect.objectContaining({ code }),
    );
  }
});

it("opens a thread through a private initial question and retains it on resume", () => {
  const seed = { ...seeded(), currentUserId: "usr-dept-bldg" };
  const id = seed.tickets[7].id;
  const waiting = applyAction(
    seed,
    {
      type: "status",
      id,
      workspace: "department",
      status: "WAITING_INFORMATION",
      reason: "ฝาท่ออยู่หน้าทางข้ามฝั่งใดครับ",
    },
    now,
  ).state;
  expect(waiting.tickets[7].status).toBe("WAITING_INFORMATION");
  expect(waiting.threadMessages.at(-1)).toMatchObject({
    ticketId: id,
    authorDepartmentId: "dept-bldg",
    body: "ฝาท่ออยู่หน้าทางข้ามฝั่งใดครับ",
  });
  expect(waiting.publicActivities.at(-1)?.summary).toBe("ขอข้อมูลเพิ่มเติมจากผู้แจ้ง");
  expect(waiting.emailLogs.map((email) => email.recipientUserId)).toEqual(["usr-rep1"]);
  const resumed = applyAction(
    waiting,
    { type: "status", id, workspace: "department", status: "IN_PROGRESS" },
    now,
  ).state;
  expect(resumed.tickets[7].status).toBe("IN_PROGRESS");
  expect(resumed.threadMessages).toEqual(waiting.threadMessages);
  expect(() =>
    applyAction(resumed, { type: "thread", id, body: "ข้อความหลังกลับมาดำเนินการ" }, now),
  ).toThrow(expect.objectContaining({ code: "THREAD_READ_ONLY" }));
});

it("purges only expired data and preserves an audit record", () => {
  const { state, data } = applyAction(seeded(), { type: "purge" }, now);
  expect(data).toBe(2);
  expect(state.auditLogs.filter((item) => item.entityType === "RETENTION")).toHaveLength(2);
  expect(state.reports.some((item) => item.id === "seed-report-16")).toBe(true);
});

it("rejects multiple department memberships even when callers bypass the picker", () => {
  const state = { ...seeded(), currentUserId: "usr-admin" };
  expect(() =>
    applyAction(
      state,
      {
        type: "user",
        id: "usr-dept-bldg",
        roles: ["DEPARTMENT_STAFF"],
        departmentId: ["dept-bldg", "dept-it"] as unknown as string,
        isActive: true,
      },
      now,
    ),
  ).toThrow(expect.objectContaining({ code: "INVALID_ROLES" }));
});

it("keeps resolved tickets final and preserves the confirmed reports", () => {
  const seed = { ...seeded(), currentUserId: "usr-dept-bldg" };
  const ticket = seed.tickets[5];
  const id = ticket.id;
  for (const status of ["IN_PROGRESS", "WAITING_INFORMATION"] as const) {
    expect(() =>
      applyAction(
        seed,
        { type: "status", id, status, workspace: "department", reason: "ตรวจพื้นที่เพิ่มเติม" },
        now,
      ),
    ).toThrow(expect.objectContaining({ code: "TICKET_IS_FINAL" }));
  }
  expect(() => applyAction(seed, { type: "affected", id }, now)).toThrow(
    expect.objectContaining({ code: "FORBIDDEN" }),
  );
  expect(() =>
    applyAction(
      { ...seed, currentUserId: "usr-rev1" },
      { type: "departments", id, ids: ["dept-bldg"] },
      now,
    ),
  ).toThrow(expect.objectContaining({ code: "TICKET_IS_FINAL" }));
  expect(() =>
    applyAction(
      { ...seed, currentUserId: "usr-rep1" },
      {
        type: "saveReport",
        targetId: id,
        draft: true,
        fields: { description: "", images: [], location: null },
      },
      now,
    ),
  ).toThrow(expect.objectContaining({ code: "TICKET_IS_FINAL" }));
  expect(seed.reports.filter((report) => report.ticketId === id)).toHaveLength(2);
  expect(seed.emailLogs).toEqual([]);
});

it("rejects direct resolution and unknown manual statuses without recording side effects", () => {
  const seed = { ...seeded(), currentUserId: "usr-dept-bldg" };
  for (const status of ["RESOLVED", "LEGACY_FINAL"]) {
    expect(() =>
      applyAction(
        seed,
        {
          type: "status",
          id: seed.tickets[0].id,
          status: status as "IN_PROGRESS",
          workspace: "department",
        },
        now,
      ),
    ).toThrow(expect.objectContaining({ code: "TRANSITION_FORBIDDEN" }));
  }
  expect(seed.tickets[0].status).toBe("IN_PROGRESS");
  expect(seed.auditLogs).toEqual([]);
  expect(seed.emailLogs).toEqual([]);
});

it("migrates retired lifecycle data without resetting the existing session", () => {
  const seed = { ...seeded(), currentUserId: "usr-dept-bldg" };
  const legacyStatus = "LEGACY_FINAL" as TicketStatus;
  const { state } = applyAction(
    seed,
    {
      type: "status",
      id: seed.tickets[0].id,
      status: "WAITING_INFORMATION",
      workspace: "department",
      reason: "ระบุตำแหน่งเพิ่มเติม",
    },
    now,
  );
  const ticket = state.tickets[6];
  state.tickets[6] = Object.assign(
    { ...ticket, status: legacyStatus },
    { obsoleteStatusReason: "ข้อมูลเดิม" },
  );
  state.publicActivities.push({
    ...state.publicActivities[0],
    type: "LEGACY_FINAL" as PublicActivityType,
    newStatus: legacyStatus,
  });
  state.emailLogs.push({ ...state.emailLogs[0], eventType: "LEGACY_FINAL" as MajorEmailEventType });
  state.auditLogs.push({ ...state.auditLogs[0], details: { from: "CONFIRMED", to: legacyStatus } });
  const migrated = migrateTicketLifecycle(state);
  expect(migrated.tickets[6]).toEqual(ticket);
  expect(migrated.tickets[5]).toEqual(state.tickets[5]);
  expect(migrated.publicActivities).toEqual(state.publicActivities.slice(0, -1));
  expect(migrated.emailLogs).toEqual(state.emailLogs.slice(0, -1));
  expect(migrated.auditLogs).toEqual(state.auditLogs.slice(0, -1));
  expect(migrated.currentUserId).toBe(state.currentUserId);
  expect(migrated.reports).toEqual(state.reports);
  expect(migrated.threadMessages).toEqual(state.threadMessages);
  expect(migrateTicketLifecycle(migrated)).toEqual(migrated);
});

it.each([undefined, 2])(
  "moves a legacy snapshot at schema %s to the KU Spot key",
  (schemaVersion) => {
    const seed = { ...seeded(), currentUserId: "usr-dept-bldg" };
    const { state } = applyAction(
      seed,
      {
        type: "status",
        id: "seed-ticket-1",
        status: "WAITING_INFORMATION",
        workspace: "department",
        reason: "โปรดระบุตำแหน่ง",
      },
      now,
    );
    const subject = state.emailLogs[0].subject.replace("[KU Spot] ", "");
    state.emailLogs[0].subject = subject;
    state.reports.find((report) => report.id === "seed-report-18")!.rejectionReason =
      "เป็นข้อร้องเรียนส่วนบุคคลซึ่งอยู่นอกขอบเขตของระบบ ชื่อเดิม";
    const values = new Map([[legacyStorageKey, JSON.stringify({ ...state, schemaVersion })]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    const migrated = readPrototypeSnapshot(storage);
    expect(migrated).toMatchObject({
      currentUserId: seed.currentUserId,
      tickets: state.tickets,
      threadMessages: state.threadMessages,
    });
    expect(
      migrated.reports.find((report) => report.id === "seed-report-18")?.rejectionReason,
    ).toContain("KU Spot");
    expect(migrated.emailLogs[0]).toEqual({
      ...state.emailLogs[0],
      subject: `[KU Spot] ${subject}`,
    });
    expect(JSON.parse(values.get("kuspot_proto_v1")!)).toEqual({ ...migrated, schemaVersion: 2 });
    expect(values.has(legacyStorageKey)).toBe(false);

    values.set(legacyStorageKey, JSON.stringify({ ...state, currentUserId: null }));
    expect(readPrototypeSnapshot(storage)).toEqual(migrated);
  },
);

it("leaves the legacy snapshot available if the new storage write fails", () => {
  const seed = { ...seeded(), currentUserId: "usr-rep1", schemaVersion: 2 };
  const values = new Map([[legacyStorageKey, JSON.stringify(seed)]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: () => {
      throw new Error("Quota exceeded");
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  expect(readPrototypeSnapshot(storage).currentUserId).toBe(seed.currentUserId);
  expect(values.get(legacyStorageKey)).toBe(JSON.stringify(seed));
  expect(values.has("kuspot_proto_v1")).toBe(false);
});

it("seeds seven distinct verified Google Workspace identities", () => {
  const { users } = seeded();
  expect(users).toHaveLength(7);
  expect(new Set(users.map((user) => user.providerSubjectId)).size).toBe(7);
  for (const user of users) {
    expect(user).toMatchObject({
      authProvider: "GOOGLE",
      providerSubjectId: `google-sub-${user.id}`,
      email: `${user.username}@ku.th`,
      emailVerified: true,
      hostedDomain: "ku.th",
      avatarUrl: null,
    });
  }
});

it.each([
  { email: "test@ku.th.example.net" },
  { emailVerified: false },
  { hostedDomain: "example.net" },
  { providerSubjectId: "" },
])("rejects an ineligible Google account (%j)", (invalid) => {
  const state = seeded();
  Object.assign(state.users[0], invalid);
  expect(migrateGoogleUsers(state)).toBe(state);
  expect(() => applyAction(state, { type: "login", userId: state.users[0].id }, now)).toThrow(
    expect.objectContaining({ code: "INVALID_ACCOUNT_DOMAIN" }),
  );
});

function legacyGoogleSnapshot() {
  const state = { ...seeded(), currentUserId: "usr-dept-bldg" };
  const { state: withThread } = applyAction(
    state,
    {
      type: "status",
      id: "seed-ticket-1",
      status: "WAITING_INFORMATION",
      workspace: "department",
      reason: "โปรดระบุตำแหน่ง",
    },
    now,
  );
  const { authProvider, providerSubjectId, emailVerified, hostedDomain, avatarUrl, ...profile } =
    withThread.users[0];
  const googleFields = { authProvider, providerSubjectId, emailVerified, hostedDomain, avatarUrl };
  const retired = {
    kuAllId: `demo-${profile.id}`,
    studentOrStaffId: "old-student-id",
    facultyOrUnit: "old-faculty",
  }; // Legacy migration fixture.
  const legacy = {
    ...profile,
    ...retired,
    username: "edited_public_name",
    email: "nattapong_ku@example.invalid",
  };
  const expectedUser = { ...profile, ...googleFields, username: legacy.username };
  const email = withThread.emailLogs.find((log) => log.recipientUserId === profile.id)!;
  email.recipientEmail = legacy.email;
  withThread.users[0] = legacy as unknown as User;
  return { state: { ...withThread, currentUserId: profile.id }, expectedUser, emailId: email.id };
}

it("upgrades the current localStorage key without changing the session or operational records", () => {
  const { state, expectedUser, emailId } = legacyGoogleSnapshot();
  const values = new Map([["kuspot_proto_v1", JSON.stringify({ ...state, schemaVersion: 2 })]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const migrated = readPrototypeSnapshot(storage);
  expect(migrated.users[0]).toEqual(expectedUser);
  expect(migrated.users.slice(1)).toEqual(state.users.slice(1));
  expect(migrated.emailLogs.find((log) => log.id === emailId)?.recipientEmail).toBe(
    expectedUser.email,
  );
  expect(migrated).toMatchObject({
    currentUserId: state.currentUserId,
    tickets: state.tickets,
    reports: state.reports,
    threadMessages: state.threadMessages,
  });
  expect(JSON.parse(values.get("kuspot_proto_v1")!).users[0]).toEqual(expectedUser);
  expect(migrateGoogleUsers(migrated)).toBe(migrated);
});

it("upgrades an existing IndexedDB snapshot in place", async () => {
  const { state, expectedUser } = legacyGoogleSnapshot();
  const database = await openPrototypeDatabase(new IDBFactory());
  try {
    await commitPrototype(
      database,
      () => state,
      (previous) => ({ state: previous }),
    );
    const { state: migrated } = await commitPrototype(database, seeded, (previous) => ({
      state: migrateGoogleUsers(previous),
    }));
    expect(migrated.users[0]).toEqual(expectedUser);
    expect(migrated).toMatchObject({
      currentUserId: state.currentUserId,
      tickets: state.tickets,
      reports: state.reports,
      threadMessages: state.threadMessages,
    });
    expect(await readStoredPrototype(database)).toEqual(migrated);
  } finally {
    database.close();
  }
});
