"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError } from "@/lib/api/client";
import { getMe, logout, type Profile } from "@/lib/api/identity";
import { identityErrorMessage } from "./authErrors";

type Session =
  | { status: "loading" | "guest"; user: null; error?: never }
  | { status: "unavailable"; user: null; error: string }
  | { status: "authenticated"; user: Profile; error?: never };

type SessionContext = {
  session: Session;
  refresh: () => Promise<void>;
  replaceUser: (user: Profile) => void;
  signOut: () => Promise<void>;
};

const Context = createContext<SessionContext | null>(null);

export function LiveSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: "loading", user: null });
  const pending = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    return getMe(request.signal)
      .then(
        (user) => {
          if (!request.signal.aborted) setSession({ status: "authenticated", user });
        },
        (error: unknown) => {
          if (request.signal.aborted) return;
          if (error instanceof ApiError && error.status === 401) {
            setSession({ status: "guest", user: null });
          } else {
            setSession({ status: "unavailable", user: null, error: identityErrorMessage(error) });
          }
        },
      )
      .finally(() => {
        if (pending.current === request) pending.current = null;
      });
  }, []);

  useEffect(() => {
    void refresh();
    return () => pending.current?.abort();
  }, [refresh]);

  function replaceUser(user: Profile) {
    pending.current?.abort();
    setSession({ status: "authenticated", user });
  }

  async function signOut() {
    try {
      await logout();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
    pending.current?.abort();
    setSession({ status: "guest", user: null });
  }

  return (
    <Context.Provider value={{ session, refresh, replaceUser, signOut }}>
      {children}
    </Context.Provider>
  );
}

export function useLiveSession() {
  const context = useContext(Context);
  if (!context) throw new Error("LiveSessionProvider is required");
  return context;
}
