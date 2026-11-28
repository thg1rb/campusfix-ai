"use client";

import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Choice, ErrorNotice, labelOptions, PageFrame } from "@/components/shared/Controls";
import { EmptyState } from "@/components/shared/EmptyState";
import { reportStatusLabels } from "@/components/shared/Badges";
import { formatThaiDateTime } from "@/lib/format";
import { usePrototype } from "@/lib/store/PrototypeStore";
import { useCallback, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useApiResource } from "@/lib/api/useApiResource";
import { cancelPendingReport, listMyReports } from "@/lib/api/reports";
import type { ReportStatus } from "@/types/domain";
import { asReport, reportErrorMessage } from "../liveReport";
import { ReporterAccess, ReportLoading, ReportLoadError } from "../components/ReporterAccess";
import { CampusHeading } from "@/components/shared/CampusHeading";
import { allResults, matchesSearch, ResultFilters } from "@/components/shared/ResultFilters";
import { PaginationBar } from "@/components/shared/PaginationBar";
import { usePagination } from "@/hooks/usePagination";
import { ReportListCard, reportListTitle } from "../components/ReportListCard";

function ReportList({
  live,
  userId,
  canWrite,
}: {
  live: boolean;
  userId: string;
  canWrite: boolean;
}) {
  const { state, dispatch } = usePrototype();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const debounced = useDebouncedValue(query.trim());
  const pagination = usePagination(JSON.stringify([filter, live ? debounced : query]));
  const { requestedPage, size, setPage } = pagination;
  const [cancelling, setCancelling] = useState<string>();
  const cancellingRef = useRef(false);
  const [error, setError] = useState("");
  const load = useCallback(
    (signal: AbortSignal) =>
      listMyReports(
        {
          page: requestedPage,
          pageSize: size,
          q: debounced,
          status: filter === "all" ? undefined : (filter as ReportStatus),
        },
        signal,
      ),
    [requestedPage, size, debounced, filter],
  );
  const resource = useApiResource(load, live);
  const response =
    resource.result.status === "ready" ? resource.result.value : resource.previousValue;
  if (live && !response) {
    if (resource.result.status === "error")
      return <ReportLoadError error={resource.result.error} reload={resource.reload} />;
    return <ReportLoading />;
  }
  if (
    live &&
    resource.result.status === "ready" &&
    requestedPage > Math.max(1, resource.result.value.pagination.totalPages)
  ) {
    setPage(Math.max(1, resource.result.value.pagination.totalPages));
  }

  const mine = live ? [] : (state?.reports.filter((item) => item.reporterId === userId) ?? []);
  const filtered = mine
    .filter(
      (item) =>
        (filter === "all" || filter === item.status) &&
        matchesSearch(
          query,
          item.reportNumber,
          reportListTitle(item),
          item.description,
          item.location?.locationName,
          item.location?.detailNote,
        ),
    )
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const page = response
    ? {
        items: response.items.map(asReport),
        controls: {
          ...pagination.controls(response.pagination.totalItems, response.pagination.page),
          size: response.pagination.pageSize,
        },
      }
    : pagination.current(filtered);

  const statusCount = (status: ReportStatus) =>
    mine.filter((report) => report.status === status).length;
  const counts = response?.counts ?? {
    total: mine.length,
    draft: statusCount("DRAFT"),
    pendingReview: statusCount("PENDING_REVIEW"),
    confirmed: statusCount("CONFIRMED"),
    rejected: statusCount("REJECTED"),
    cancelled: statusCount("CANCELLED"),
  };

  async function cancel(id: string) {
    if (cancellingRef.current) return;
    setError("");
    setCancelling(id);
    cancellingRef.current = true;
    try {
      if (live) {
        await cancelPendingReport(id);
        resource.reload();
      } else {
        const result = await dispatch({ type: "cancelReport", id });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
      }
      toast.success("ยกเลิกรายงานแล้ว");
    } catch (cause) {
      setError(reportErrorMessage(cause));
      resource.reload();
    } finally {
      setCancelling(undefined);
      cancellingRef.current = false;
    }
  }
  return (
    <PageFrame wide>
      <CampusHeading
        title="รายงานของฉัน"
        context="มหาวิทยาลัยเกษตรศาสตร์ · วิทยาเขตบางเขน"
        icon={FileText}
        stats={[
          { label: "ทั้งหมด", value: counts.total },
          { label: "รอตรวจสอบ", value: counts.pendingReview },
          { label: "ยืนยันแล้ว", value: counts.confirmed },
          { label: "ฉบับร่าง", value: counts.draft },
          ...(live
            ? [
                { label: "ปฏิเสธ", value: counts.rejected },
                { label: "ยกเลิก", value: counts.cancelled },
              ]
            : []),
        ]}
      >
        {canWrite && (
          <Button asChild>
            <Link href="/reports/new">
              <Plus aria-hidden="true" /> แจ้งปัญหา
            </Link>
          </Button>
        )}
      </CampusHeading>
      <ResultFilters
        label="ค้นหารายงาน"
        placeholder="ค้นหาเลขรายงาน หัวข้อ หรือสถานที่…"
        query={query}
        onQuery={(value) => {
          setQuery(value);
        }}
        onClear={() => {
          setQuery("");
          setFilter("all");
        }}
      >
        <div className="w-full sm:w-52">
          <Choice
            label="สถานะรายงาน"
            value={filter}
            options={[allResults, ...labelOptions(reportStatusLabels)]}
            onChange={(next) => {
              setFilter(next);
            }}
          />
        </div>
      </ResultFilters>
      {error && <ErrorNotice message={error} />}
      {live && resource.isRefreshing && (
        <p role="status" className="text-sm text-muted-foreground">
          กำลังอัปเดตรายงาน…
        </p>
      )}
      {live && resource.result.status === "error" && (
        <div className="grid gap-2">
          <ErrorNotice message={reportErrorMessage(resource.result.error)} />
          <Button variant="outline" className="justify-self-start" onClick={resource.reload}>
            ลองอีกครั้ง
          </Button>
        </div>
      )}
      {page.items.length === 0 && <EmptyState title="ไม่พบรายงานที่ตรงกับตัวกรอง" />}
      <ul className="grid gap-3">
        {page.items.map((report) => (
          <ReportListCard key={report.id} report={report}>
            {report.status === "DRAFT" && canWrite && (
              <>
                <p className="text-sm text-muted-foreground">ฉบับร่างเก็บไว้ 30 วันนับจากวันที่สร้าง</p>
                <Button asChild variant="outline" className="justify-self-start">
                  <Link href={`/reports/new?draftId=${report.id}`}>แก้ไขต่อ</Link>
                </Button>
              </>
            )}
            {report.status === "PENDING_REVIEW" && canWrite && (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href={`/my-reports/${report.reportNumber}/edit`}>แก้ไขรายงาน</Link>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={!!cancelling || resource.isRefreshing}>
                      ยกเลิกรายงาน
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>ยกเลิกรายงาน {report.reportNumber}</AlertDialogTitle>
                      <AlertDialogDescription>
                        รายงานจะออกจากคิวตรวจสอบ และเก็บประวัติการยกเลิกไว้ 30 วัน
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>กลับ</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void cancel(report.id)}>
                        ยืนยันยกเลิกรายงาน
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
            {!live &&
              report.status === "CONFIRMED" &&
              state?.tickets
                .filter((ticket) => ticket.id === report.ticketId)
                .map((ticket) => (
                  <Button key={ticket.id} asChild variant="outline" className="justify-self-start">
                    <Link href={`/tickets/${ticket.ticketNumber}`}>
                      ดูเรื่อง {ticket.ticketNumber}
                    </Link>
                  </Button>
                ))}
            {report.rejectionReason && (
              <p className="whitespace-pre-wrap">เหตุผลการปฏิเสธ · {report.rejectionReason}</p>
            )}
            {report.status === "CANCELLED" && (
              <p className="text-sm text-muted-foreground">
                ยกเลิกเมื่อ {formatThaiDateTime(report.cancelledAt)} · เก็บประวัติไว้ 30 วัน
              </p>
            )}
          </ReportListCard>
        ))}
      </ul>
      <PaginationBar {...page.controls} disabled={resource.isRefreshing} />
    </PageFrame>
  );
}

export default function MyReportsScreen() {
  return (
    <ReporterAccess path="/my-reports">
      {(access) => <ReportList key={`${access.live}:${access.userId}`} {...access} />}
    </ReporterAccess>
  );
}
