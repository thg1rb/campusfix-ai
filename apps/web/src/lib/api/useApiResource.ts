"use client";

import { useCallback, useEffect, useState } from "react";

type Result<T> =
  { status: "loading" } | { status: "ready"; value: T } | { status: "error"; error: unknown };

export function useApiResource<T>(load: (signal: AbortSignal) => Promise<T>, enabled = true) {
  const [version, setVersion] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    load: typeof load;
    version: number;
    result: Result<T>;
    lastReady?: T;
  }>();

  useEffect(() => {
    if (!enabled) return;
    const request = new AbortController();
    void load(request.signal).then(
      (value) => {
        if (!request.signal.aborted)
          setSnapshot({ load, version, result: { status: "ready", value }, lastReady: value });
      },
      (error: unknown) => {
        if (!request.signal.aborted)
          setSnapshot((previous) => ({
            load,
            version,
            result: { status: "error", error },
            lastReady: previous?.lastReady,
          }));
      },
    );
    return () => request.abort();
  }, [enabled, load, version]);

  const result: Result<T> =
    enabled && snapshot?.load === load && snapshot.version === version
      ? snapshot.result
      : { status: "loading" };
  const reload = useCallback(() => setVersion((current) => current + 1), []);
  const previousValue = enabled && result.status !== "ready" ? snapshot?.lastReady : undefined;
  return {
    result,
    reload,
    previousValue,
    isRefreshing: result.status === "loading" && previousValue !== undefined,
  };
}
