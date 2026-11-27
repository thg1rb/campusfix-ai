"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signedInDestination } from "./authRoutes";
import type { User } from "@/types/domain";

export function useAuthRedirect(user: Pick<User, "roles"> | null, next?: string) {
  const router = useRouter();
  useEffect(() => {
    if (user) router.replace(signedInDestination(user, next));
  }, [user, next, router]);
}
