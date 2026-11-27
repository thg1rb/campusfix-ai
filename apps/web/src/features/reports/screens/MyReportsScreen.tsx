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
import { Choice, AccessNotice, labelOptions, PageFrame } from "@/components/shared/Controls";
import { EmptyState } from "@/components/shared/EmptyState";
import { reportStatusLabels } from "@/components/shared/Badges";
import { formatThaiDateTime } from "@/lib/format";
import { usePrototype } from "@/lib/store/PrototypeStore";
import { isExclusiveAdmin } from "@/lib/domain/permissions";
import { useState } from "react";
import { CampusHeading } from "@/components/shared/CampusHeading";
import { allResults, matchesSearch, ResultFilters } from "@/components/shared/ResultFilters";
import { PaginationBar } from "@/components/shared/PaginationBar";
import { usePagination } from "@/hooks/usePagination";
import { ReportListCard, reportListTitle } from "../components/ReportListCard";

export default function MyReportsScreen() {
  const { state, user, dispatch } = usePrototype();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const pagination = usePagination();
  if (!state || !user || isExclusiveAdmin(user))
    return <AccessNotice loggedIn={!!user} path="/my-reports" />;
  const mine = state.reports.filter((item) => item.reporterId === user.id);
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
  const page = pagination.current(filtered);

  return (
    <PageFrame wide>
      <CampusHeading
        title="รายงานของฉัน"
        context="มหาวิทยาลัยเกษตรศาสตร์ · วิทยาเขตบางเขน"
        icon={FileText}
        stats={[
          { label: "ทั้งหมด", value: mine.length },
          {
            label: "รอตรวจสอบ",
            value: mine.filter((report) => report.status === "PENDING_REVIEW").length,
          },
          {
            label: "ยืนยันแล้ว",
            value: mine.filter((report) => report.status === "CONFIRMED").length,
          },
          { label: "ฉบับร่าง", value: mine.filter((report) => report.status === "DRAFT").length },
        ]}
      >
        <Button asChild>
          <Link href="/reports/new">
            <Plus aria-hidden="true" /> แจ้งปัญหา
          </Link>
        </Button>
      </CampusHeading>
      <ResultFilters
        label="ค้นหารายงาน"
        placeholder="ค้นหาเลขรายงาน หัวข้อ หรือสถานที่…"
        query={query}
        onQuery={(value) => {
          setQuery(value);
          pagination.reset();
        }}
        onClear={() => {
          setQuery("");
          setFilter("all");
          pagination.reset();
        }}
      >
        <div className="w-full sm:w-52">
          <Choice
            label="สถานะรายงาน"
            value={filter}
            options={[allResults, ...labelOptions(reportStatusLabels)]}
            onChange={(next) => {
              setFilter(next);
              pagination.reset();
            }}
          />
        </div>
      </ResultFilters>
      {page.items.length === 0 && <EmptyState title="ไม่พบรายงานที่ตรงกับตัวกรอง" />}
      <ul className="grid gap-3">
        {page.items.map((report) => (
          <ReportListCard key={report.id} report={report}>
            {report.status === "DRAFT" && (
              <>
                <p className="text-sm text-muted-foreground">ฉบับร่างเก็บไว้ 30 วันนับจากวันที่สร้าง</p>
                <Button asChild variant="outline" className="justify-self-start">
                  <Link href={`/reports/new?draftId=${report.id}`}>แก้ไขต่อ</Link>
                </Button>
              </>
            )}
            {report.status === "PENDING_REVIEW" && (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href={`/my-reports/${report.reportNumber}/edit`}>แก้ไขรายงาน</Link>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">ยกเลิกรายงาน</Button>
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
                      <AlertDialogAction
                        onClick={async () => {
                          const result = await dispatch({ type: "cancelReport", id: report.id });
                          if (result.ok) toast.success("ยกเลิกรายงานแล้ว");
                          else toast.error(result.message);
                        }}
                      >
                        ยืนยันยกเลิกรายงาน
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
            {report.status === "CONFIRMED" &&
              state.tickets
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
      <PaginationBar {...page.controls} />
    </PageFrame>
  );
}
