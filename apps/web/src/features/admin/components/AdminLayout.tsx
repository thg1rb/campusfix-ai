"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AccessNotice, PageFrame } from "@/components/shared/Controls";
import { usePrototype } from "@/lib/store/PrototypeStore";
import { isExclusiveAdmin } from "@/lib/domain/permissions";

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = usePrototype();
  const path = usePathname();
  if (!isExclusiveAdmin(user)) return <AccessNotice loggedIn={!!user} path={path} />;
  return <PageFrame wide>{children}</PageFrame>;
}
