"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, FlaskConical, LayoutGrid } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BackButton } from "@/components/shared/BackButton";
import { ErrorNotice } from "@/components/shared/Controls";
import { usePrototype } from "@/lib/store/PrototypeStore";
import { isExclusiveAdmin } from "@/lib/domain/permissions";
import { isEligibleGoogleAccount } from "@/lib/domain/validation";
import { authLink, publicFeedPath, signInPath } from "../authRoutes";
import { CampusPlan, CampusPortalBrand } from "../components/CampusPortalBrand";
import { RoleBadge } from "../components/RoleBadge";
import { useAuthRedirect } from "../useAuthRedirect";

export default function SelectMockUserScreen({ next }: { next?: string }) {
  const { dispatch, state, user } = usePrototype();
  const [error, setError] = useState("");
  useAuthRedirect(user, next);
  if (!state || user) return null;

  const accounts = state.users.filter(
    (person) => person.isActive && isEligibleGoogleAccount(person),
  );

  return (
    <div className="campus-portal-canvas min-w-0">
      <div className="mx-auto max-w-[840px] px-4 py-3 sm:px-6">
        <BackButton
          href={authLink(signInPath, next)}
          label="กลับหน้าเข้าสู่ระบบ"
          breadcrumb={{ parent: "หน้าเข้าสู่ระบบ", current: "เลือกบัญชี" }}
        />
      </div>
      <header className="campus-portal-showcase relative isolate overflow-hidden">
        <CampusPlan />
        <div className="campus-portal-enter relative mx-auto grid max-w-[840px] gap-5 px-4 py-6 text-white sm:px-6 sm:py-9">
          <CampusPortalBrand />
          <div>
            <p className="mb-1 flex items-center gap-2 text-sm font-medium">
              <FlaskConical size={16} aria-hidden="true" /> โหมดจำลอง · เลือกบัญชี @ku.th
              สำหรับทดสอบระบบ
            </p>
            <h1>เลือกบัญชี Google (@ku.th)</h1>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[840px] gap-4 px-4 py-5 sm:px-6 sm:py-7">
        <section aria-label="บัญชีทดสอบที่ใช้งานได้">
          <Card className="campus-portal-card campus-portal-enter gap-3 rounded-2xl border border-border pt-5 shadow-xl shadow-emerald-950/5 ring-0 [--portal-delay:70ms]">
            <CardHeader>
              <h2 className="text-base font-semibold">บัญชีทดสอบที่ใช้งานได้</h2>
            </CardHeader>
            <CardContent>
              {accounts.length ? (
                <ul className="grid gap-2.5">
                  {accounts.map((person) => {
                    const department = state.departments.find(
                      (item) => item.id === person.departmentId,
                    );
                    const demoTag = isExclusiveAdmin(person)
                      ? "ผู้ดูแลระบบ Exclusive"
                      : person.roles.includes("REPORTER") && person.roles.length > 1
                        ? "ทดสอบการแยกหน้าที่ (SoD)"
                        : null;
                    return (
                      <li key={person.id} className="min-w-0">
                        <Button
                          type="button"
                          variant="outline"
                          className="group/account grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5 px-3 py-3 text-start font-normal hover:bg-accent sm:items-center sm:gap-4"
                          onClick={async () => {
                            setError("");
                            const result = await dispatch({ type: "login", userId: person.id });
                            if (!result.ok) setError(result.message);
                          }}
                        >
                          <Avatar size="lg" aria-hidden="true">
                            <AvatarFallback className="bg-accent font-semibold text-primary">
                              {person.realName.slice(0, 1)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="grid min-w-0 gap-1.5 [overflow-wrap:anywhere]">
                            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="font-semibold">{person.realName}</span>
                              <span className="text-xs text-muted-foreground">
                                @{person.username}
                              </span>
                            </span>
                            <span className="text-sm text-muted-foreground">{person.email}</span>
                            <span className="flex flex-wrap items-center gap-1.5">
                              {person.roles.map((role) => (
                                <RoleBadge key={role} role={role} />
                              ))}
                              {demoTag && (
                                <Badge
                                  variant="outline"
                                  data-tone="neutral"
                                  className="h-auto max-w-full whitespace-normal"
                                >
                                  {demoTag}
                                </Badge>
                              )}
                            </span>
                            {person.roles.includes("DEPARTMENT_STAFF") && department && (
                              <span className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                                <Building2
                                  size={15}
                                  className="mt-0.5 shrink-0"
                                  aria-hidden="true"
                                />{" "}
                                {department.name}
                              </span>
                            )}
                          </span>
                          <ArrowRight
                            aria-hidden="true"
                            className="mt-2 text-primary transition-transform duration-150 motion-safe:group-hover/account:translate-x-0.5 sm:mt-0"
                          />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">ไม่มีบัญชีทดสอบ @ku.th ที่เปิดใช้งาน</p>
              )}
            </CardContent>
          </Card>
        </section>
        {error && <ErrorNotice message={error} />}
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setError("เข้าสู่ระบบไม่สำเร็จ ระบบรองรับเฉพาะบัญชี Google (@ku.th) กรุณาเลือกบัญชีมหาวิทยาลัย")
            }
          >
            <FlaskConical aria-hidden="true" /> จำลองการเข้าสู่ระบบด้วยบัญชีที่ไม่ใช่ @ku.th
          </Button>
          <Button asChild variant="outline">
            <Link href={publicFeedPath}>
              <LayoutGrid aria-hidden="true" /> เข้าชมรายการปัญหาสาธารณะ
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
