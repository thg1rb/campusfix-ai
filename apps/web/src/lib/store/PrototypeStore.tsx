"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  createSeed,
  demoRejectionReason,
  demoRejectionReasonPrefix,
  demoRejectionReportId,
  type PrototypeState,
} from "../../data/seed";
import { useLiveSession } from "../../features/auth/LiveSession";
import { brandEmailSubject } from "../brand";
import type { User } from "../../types/domain";
import { DomainError, isUniversityEmail } from "../domain/validation";
import { applyAction, currentUser, type StoreAction } from "./mutations";
import { migrateTicketLifecycle } from "./migrateTicketLifecycle";
import { migrateRecordNumbers } from "./migrateRecordNumbers";
import { commitPrototype, openPrototypeDatabase, readStoredPrototype } from "./prototypeDatabase";

const storageKey = "kuspot_proto_v1";
export const legacyStorageKey = "campusfix_proto_v1";
const currentSchemaVersion = 2;

type Result =
  | { ok: true; data: string | number | undefined; publicNumber?: string }
  | { ok: false; errorCode: string; message: string };
type SnapshotStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// Older browser snapshots contain simulated university identities.
export function migrateGoogleUsers(saved: PrototypeState): PrototypeState {
  const legacySuffix = "@example.invalid";
  const updatedEmails = new Map<string, { previous: string; next: string }>();
  let changed = false;
  const users = saved.users.map((user): User => {
    const legacy = user as User & {
      kuAllId?: string;
      studentOrStaffId?: string;
      facultyOrUnit?: string;
    };
    const hasGoogleIdentity = legacy.authProvider === "GOOGLE";
    if (
      hasGoogleIdentity &&
      !("kuAllId" in legacy) &&
      !("studentOrStaffId" in legacy) &&
      !("facultyOrUnit" in legacy)
    )
      return user;

    changed = true;
    let email = user.email;
    if (
      !hasGoogleIdentity &&
      legacy.kuAllId === `demo-${user.id}` &&
      email.endsWith(legacySuffix)
    ) {
      email = email.slice(0, -legacySuffix.length) + "@ku.th";
      updatedEmails.set(user.id, { previous: user.email, next: email });
    }

    return {
      id: user.id,
      username: user.username,
      realName: user.realName,
      email,
      roles: user.roles,
      departmentId: user.departmentId,
      isActive: user.isActive,
      createdAt: user.createdAt,
      authProvider: "GOOGLE",
      providerSubjectId: hasGoogleIdentity ? user.providerSubjectId : `google-sub-${user.id}`,
      emailVerified: hasGoogleIdentity ? user.emailVerified : isUniversityEmail(email),
      hostedDomain: hasGoogleIdentity ? user.hostedDomain : "ku.th",
      avatarUrl: user.avatarUrl ?? null,
    };
  });
  if (!changed) return saved;
  const emailLogs = updatedEmails.size
    ? saved.emailLogs.map((log) => {
        const replacement = updatedEmails.get(log.recipientUserId);
        return replacement && log.recipientEmail === replacement.previous
          ? { ...log, recipientEmail: replacement.next }
          : log;
      })
    : saved.emailLogs;
  return { ...saved, users, emailLogs };
}

function persist(storage: SnapshotStorage, next: PrototypeState) {
  storage.setItem(storageKey, JSON.stringify({ ...next, schemaVersion: currentSchemaVersion }));
}

export function readPrototypeSnapshot(storage?: SnapshotStorage): PrototypeState {
  try {
    const browserStorage = storage ?? localStorage;
    const current = browserStorage.getItem(storageKey);
    const fromLegacy = current === null;
    const raw = current ?? browserStorage.getItem(legacyStorageKey);
    if (raw) {
      const { schemaVersion, ...saved } = JSON.parse(raw) as PrototypeState & {
        schemaVersion?: number;
      };
      if (Array.isArray(saved.reports) && Array.isArray(saved.users) && saved.demoConfig) {
        const lifecycle =
          schemaVersion === currentSchemaVersion ? saved : migrateTicketLifecycle(saved);
        const upgraded = migrateGoogleUsers(lifecycle);
        if (fromLegacy) {
          const report = upgraded.reports.find(
            (item) => item.id === demoRejectionReportId || /^RPT-\d{4}-0*18$/.test(item.id),
          );
          if (report?.rejectionReason?.startsWith(demoRejectionReasonPrefix))
            report.rejectionReason = demoRejectionReason;
          for (const email of upgraded.emailLogs) email.subject = brandEmailSubject(email.subject);
        }
        if (fromLegacy || schemaVersion !== currentSchemaVersion || upgraded !== lifecycle) {
          try {
            persist(browserStorage, upgraded);
            if (fromLegacy) browserStorage.removeItem(legacyStorageKey);
          } catch {
            // Preserve the already-saved snapshot if the upgraded copy cannot be written.
          }
        }
        return upgraded;
      }
    }
  } catch {
    // Recover from a corrupt prototype snapshot.
  }
  return createSeed();
}

function createStore() {
  let state: PrototypeState | null = null;
  let database: Promise<IDBDatabase> | undefined;
  let channel: BroadcastChannel | undefined;
  let generation = 0;
  const listeners = new Set<() => void>();
  const open = () => (database ??= openPrototypeDatabase(indexedDB));
  const initial = () => migrateRecordNumbers(readPrototypeSnapshot());
  function publish(next: PrototypeState) {
    state = next;
    listeners.forEach((listener) => listener());
  }
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => state,
    hydrate() {
      let active = true;
      const refresh = async () => {
        const version = ++generation;
        try {
          const db = await open();
          const saved = await readStoredPrototype(db);
          const snapshot =
            saved && migrateGoogleUsers(saved) === saved
              ? saved
              : (
                  await commitPrototype(db, initial, (previous) => ({
                    state: migrateGoogleUsers(previous),
                  }))
                ).state;
          if (active && version === generation) publish(snapshot);
        } catch {
          if (active && version === generation && !state) publish(initial());
        }
      };
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel("ku-spot-state");
        channel.onmessage = () => {
          void refresh();
        };
      }
      window.addEventListener("focus", refresh);
      void refresh();
      return () => {
        active = false;
        channel?.close();
        channel = undefined;
        window.removeEventListener("focus", refresh);
      };
    },
    async dispatch(action: StoreAction): Promise<Result> {
      try {
        const db = await open();
        const { state: next, data } = await commitPrototype(db, initial, (previous) =>
          applyAction(migrateGoogleUsers(previous), action),
        );
        generation++;
        publish(next);
        channel?.postMessage("updated");
        const publicNumber =
          action.type === "saveReport"
            ? (next.reports.find((report) => report.id === data)?.reportNumber ?? undefined)
            : action.type === "review"
              ? next.tickets.find((ticket) => ticket.id === data)?.ticketNumber
              : undefined;
        return { ok: true, data, publicNumber };
      } catch (error) {
        if (error instanceof DomainError)
          return { ok: false, errorCode: error.code, message: error.message };
        return {
          ok: false,
          errorCode: "STORAGE_ERROR",
          message: "บันทึกข้อมูลในเบราว์เซอร์ไม่สำเร็จ กรุณาตรวจสอบพื้นที่จัดเก็บแล้วลองอีกครั้ง",
        };
      }
    },
  };
}

type Store = ReturnType<typeof createStore>;
const Context = createContext<Store | null>(null);
const serverSnapshot = () => null;

export function PrototypeStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createStore);
  useEffect(() => store.hydrate(), [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

export function usePrototype() {
  const store = useContext(Context);
  if (!store) throw new Error("PrototypeStoreProvider is required");
  const snapshot = useSyncExternalStore(store.subscribe, store.snapshot, serverSnapshot);
  const { session } = useLiveSession();
  const demoAvailable = process.env.NODE_ENV === "development" && session.status === "guest";
  const state =
    snapshot && !demoAvailable && snapshot.currentUserId
      ? { ...snapshot, currentUserId: null }
      : snapshot;
  const dispatch = (action: StoreAction): Promise<Result> => {
    if (demoAvailable || (action.type === "login" && action.userId === null))
      return store.dispatch(action);
    return Promise.resolve({
      ok: false,
      errorCode: "DEMO_UNAVAILABLE",
      message: "โหมดจำลองใช้ได้ด้วยบัญชีทดสอบเท่านั้น",
    });
  };
  return { state, user: state ? currentUser(state) : null, dispatch, demoAvailable };
}
