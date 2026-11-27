import { BadgeCheck, Check, CheckCircle2, MessageSquareWarning, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TicketStatus } from "@/types/domain";

export function TicketLifecycle({ status }: { status: TicketStatus }) {
  const waiting = status === "WAITING_INFORMATION";
  const current = status === "RESOLVED" ? 2 : status === "CONFIRMED" ? 0 : 1;
  const steps = [
    { title: "ยืนยันแล้ว", detail: "ผู้ตรวจสอบยืนยันเรื่อง", Icon: CheckCircle2, tone: "info" },
    {
      title: "กำลังดำเนินการ",
      detail: "หน่วยงานรับผิดชอบดำเนินงาน",
      Icon: Wrench,
      tone: waiting ? "waiting" : "warning",
    },
    { title: "แก้ไขเสร็จแล้ว", detail: "ผลการดำเนินงาน", Icon: BadgeCheck, tone: "success" },
  ];
  return (
    <section className="campus-panel grid gap-5 p-4 sm:p-6" aria-label="ความคืบหน้าของเรื่อง">
      <h2 className="font-semibold">ความคืบหน้าของเรื่อง</h2>
      <ol className="grid w-full md:grid-cols-3">
        {steps.map(({ title, detail, Icon, tone }, index) => {
          const done = index < current;
          const selected = index === current;
          return (
            <li
              key={title}
              aria-current={selected ? "step" : undefined}
              className="relative grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-3 pb-4 last:pb-0 md:grid-cols-1 md:justify-items-center md:gap-2 md:pb-0 md:text-center"
            >
              {index < 2 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-[21px] top-[44px] h-[calc(100%-44px)] border-l-2 md:left-1/2 md:top-[21px] md:h-0 md:w-full md:border-t-2 md:border-l-0",
                    done
                      ? "border-solid border-[var(--color-success)]"
                      : "border-dashed border-input",
                  )}
                />
              )}
              <span
                data-tone={done ? undefined : selected ? tone : "neutral"}
                className={cn(
                  "relative z-10 grid size-11 place-items-center rounded-full border",
                  done || (selected && status === "RESOLVED")
                    ? "!bg-[var(--color-success)] !text-white"
                    : "",
                  selected ? "campus-current ring-2 ring-[var(--tone-ink)] ring-offset-2" : "",
                )}
              >
                {done ? (
                  <Check size={20} aria-hidden="true" />
                ) : (
                  <Icon size={20} aria-hidden="true" />
                )}
              </span>
              <div className="grid min-w-0 gap-0.5 pt-1 md:justify-items-center md:px-2 md:pt-0">
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground">
                  {done ? "ผ่านขั้นตอนนี้แล้ว" : selected ? detail : "ขั้นตอนถัดไป"}
                </p>
                {selected && waiting && (
                  <span
                    data-tone="waiting"
                    className="mt-2 inline-flex w-fit max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
                  >
                    <MessageSquareWarning size={16} className="shrink-0" aria-hidden="true" />
                    รอข้อมูลเพิ่มเติม
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
