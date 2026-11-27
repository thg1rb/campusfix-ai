"use client";

import { BackButton } from "@/components/shared/BackButton";
import { CampusHeading } from "@/components/shared/CampusHeading";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Info } from "lucide-react";
import { ActionLabel, useActionFeedback } from "@/components/shared/ActionFeedback";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccessNotice, Choice, ErrorNotice, PageFrame } from "@/components/shared/Controls";
import { TextField } from "@/components/shared/FormControls";
import { EmptyState } from "@/components/shared/EmptyState";
import { ReportStatusBadge } from "@/components/shared/Badges";
import { SoDGuardBanner } from "@/components/shared/SoDGuardBanner";
import { EvidenceGallery } from "@/features/reports";
import { CampusMap } from "@/features/map";
import { rankSimilarActiveTickets } from "@/lib/ai/mockAiService";
import {
  canReviewReport,
  canReviewOrManageTicket,
  isActiveTicket,
  isExclusiveAdmin,
} from "@/lib/domain/permissions";
import { isSeverity } from "@/lib/domain/validation";
import { formatThaiDateTime } from "@/lib/format";
import { usePrototype } from "@/lib/store/PrototypeStore";
import type { StoreAction } from "@/lib/store/mutations";
import type { AIAnalysisRun, Report, Ticket } from "@/types/domain";
import { AIReviewCard, type ReviewedReportFields } from "../components/AIReviewCard";
import { SimilarTicketCard } from "../components/SimilarTicketCard";

type ReviewDecision = Extract<StoreAction, { type: "review" }>["decision"];

function suggestedFields(run?: AIAnalysisRun): ReviewedReportFields {
  return {
    reportTitle: run?.generatedReportTitle ?? "",
    categoryId: run?.suggestedCategoryId ?? "",
    severity: run?.suggestedSeverity ?? "",
    departmentIds: run?.recommendedDepartmentIds ?? [],
  };
}

function DecisionPanel({ report, blocked }: { report: Report; blocked: boolean }) {
  const { state, user, dispatch } = usePrototype();
  const router = useRouter();
  const action = useActionFeedback();
  const run = state?.aiRuns.find(
    (item) =>
      item.reportId === report.id && item.reportVersion === report.version && !item.isOutdated,
  );
  const targets =
    state?.tickets.filter(
      (ticket) =>
        isActiveTicket(ticket.status) &&
        canReviewOrManageTicket(user, ticket, state.reports).allowed,
    ) ?? [];
  const target = [run?.candidateTicketId, report.requestedTargetTicketId].find((id) =>
    targets.some((ticket) => ticket.id === id),
  );
  const [loadedVersion, setLoadedVersion] = useState(report.version);
  const [mode, setMode] = useState("existing");
  const [ticketId, setTicketId] = useState(target ?? "");
  const [showManualTickets, setShowManualTickets] = useState(false);
  const newTabRef = useRef<HTMLButtonElement>(null);
  const [reviewed, setReviewed] = useState(() => ({
    ...suggestedFields(run),
    reportTitle: run?.generatedReportTitle ?? report.aiGeneratedTitle ?? "",
  }));
  const [title, setTitle] = useState(
    run?.ticketCandidateDraft?.suggestedTitle ?? run?.generatedReportTitle ?? "",
  );
  const [summary, setSummary] = useState(run?.status === "COMPLETED" ? report.description : "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  if (!state) return null;
  const disabled = blocked || report.status !== "PENDING_REVIEW";
  const stale = loadedVersion !== report.version;
  const { reportTitle, severity } = reviewed;
  const activeCategory =
    state.categories.find((item) => item.id === reviewed.categoryId && item.isActive)?.id ?? "";
  const activeDepartments = reviewed.departmentIds.filter((id) =>
    state.departments.some((item) => item.id === id && item.isActive),
  );
  const categoryChanged =
    run?.status === "COMPLETED" && !!activeCategory && activeCategory !== run.suggestedCategoryId;
  const candidates =
    mode === "existing" && run?.status === "COMPLETED"
      ? categoryChanged
        ? rankSimilarActiveTickets(
            report,
            { ...state, tickets: targets },
            run.createdAt,
            activeCategory,
          )
        : (run.similarCandidates ?? rankSimilarActiveTickets(report, state, run.createdAt))
      : [];
  const similarTickets = candidates.flatMap((candidate) => {
    const ticket = targets.find((item) => item.id === candidate.ticketId);
    return ticket ? [{ ticket, similarity: candidate.similarity }] : [];
  });
  const manualTickets = targets.filter(
    (ticket) => !similarTickets.some((candidate) => candidate.ticket.id === ticket.id),
  );
  const selectedTicket = targets.find((ticket) => ticket.id === ticketId);
  const fieldsDisabled = disabled || stale || action.pending;
  const staleWarning = "รายงานนี้ถูกผู้แจ้งแก้ไขระหว่างที่คุณกำลังตรวจสอบ กรุณาโหลดข้อมูลล่าสุดก่อนยืนยันหรือปฏิเสธ";

  function decide(decision: ReviewDecision) {
    if (stale) {
      setError(staleWarning);
      return;
    }
    void action.run(
      () => dispatch({ type: "review", id: report.id, version: loadedVersion, decision }),
      (result) => {
        if (result.ok) {
          toast.success(
            decision.kind === "reject" ? "ปฏิเสธรายงานแล้ว" : "ยืนยันรายงานและบันทึกอีเมลจำลองแล้ว",
          );
          router.push(
            decision.kind === "reject" ? "/reviewer" : `/reviewer/tickets/${result.publicNumber}`,
          );
        } else setError(result.message);
      },
    );
  }

  function confirm(kind: "existing" | "new") {
    if (stale) {
      setError(staleWarning);
      return;
    }
    if (kind === "existing" && !selectedTicket) {
      setError("กรุณาเลือกเรื่องที่เปิดอยู่");
      return;
    }
    if (!activeCategory || !isSeverity(severity)) {
      setError("กรุณาเลือกประเภทปัญหาและความรุนแรง");
      return;
    }
    if (!activeDepartments.length) {
      setError("กรุณาเลือกหน่วยงานที่เปิดใช้งานอย่างน้อย 1 แห่ง");
      return;
    }
    const verified = {
      reportTitle,
      categoryId: activeCategory,
      severity,
      departmentIds: activeDepartments,
    };
    decide(
      kind === "existing" ? { ...verified, kind, ticketId } : { ...verified, kind, title, summary },
    );
  }

  function ticketCard(ticket: Ticket, ranking?: { rank: number; similarity: number }) {
    const confirmed =
      state?.reports.filter((item) => item.ticketId === ticket.id && item.status === "CONFIRMED") ??
      [];
    return (
      <SimilarTicketCard
        key={ticket.id}
        ticket={ticket}
        ranking={ranking}
        photo={confirmed[0]?.images[0]}
        reportCount={confirmed.length}
        category={
          state?.categories.find((item) => item.id === ticket.categoryId)?.name ?? "ไม่ระบุประเภท"
        }
        selected={ticketId === ticket.id}
        disabled={fieldsDisabled}
        onSelect={() => {
          setTicketId(ticket.id);
          setError("");
        }}
      />
    );
  }

  return (
    <section className="grid min-w-0 content-start gap-3 rounded-lg border bg-card p-4">
      <h2>ผลการตรวจสอบ</h2>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>กำลังตรวจสอบเวอร์ชัน v{loadedVersion}</span>
        {!disabled && (
          <Button
            variant="outline"
            onClick={async () => {
              const result = await dispatch({ type: "simulateEdit", id: report.id });
              if (!result.ok) setError(result.message);
            }}
          >
            จำลองผู้แจ้งแก้ไขรายงานตอนนี้
          </Button>
        )}
      </div>
      {stale && (
        <>
          <ErrorNotice message={staleWarning} />
          <Button
            variant="outline"
            className="justify-self-start"
            onClick={() => {
              setLoadedVersion(report.version);
              setError("");
              setReviewed(suggestedFields(run));
              setTitle(
                run?.ticketCandidateDraft?.suggestedTitle ?? run?.generatedReportTitle ?? "",
              );
              setSummary(run?.status === "COMPLETED" ? report.description : "");
              setTicketId(target ?? "");
            }}
          >
            โหลดข้อมูลล่าสุด
          </Button>
        </>
      )}
      {error && (!stale || error !== staleWarning) && <ErrorNotice message={error} />}
      <AIReviewCard
        run={run}
        candidateNumber={
          state.tickets.find((ticket) => ticket.id === run?.candidateTicketId)?.ticketNumber
        }
        fields={{ ...reviewed, categoryId: activeCategory, departmentIds: activeDepartments }}
        categories={state.categories}
        departments={state.departments}
        compact={mode === "reject"}
        disabled={fieldsDisabled}
        onChange={(patch) => {
          setReviewed((current) => ({ ...current, ...patch }));
          setError("");
        }}
        onReset={() => {
          setReviewed(suggestedFields(run));
          setError("");
        }}
      />
      <Tabs
        value={mode}
        onValueChange={(value) => {
          setMode(value);
          setError("");
        }}
        className="min-w-0"
      >
        <TabsList aria-label="ผลการตรวจสอบ">
          <TabsTrigger value="existing">เรื่องเดิม</TabsTrigger>
          <TabsTrigger ref={newTabRef} value="new">
            เรื่องใหม่
          </TabsTrigger>
          <TabsTrigger value="reject">ปฏิเสธ</TabsTrigger>
        </TabsList>
        <TabsContent value="existing" className="grid min-w-0 gap-4">
          {similarTickets.length > 0 && (
            <section aria-labelledby="similar-tickets-heading" className="grid min-w-0 gap-2">
              <h3 id="similar-tickets-heading" className="text-sm font-semibold">
                เรื่องที่คล้ายกันที่แนะนำ (สูงสุด 3 อันดับ)
              </h3>
              <ol className="grid min-w-0 gap-3">
                {similarTickets.map(({ ticket, similarity }, index) =>
                  ticketCard(ticket, { rank: index + 1, similarity }),
                )}
              </ol>
            </section>
          )}
          {similarTickets.length === 0 && (
            <Alert data-tone="neutral">
              <Info aria-hidden="true" />
              <AlertDescription className="grid gap-2">
                <p>
                  {run?.status === "FAILED"
                    ? "AI จัดอันดับเรื่องที่คล้ายกันไม่ได้"
                    : "ระบบไม่มีเรื่องเดิมที่จะแนะนำโดยอัตโนมัติ"}{" "}
                  หากไม่พบเรื่องที่ตรงกัน สามารถกรอกข้อมูลเพื่อสร้างเรื่องใหม่ได้
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-self-start"
                  onClick={() => {
                    setMode("new");
                    setError("");
                    newTabRef.current?.focus();
                  }}
                >
                  สลับไปสร้างเรื่องใหม่
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {manualTickets.length > 0 && (
            <section className="grid min-w-0 gap-3">
              <Button
                type="button"
                variant="outline"
                className="justify-self-start"
                aria-expanded={showManualTickets}
                aria-controls="other-active-tickets"
                onClick={() => setShowManualTickets((open) => !open)}
              >
                {showManualTickets ? "ซ่อนเรื่องที่เปิดอยู่อื่น ๆ" : "ดูเรื่องที่เปิดอยู่อื่น ๆ"}
              </Button>
              <div id="other-active-tickets" hidden={!showManualTickets}>
                {showManualTickets && (
                  <ul aria-label="เรื่องที่เปิดอยู่อื่น ๆ" className="grid min-w-0 gap-3">
                    {manualTickets.map((ticket) => ticketCard(ticket))}
                  </ul>
                )}
              </div>
            </section>
          )}
          {selectedTicket && (
            <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
              เรื่องที่เลือก · {selectedTicket.ticketNumber} {selectedTicket.title}
            </p>
          )}
          {(similarTickets.length > 0 || showManualTickets || selectedTicket) && (
            <Button disabled={disabled || action.pending} onClick={() => confirm("existing")}>
              <ActionLabel pending={action.pending}>ยืนยันและรวมเข้า Ticket เดิม</ActionLabel>
            </Button>
          )}
        </TabsContent>
        <TabsContent value="new" className="grid gap-3">
          <TextField
            label="ชื่อเรื่อง"
            required
            value={title}
            onChange={setTitle}
            disabled={fieldsDisabled}
          />
          <TextField
            label="สรุปเรื่อง"
            required
            multiline
            value={summary}
            onChange={setSummary}
            disabled={fieldsDisabled}
          />
          <Button disabled={disabled || action.pending} onClick={() => confirm("new")}>
            <ActionLabel pending={action.pending}>ยืนยันสร้าง Ticket ใหม่</ActionLabel>
          </Button>
        </TabsContent>
        <TabsContent value="reject" className="grid gap-3">
          <Choice
            label="เหตุผลที่ใช้บ่อย"
            value={
              [
                "อยู่นอกขอบเขตระบบ",
                "ข้อมูลไม่เพียงพอไม่สามารถดำเนินการได้",
                "มีข้อมูลส่วนบุคคลหรือข้อมูลอ่อนไหว",
              ].includes(reason)
                ? reason
                : ""
            }
            options={[
              "อยู่นอกขอบเขตระบบ",
              "ข้อมูลไม่เพียงพอไม่สามารถดำเนินการได้",
              "มีข้อมูลส่วนบุคคลหรือข้อมูลอ่อนไหว",
            ].map((value) => ({ value, label: value }))}
            onChange={setReason}
            disabled={disabled}
          />
          <TextField
            label="เหตุผลการปฏิเสธ"
            required
            multiline
            value={reason}
            onChange={setReason}
            disabled={disabled}
          />
          <Button
            variant="destructive"
            disabled={disabled || action.pending}
            onClick={() => decide({ kind: "reject", reason })}
          >
            <ActionLabel pending={action.pending}>ปฏิเสธรายงาน</ActionLabel>
          </Button>
        </TabsContent>
      </Tabs>
    </section>
  );
}

export default function ReviewerReportScreen({ reportNumber }: { reportNumber: string }) {
  const { state, user } = usePrototype();
  if (!state || !user?.roles.includes("REVIEWER") || isExclusiveAdmin(user))
    return <AccessNotice loggedIn={!!user} path={`/reviewer/reports/${reportNumber}`} />;
  const report = state.reports.find((item) => item.reportNumber === reportNumber);
  if (!report || !["PENDING_REVIEW", "CONFIRMED", "REJECTED"].includes(report.status))
    return (
      <PageFrame>
        <BackButton href="/reviewer" label="กลับคิวตรวจสอบ" />
        <EmptyState title="ไม่พบรายงานที่ตรวจสอบได้" />
      </PageFrame>
    );
  const guard = canReviewReport(user, report);
  const requestedTicket = state.tickets.find(
    (ticket) => ticket.id === report.requestedTargetTicketId,
  );
  return (
    <PageFrame>
      <BackButton
        href="/reviewer"
        label="กลับคิวตรวจสอบ"
        breadcrumb={{ parent: "คิวตรวจสอบ", current: reportNumber }}
      />
      <CampusHeading
        title="ตรวจสอบรายงาน"
        context="คิวตรวจสอบรายงาน"
        icon={ClipboardCheck}
        badges={
          <>
            <span className="text-sm font-medium" translate="no">
              {report.reportNumber}
            </span>
            <ReportStatusBadge status={report.status} />
          </>
        }
      />
      {!guard.allowed && <SoDGuardBanner reason={guard.reason} />}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <section className="grid min-w-0 content-start gap-3 rounded-lg border bg-card p-4">
          <h2>รายละเอียดและหลักฐาน</h2>
          <p className="text-sm text-muted-foreground">
            @{state.users.find((item) => item.id === report.reporterId)?.username} · ส่ง{" "}
            {formatThaiDateTime(report.submittedAt)}
          </p>
          <p className="text-sm text-muted-foreground">
            อัปเดต {formatThaiDateTime(report.updatedAt)}
          </p>
          {requestedTicket && (
            <p className="rounded-md bg-muted p-3">ผู้แจ้งเริ่มจากเรื่อง {requestedTicket.ticketNumber}</p>
          )}
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{report.description}</p>
          <EvidenceGallery images={report.images} />
          {report.location && (
            <>
              <p>
                {report.location.locationName} {report.location.detailNote}
              </p>
              <CampusMap point={report.location} />
            </>
          )}
        </section>
        <DecisionPanel key={`${report.id}:${user.id}`} report={report} blocked={!guard.allowed} />
      </div>
    </PageFrame>
  );
}
