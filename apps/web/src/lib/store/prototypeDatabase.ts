import type { PrototypeState } from "../../data/seed";

export function openPrototypeDatabase(factory: IDBFactory, name = "ku-spot") {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("snapshot");
      db.createObjectStore("reportNumbers", { keyPath: "id" }).createIndex(
        "reportNumber",
        "reportNumber",
        { unique: true },
      );
      db.createObjectStore("ticketNumbers", { keyPath: "id" }).createIndex(
        "ticketNumber",
        "ticketNumber",
        { unique: true },
      );
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

const stores = ["snapshot", "reportNumbers", "ticketNumbers"];
const snapshotKey = "current";

export function commitPrototype<T extends { state: PrototypeState }>(
  db: IDBDatabase,
  initial: () => PrototypeState,
  apply: (state: PrototypeState) => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    // Read and write inside the same transaction. Tabs share the IndexedDB write queue.
    const tx = db.transaction(stores, "readwrite");
    const snapshot = tx.objectStore("snapshot");
    let result: T;
    let failure: unknown;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure ?? tx.error);
    const request = snapshot.get(snapshotKey);
    request.onsuccess = () => {
      try {
        const saved = request.result as PrototypeState | undefined;
        const previous = saved ?? initial();
        result = apply(previous);
        if (saved && result.state === saved) return;
        const reports = tx.objectStore("reportNumbers");
        const tickets = tx.objectStore("ticketNumbers");
        reports.clear();
        tickets.clear();
        for (const report of result.state.reports) {
          if (report.reportNumber !== null)
            reports.add({ id: report.id, reportNumber: report.reportNumber });
        }
        for (const ticket of result.state.tickets)
          tickets.add({ id: ticket.id, ticketNumber: ticket.ticketNumber });
        snapshot.put(result.state, snapshotKey);
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
  });
}

export function readStoredPrototype(db: IDBDatabase): Promise<PrototypeState | undefined> {
  return new Promise((resolve, reject) => {
    const store = db.transaction("snapshot").objectStore("snapshot");
    const request = store.get(snapshotKey);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as PrototypeState | undefined);
  });
}
