"use client";

import { BackButton } from "@/components/shared/BackButton";
import { CampusHeading } from "@/components/shared/CampusHeading";
import { Wrench } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ActionLabel, useActionFeedback } from "@/components/shared/ActionFeedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AccessNotice, ErrorNotice, PageFrame } from "@/components/shared/Controls";
import { TextField } from "@/components/shared/FormControls";
import { SeverityBadge, StatusBadge } from "@/components/shared/Badges";
import { EmptyState } from "@/components/shared/EmptyState";
import { SoDGuardBanner } from "@/components/shared/SoDGuardBanner";
import { ImageUploader } from "@/features/reports";
import {
  DepartmentProgress,
  PrivateThread,
  PublicActivityTimeline,
  TicketStatusActions,
} from "@/features/tickets";
import {
  canOperateAsDepartmentOnTicket,
  isActiveTicket,
  isExclusiveAdmin,
} from "@/lib/domain/permissions";
import { usePrototype } from "@/lib/store/PrototypeStore";
import type { ReportImage, Ticket } from "@/types/domain";

function OperationDialog({
  ticket,
  disabled,
  complete,
  last,
}: {
  ticket: Ticket;
  disabled: boolean;
  complete: boolean;
  last: boolean;
}) {
  const { dispatch } = usePrototype();
  const action = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<ReportImage[]>([]);
  const [error, setError] = useState("");
  const heading = complete ? "ยืนยันเสร็จสิ้นในส่วนของหน่วยงาน" : "บันทึกการดำเนินงาน";
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          setNote("");
          setEvidence([]);
          setError("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={disabled} variant={complete ? "default" : "outline"}>
          {heading}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>
            {complete && last
              ? "เมื่อยืนยัน หน่วยงานที่รับผิดชอบจะเสร็จสิ้นครบและระบบจะเปลี่ยนสถานะเป็นแก้ไขเสร็จแล้วทันที"
              : "ข้อมูลการดำเนินงานและภาพหลักฐานจะแสดงในไทม์ไลน์สาธารณะ"}
          </DialogDescription>
        </DialogHeader>
        <TextField
          label={complete ? "สรุปการดำเนินงาน (ถ้ามี)" : "รายละเอียดการดำเนินงาน"}
          value={note}
          onChange={setNote}
          required={!complete}
          multiline
        />
        <ImageUploader images={evidence} onChange={setEvidence} optional />
        {error && <ErrorNotice message={error} />}
        <DialogFooter>
          <Button
            disabled={action.pending}
            onClick={() => {
              void action.run(
                () => dispatch({ type: "operation", id: ticket.id, complete, note, evidence }),
                (result) => {
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  toast.success(
                    complete
                      ? last
                        ? "แก้ไขเสร็จแล้วและบันทึกอีเมลจำลองแล้ว"
                        : "ยืนยันการเสร็จสิ้นของหน่วยงานแล้ว"
                      : "บันทึกการดำเนินงานแล้ว",
                  );
                  setOpen(false);
                  setNote("");
                  setEvidence([]);
                  setError("");
                },
                complete,
              );
            }}
          >
            <ActionLabel pending={action.pending}>
              {complete ? "ยืนยันเสร็จสิ้น" : "บันทึกการดำเนินงาน"}
            </ActionLabel>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DepartmentTicketScreen({ ticketNumber }: { ticketNumber: string }) {
  const { state, user } = usePrototype();
  const path = `/department/tickets/${ticketNumber}`;
  if (
    !state ||
    !user?.roles.includes("DEPARTMENT_STAFF") ||
    !user.departmentId ||
    isExclusiveAdmin(user)
  )
    return <AccessNotice loggedIn={!!user} path={path} />;
  const ticket = state.tickets.find((item) => item.ticketNumber === ticketNumber);
  if (!ticket)
    return (
      <PageFrame>
        <BackButton href="/department" label="กลับรายการงานของหน่วยงาน" />
        <EmptyState title="ไม่พบเรื่องที่ระบุ" />
      </PageFrame>
    );
  const assignment = ticket.departments.find((item) => item.departmentId === user.departmentId);
  if (!assignment) return <AccessNotice loggedIn path={path} />;
  const guard = canOperateAsDepartmentOnTicket(user, ticket, state.reports);
  const active = isActiveTicket(ticket.status);
  const last = ticket.departments.every((item) => item === assignment || item.isCompleted);
  const disabled = !guard.allowed || !active;
  return (
    <PageFrame>
      <BackButton
        href="/department"
        label="กลับรายการงานของหน่วยงาน"
        breadcrumb={{ parent: "งานหน่วยงาน", current: ticket.ticketNumber }}
      />
      <CampusHeading
        title={ticket.title}
        context="งานของหน่วยงาน"
        icon={Wrench}
        subtitle={ticket.location.locationName}
        badges={
          <>
            <span className="text-sm font-medium" translate="no">
              {ticket.ticketNumber}
            </span>
            <StatusBadge status={ticket.status} />
            <SeverityBadge level={ticket.severity} />
          </>
        }
      >
        <Button asChild variant="outline">
          <Link href={`/tickets/${ticket.ticketNumber}`}>เปิดรายละเอียดสาธารณะ</Link>
        </Button>
      </CampusHeading>
      {!guard.allowed && <SoDGuardBanner reason={guard.reason} />}
      {!active && (
        <p className="rounded-md border bg-card p-3">
          เรื่องนี้สิ้นสุดแล้ว รายละเอียดการดำเนินงานแสดงในหน้าสาธารณะ
        </p>
      )}
      <TicketStatusActions ticket={ticket} disabled={disabled} workspace="department" />
      {ticket.status === "IN_PROGRESS" && (
        <div className="flex flex-wrap gap-2">
          <OperationDialog ticket={ticket} disabled={disabled} complete={false} last={false} />
          <OperationDialog
            ticket={ticket}
            disabled={disabled || assignment.isCompleted}
            complete
            last={last}
          />
        </div>
      )}
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <div className="grid min-w-0 content-start gap-4">
          <section className="grid gap-2 rounded-lg border bg-card p-4">
            <h2>รายละเอียดปัญหา</h2>
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{ticket.summary}</p>
          </section>
          <DepartmentProgress ticket={ticket} />
          <PublicActivityTimeline ticket={ticket} />
        </div>
        <div className="min-w-0">
          <PrivateThread key={user.id} ticket={ticket} />
        </div>
      </div>
    </PageFrame>
  );
}
