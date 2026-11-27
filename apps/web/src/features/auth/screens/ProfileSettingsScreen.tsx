"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  Eye,
  Globe,
  LockKeyhole,
  Mail,
  Save,
  ShieldCheck,
  UserCog,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { ActionLabel, useActionFeedback } from "@/components/shared/ActionFeedback";
import { CampusHeading } from "@/components/shared/CampusHeading";
import { AccessNotice, ErrorNotice, PageFrame } from "@/components/shared/Controls";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { isExclusiveAdmin } from "@/lib/domain/permissions";
import { type Profile, updateUsername } from "@/lib/api/identity";
import { useLiveSession } from "../LiveSession";
import { identityErrorMessage } from "../authErrors";
import { usernameError } from "@/lib/domain/validation";
import { usePrototype } from "@/lib/store/PrototypeStore";
import type { User } from "@/types/domain";
import { RoleBadge } from "../components/RoleBadge";

type Account = Profile | User;

function PublicIdentity({ user, live }: { user: Account; live: boolean }) {
  const { state, dispatch } = usePrototype();
  const { replaceUser } = useLiveSession();
  const action = useActionFeedback();
  const [name, setName] = useState(user.username);
  const [error, setError] = useState("");
  const validation = usernameError(name.trim(), live ? [] : (state?.users ?? []), user.id);
  const preview = name.trim() || user.username;

  return (
    <section
      className="campus-panel grid min-w-0 gap-5 p-5 sm:p-6"
      aria-labelledby="public-identity-heading"
    >
      <div className="grid gap-2">
        <Badge
          variant="outline"
          data-tone="success"
          className="h-auto w-fit max-w-full whitespace-normal"
        >
          <Globe aria-hidden="true" /> ข้อมูลนี้แสดงต่อสาธารณะ
        </Badge>
        <h2 id="public-identity-heading" className="font-semibold">
          ชื่อผู้ใช้สาธารณะ
        </h2>
      </div>
      <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-soft)] p-3.5">
        <Avatar size="lg" aria-hidden="true">
          <AvatarFallback className="bg-primary font-semibold text-primary-foreground">
            {preview.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">ตัวอย่างชื่อที่แสดง</p>
          <p className="font-semibold text-primary [overflow-wrap:anywhere]">@{preview}</p>
        </div>
      </div>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (validation) return;
          void action.run(
            async () => {
              if (!live) return dispatch({ type: "username", username: name });
              try {
                replaceUser(await updateUsername(name.trim()));
                return { ok: true as const };
              } catch (error) {
                return { ok: false as const, message: identityErrorMessage(error) };
              }
            },
            (result) => {
              if (result.ok) {
                setName(name.trim());
                setError("");
                toast.success("บันทึกชื่อผู้ใช้แล้ว");
              } else setError(result.message);
            },
          );
        }}
      >
        <Field data-invalid={!!validation}>
          <FieldLabel htmlFor="username">ชื่อผู้ใช้สาธารณะ</FieldLabel>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            spellCheck={false}
            value={name}
            readOnly={action.pending}
            aria-invalid={!!validation}
            aria-required="true"
            aria-describedby={validation ? "username-hint username-error" : "username-hint"}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
          />
          <FieldDescription id="username-hint">
            ใช้ตัวอักษรอังกฤษ ตัวเลข หรือขีดล่าง 3–30 ตัว เมื่อบันทึกแล้ว
            ชื่อใหม่จะแสดงในรายงานสาธารณะที่ยืนยันแล้วทั้งหมดของคุณ รวมถึงรายงานเดิม
          </FieldDescription>
          <div aria-live="polite">
            {validation && <FieldError id="username-error">{validation}</FieldError>}
          </div>
        </Field>
        {!validation && error && <ErrorNotice message={error} />}
        <Button
          type="submit"
          disabled={action.pending || !!validation || name.trim() === user.username}
          className="w-full justify-self-start sm:w-auto"
        >
          <ActionLabel pending={action.pending}>
            <Save aria-hidden="true" /> บันทึกชื่อผู้ใช้
          </ActionLabel>
        </Button>
      </form>
    </section>
  );
}

function PrivateAccount({ user, department }: { user: Account; department?: string }) {
  const fields = [
    { label: "ชื่อบัญชี Google", value: user.realName, icon: UserRound },
    { label: "อีเมลมหาวิทยาลัย (@ku.th)", value: user.email, icon: Mail },
    {
      label: "ผู้ให้บริการยืนยันตัวตน",
      value: user.hostedDomain ? `Google OAuth (โดเมน @${user.hostedDomain})` : user.authProvider,
      icon: LockKeyhole,
    },
    {
      label: "สถานะการยืนยันอีเมล",
      value: user.emailVerified ? "ยืนยันแล้ว" : "ยังไม่ยืนยัน",
      icon: ShieldCheck,
    },
  ];
  return (
    <section
      className="campus-panel grid min-w-0 gap-4 p-5 sm:p-6"
      aria-labelledby="private-account-heading"
    >
      <div className="grid gap-2">
        <Badge
          variant="outline"
          data-tone="indigo"
          className="h-auto w-fit max-w-full whitespace-normal"
        >
          <LockKeyhole aria-hidden="true" /> ไม่เปิดเผยต่อสาธารณะ
        </Badge>
        <h2 id="private-account-heading" className="font-semibold">
          ข้อมูลส่วนตัวจากบัญชี @ku.th
        </h2>
      </div>
      <dl className="grid divide-y">
        {fields.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2.5 py-3 first:pt-1 last:pb-1"
          >
            <span className="row-span-2 grid size-8 place-items-center rounded-lg bg-muted text-primary">
              <Icon size={16} aria-hidden="true" />
            </span>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="font-medium [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
      <Separator />
      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">บทบาทที่ได้รับ</h3>
        <div className="flex flex-wrap gap-1.5">
          {user.roles.map((role) => (
            <RoleBadge key={role} role={role} />
          ))}
        </div>
        {department && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Building2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> หน่วยงานปฏิบัติงาน ·{" "}
            {department}
          </p>
        )}
      </div>
    </section>
  );
}

export default function ProfileSettingsScreen() {
  const { user: demoUser, state } = usePrototype();
  const { session, refresh } = useLiveSession();
  const user = session.user ?? demoUser;
  const live = session.status === "authenticated";
  if (session.status === "loading")
    return (
      <PageFrame>
        <p role="status">กำลังโหลดโปรไฟล์…</p>
      </PageFrame>
    );
  if (session.status === "unavailable")
    return (
      <PageFrame>
        <ErrorNotice message={session.error} />
        <Button onClick={() => void refresh()}>ลองอีกครั้ง</Button>
      </PageFrame>
    );
  if (!user) return <AccessNotice loggedIn={false} path="/settings/profile" />;
  const admin = isExclusiveAdmin(user);
  const stats = [{ label: "บทบาทที่ได้รับ", value: user.roles.length }];
  if (!admin && !live && state)
    stats.push({
      label: "รายงานที่ยืนยันแล้ว",
      value: state.reports.filter(
        (report) => report.reporterId === user.id && report.status === "CONFIRMED",
      ).length,
    });
  const department = (live ? undefined : state)?.departments.find(
    (item) => item.id === user.departmentId,
  );
  return (
    <PageFrame>
      <CampusHeading
        title="ตั้งค่าโปรไฟล์"
        context="บัญชีผู้ใช้งาน · มหาวิทยาลัยเกษตรศาสตร์ วิทยาเขตบางเขน"
        icon={UserCog}
        stats={stats}
      >
        {!admin && !live && (
          <Button asChild variant="outline">
            <Link href={`/u/${encodeURIComponent(user.username)}`}>
              <Eye aria-hidden="true" /> ดูโปรไฟล์สาธารณะ
            </Link>
          </Button>
        )}
      </CampusHeading>
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <PublicIdentity user={user} live={live} key={user.id} />
        <PrivateAccount user={user} department={department?.name} />
      </div>
    </PageFrame>
  );
}
