"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

const channelName = "ku-spot-live-session";

const Context = createContext<SessionContext | null>(null);

export function LiveSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: "loading", user: null });
  const channel = useRef<BroadcastChannel | null>(null);
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
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel.current = new BroadcastChannel(channelName);
        channel.current.onmessage = (event) => {
          if (event.data === "logout") {
            pending.current?.abort();
            setSession({ status: "guest", user: null });
          } else if (event.data === "profile-changed") {
            void refresh();
          }
        };
      }
    } catch {
      // Visibility revalidation also works in browsers without cross-tab channels.
    }
    void refresh();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      channel.current?.close();
      channel.current = null;
      pending.current?.abort();
    };
  }, [refresh]);

  const replaceUser = useCallback((user: Profile) => {
    pending.current?.abort();
    setSession((current) =>
      current.status === "authenticated" && current.user.id === user.id
        ? { status: "authenticated", user }
        : current,
    );
    channel.current?.postMessage("profile-changed");
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
    pending.current?.abort();
    setSession({ status: "guest", user: null });
    channel.current?.postMessage("logout");
  }, []);

  const value = useMemo(
    () => ({ session, refresh, replaceUser, signOut }),
    [session, refresh, replaceUser, signOut],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLiveSession() {
  const context = useContext(Context);
  if (!context) throw new Error("LiveSessionProvider is required");
  return context;
}
