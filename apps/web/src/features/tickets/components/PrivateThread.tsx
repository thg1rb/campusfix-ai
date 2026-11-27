"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LockKeyhole, MessageCircle, Send } from "lucide-react";
import { ActionLabel, useActionFeedback } from "@/components/shared/ActionFeedback";
import { ErrorNotice } from "@/components/shared/Controls";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { roleLabels } from "@/features/auth/roleLabels";
import { canPostTicketThread, canViewTicketThread } from "@/lib/domain/permissions";
import { formatThaiDateTime } from "@/lib/format";
import { usePrototype } from "@/lib/store/PrototypeStore";
import { cn } from "@/lib/utils";
import type { PrototypeState } from "@/data/seed";
import type { ThreadMessage, Ticket } from "@/types/domain";

const threadTones = {
  REPORTER: "info",
  REVIEWER: "indigo",
  DEPARTMENT_STAFF: "teal",
} as const;

function ThreadMessages({
  messages,
  state,
  userId,
}: {
  messages: ThreadMessage[];
  state: PrototypeState;
  userId: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const previousLastId = useRef<string | undefined>(undefined);
  const lastId = messages.at(-1)?.id;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !lastId || lastId === previousLastId.current) return;
    const smooth =
      previousLastId.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: smooth ? "smooth" : "instant" });
    previousLastId.current = lastId;
  }, [lastId]);

  return (
    <div
      ref={viewportRef}
      role="log"
      aria-label="ข้อความในการสนทนา"
      aria-live="polite"
      tabIndex={0}
      className="max-h-[420px] min-h-24 min-w-0 overflow-y-auto overscroll-contain rounded-xl border border-border bg-background/80 p-3 focus-visible:outline-offset-[-3px] sm:p-4"
    >
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">ยังไม่มีข้อความในบทสนทนา</p>
      ) : (
        <ol className="grid gap-3">
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const grouped =
              previous?.authorId === message.authorId &&
              previous.authorRole === message.authorRole &&
              previous.authorDepartmentId === message.authorDepartmentId;
            const timestamp = (
              <time
                dateTime={message.createdAt}
                className="text-xs leading-relaxed text-muted-foreground"
              >
                {formatThaiDateTime(message.createdAt)}
              </time>
            );

            if (message.authorId === userId)
              return (
                <li
                  key={message.id}
                  className={cn(
                    "campus-enter ms-auto grid max-w-[85%] min-w-0 justify-items-end gap-1",
                    grouped && "-mt-1.5",
                  )}
                >
                  <p className="min-w-0 rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-primary-foreground shadow-2xs [overflow-wrap:anywhere]">
                    {message.body}
                  </p>
                  <div className="flex flex-wrap justify-end gap-x-2 px-1 text-xs text-muted-foreground">
                    <span className="font-semibold">คุณ</span>
                    {timestamp}
                  </div>
                </li>
              );

            const tone = threadTones[message.authorRole];
            const role = roleLabels[message.authorRole];
            const sender =
              message.authorRole === "DEPARTMENT_STAFF"
                ? (state.departments.find(
                    (department) => department.id === message.authorDepartmentId,
                  )?.name ?? role)
                : message.authorRole === "REPORTER"
                  ? state.users.find((user) => user.id === message.authorId)?.username
                  : role;

            return (
              <li
                key={message.id}
                className={cn(
                  "campus-enter me-auto grid max-w-[85%] min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-start gap-2",
                  grouped && "-mt-1.5",
                )}
              >
                {!grouped && (
                  <Avatar aria-hidden="true">
                    <AvatarFallback data-tone={tone} className="border font-semibold">
                      {Array.from(sender ?? role)[0]}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className="col-start-2 grid min-w-0 justify-items-start gap-1">
                  {!grouped && (
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-1">
                      <span className="text-xs font-semibold [overflow-wrap:anywhere]">
                        {message.authorRole === "REPORTER" && sender
                          ? `@${sender}`
                          : (sender ?? role)}
                      </span>
                      <Badge
                        variant="outline"
                        data-tone={tone}
                        className="h-auto max-w-full whitespace-normal"
                      >
                        {role}
                      </Badge>
                    </div>
                  )}
                  <p className="min-w-0 rounded-2xl rounded-bl-sm border border-border bg-card px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-foreground shadow-2xs [overflow-wrap:anywhere]">
                    {message.body}
                  </p>
                  <div className="px-1">{timestamp}</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function ThreadComposer({ ticketId }: { ticketId: string }) {
  const { dispatch } = usePrototype();
  const action = useActionFeedback();
  const inputId = useId();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  function send() {
    if (!body.trim()) return;
    void action.run(
      () => dispatch({ type: "thread", id: ticketId, body }),
      (result) => {
        if (result.ok) setBody((current) => (current === body ? "" : current));
        setError(result.ok ? "" : result.message);
      },
    );
  }

  return (
    <form
      className="grid min-w-0 gap-2 border-t bg-card p-3 sm:p-4"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <Field className="min-w-0 gap-2">
        <FieldLabel htmlFor={inputId} className="sr-only">
          ข้อความตอบกลับ
        </FieldLabel>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
          <Textarea
            id={inputId}
            name="thread-message"
            rows={1}
            value={body}
            aria-describedby={`${inputId}-hint`}
            className="max-h-28 min-h-11 resize-none overflow-y-auto py-2.5 leading-6"
            placeholder="พิมพ์ข้อความเพื่อส่งข้อมูลเพิ่มเติม…"
            onChange={(event) => {
              setBody(event.target.value);
              setError("");
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (!event.repeat) send();
            }}
          />
          <Button type="submit" className="min-h-11" disabled={!body.trim() || action.pending}>
            <ActionLabel pending={action.pending}>
              <Send aria-hidden="true" /> ส่ง
            </ActionLabel>
          </Button>
        </div>
        <FieldDescription id={`${inputId}-hint`} className="text-xs">
          Enter เพื่อส่ง · Shift + Enter เพื่อขึ้นบรรทัดใหม่
        </FieldDescription>
      </Field>
      {error && <ErrorNotice message={error} />}
    </form>
  );
}

export function PrivateThread({ ticket }: { ticket: Ticket }) {
  const { state, user } = usePrototype();
  const headingId = useId();
  if (!state || !user) return null;

  const messages = state.threadMessages.filter((message) => message.ticketId === ticket.id);
  if (!canViewTicketThread(user, ticket, state.reports, messages.length > 0)) return null;
  const canPost = canPostTicketThread(user, ticket, state.reports);

  return (
    <section aria-labelledby={headingId} className="campus-panel grid min-w-0 overflow-hidden">
      <header data-tone="violet" className="grid gap-2 border-b p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id={headingId} className="flex min-w-0 items-start gap-2 text-base font-semibold">
            <LockKeyhole size={19} className="mt-0.5 shrink-0" aria-hidden="true" />{" "}
            ช่องทางขอข้อมูลเพิ่มเติม
          </h2>
          <Badge
            variant="outline"
            data-tone={canPost ? "waiting" : "neutral"}
            className="h-auto max-w-full whitespace-normal"
          >
            {canPost ? <MessageCircle aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
            {canPost ? "เปิดสนทนา · รอข้อมูลเพิ่มเติม" : "ประวัติการสนทนา · อ่านอย่างเดียว"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          แชทส่วนตัวระหว่างผู้แจ้ง หน่วยงานที่รับผิดชอบ และผู้ตรวจสอบ
        </p>
      </header>
      <div className="min-w-0 p-3 sm:p-4">
        <ThreadMessages key={ticket.id} messages={messages} state={state} userId={user.id} />
      </div>
      {canPost ? (
        <ThreadComposer key={ticket.id} ticketId={ticket.id} />
      ) : (
        <p className="flex items-start gap-2 border-t bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          <LockKeyhole size={17} aria-hidden="true" className="mt-0.5 shrink-0" />
          ปิดการส่งข้อความแล้ว เนื่องจากหน่วยงานกำลังดำเนินการแก้ไข
          (แสดงเฉพาะประวัติการสนทนาจากสถานะรอข้อมูลเพิ่มเติม)
        </p>
      )}
    </section>
  );
}
