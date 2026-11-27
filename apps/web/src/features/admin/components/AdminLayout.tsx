"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useLiveSession } from "@/features/auth/LiveSession";
import { Button } from "@/components/ui/button";
import { AccessNotice, ErrorNotice, PageFrame } from "@/components/shared/Controls";
import { usePrototype } from "@/lib/store/PrototypeStore";
import { isExclusiveAdmin } from "@/lib/domain/permissions";

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user: demoUser } = usePrototype();
  const { session, refresh } = useLiveSession();
  const user = session.user ?? demoUser;
  const path = usePathname();
  if (session.status === "loading")
    return (
      <PageFrame>
        <p role="status">กำลังตรวจสอบสิทธิ์…</p>
      </PageFrame>
    );
  if (session.status === "unavailable")
    return (
      <PageFrame>
        <ErrorNotice message={session.error} />
        <Button onClick={() => void refresh()}>ลองอีกครั้ง</Button>
      </PageFrame>
    );
  if (!isExclusiveAdmin(user)) return <AccessNotice loggedIn={!!user} path={path} />;
  return <PageFrame wide>{children}</PageFrame>;
}
