"use client";

import type { ReactNode } from "react";
import { AccessNotice, ErrorNotice, PageFrame } from "@/components/shared/Controls";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveSession } from "@/features/auth/LiveSession";
import { isExclusiveAdmin } from "@/lib/domain/permissions";
import { usePrototype } from "@/lib/store/PrototypeStore";
import { reportErrorMessage } from "../liveReport";

export function ReportLoading() {
  return (
    <PageFrame>
      <div role="status" className="grid gap-3">
        <span className="sr-only">กำลังโหลดรายงาน…</span>
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-44 w-full" />
      </div>
    </PageFrame>
  );
}

export function ReportLoadError({ error, reload }: { error: unknown; reload: () => void }) {
  return (
    <PageFrame>
      <ErrorNotice message={reportErrorMessage(error)} />
      <Button variant="outline" className="justify-self-start" onClick={reload}>
        ลองอีกครั้ง
      </Button>
    </PageFrame>
  );
}

export function ReporterAccess({
  path,
  write = false,
  children,
}: {
  path: string;
  write?: boolean;
  children: (access: { live: boolean; userId: string; canWrite: boolean }) => ReactNode;
}) {
  const { session, refresh } = useLiveSession();
  const { state, user, demoAvailable } = usePrototype();
  if (session.status === "loading" || (demoAvailable && !state)) return <ReportLoading />;
  if (session.status === "unavailable") {
    return (
      <PageFrame>
        <ErrorNotice message={session.error} />
        <Button variant="outline" className="justify-self-start" onClick={() => void refresh()}>
          ลองอีกครั้ง
        </Button>
      </PageFrame>
    );
  }
  const live = session.status === "authenticated";
  const actor = live ? session.user : demoAvailable ? user : null;
  const canWrite = !live || !!actor?.roles.includes("REPORTER");
  if (!actor || isExclusiveAdmin(actor) || (write && !canWrite))
    return <AccessNotice loggedIn={!!actor} path={path} />;
  return children({ live, userId: actor.id, canWrite });
}
