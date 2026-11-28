"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getPublicMasterData } from "@/lib/api/masterdata";
import { useApiResource } from "@/lib/api/useApiResource";
import {
  createDraftReport,
  updateDraftReport,
  submitDraftReport,
  createAndSubmitReport,
  editPendingReport,
} from "@/lib/api/reports";
import { reportErrorMessage } from "../liveReport";
import {
  CheckCircle2,
  FileText,
  ImagePlus,
  Info,
  MapPin,
  PlusCircle,
  Save,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { ActionLabel } from "@/components/shared/ActionFeedback";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ErrorNotice } from "@/components/shared/Controls";
import { ReportStatusBadge } from "@/components/shared/Badges";
import { CampusMapPicker } from "@/features/map";
import { isActiveTicket } from "@/lib/domain/permissions";
import { inCampus, reportErrors, validLocation, type ReportFields } from "@/lib/domain/validation";
import { usePrototype } from "@/lib/store/PrototypeStore";
import type { Report } from "@/types/domain";
import { ReportFormGuidance, ReportStep } from "./ReportFormGuidance";
import { ImageUploader } from "./ImageUploader";

const emptyFields: ReportFields = { description: "", images: [], location: null };

export function ReportForm({
  existing,
  targetId,
  edit = false,
  live = false,
}: {
  existing?: Report;
  targetId?: string;
  edit?: boolean;
  live?: boolean;
}) {
  const { state, dispatch } = usePrototype();
  const router = useRouter();
  const masterData = useApiResource(getPublicMasterData, live);
  const [uploading, setUploading] = useState(false);
  const savingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmationRef = useRef<HTMLHeadingElement>(null);
  const requestedId = existing?.requestedTargetTicketId ?? targetId;
  const target = state?.tickets.find((item) =>
    existing?.requestedTargetTicketId ? item.id === requestedId : item.ticketNumber === requestedId,
  );
  const blockedTarget = !!requestedId && !edit && (!target || !isActiveTicket(target.status));
  const [fields, setFields] = useState<ReportFields>({
    description: existing?.description ?? "",
    images: existing?.images ?? [],
    location: existing?.location ?? target?.location ?? null,
  });
  const [reportId, setReportId] = useState(existing?.id);
  const [saved, setSaved] = useState(false);
  const [submittedNumber, setSubmittedNumber] = useState<string>();
  const [pending, setPending] = useState<"draft" | "submit" | null>(null);
  const busy = pending !== null;
  const [errors, setErrors] = useState<ReturnType<typeof reportErrors>>({
    description: undefined,
    images: undefined,
    location: undefined,
  });
  const [error, setError] = useState("");
  const locations = live
    ? masterData.result.status === "ready"
      ? masterData.result.value.locations
      : []
    : (state?.locations ?? []);
  const locationsLoading = live && masterData.result.status === "loading";
  if (!live && !state) return null;

  async function save(draft: boolean) {
    if (savingRef.current || uploading || blockedTarget || locationsLoading) return;
    const problems = reportErrors(fields, draft);
    setErrors(problems);
    if (Object.values(problems).some(Boolean)) {
      requestAnimationFrame(() =>
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]:not([hidden])')?.focus(),
      );
      return;
    }
    setError("");
    setPending(draft ? "draft" : "submit");
    if (live) {
      savingRef.current = true;
      try {
        const location = fields.location;
        const point = location && inCampus(location) ? location : null;
        const input = {
          description: fields.description,
          locationId: location?.locationId ?? null,
          locationName: location?.locationName || null,
          locationDetailNote: location?.detailNote || null,
          lat: point?.lat ?? null,
          lng: point?.lng ?? null,
          imageIds: fields.images.map((image) => image.id),
        };
        if (draft) {
          if (reportId) await updateDraftReport(reportId, input);
          else await createDraftReport(input);
        } else if (validLocation(location)) {
          const submission = {
            ...input,
            locationName: location.locationName,
            lat: location.lat,
            lng: location.lng,
          };
          if (edit && reportId) await editPendingReport(reportId, submission);
          else if (reportId) await submitDraftReport(reportId, submission);
          else await createAndSubmitReport(submission);
        }
        toast.success(draft ? "บันทึกฉบับร่างแล้ว" : edit ? "บันทึกการแก้ไขแล้ว" : "ส่งรายงานแล้ว");
        router.replace("/my-reports");
      } catch (error) {
        setError(reportErrorMessage(error));
        setPending(null);
        savingRef.current = false;
      }
      return;
    }
    const result = await dispatch({
      type: "saveReport",
      fields,
      id: reportId,
      targetId: target?.id,
      edit,
      draft,
    });
    await new Promise((resolve) => setTimeout(resolve, !draft && result.ok ? 420 : 170));
    setPending(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setReportId(String(result.data));
    if (draft) {
      setSaved(true);
      toast.success("บันทึกฉบับร่างแล้ว");
    } else {
      setSubmittedNumber(result.publicNumber);
      toast.success(edit ? "บันทึกการแก้ไขแล้ว" : "ส่งรายงานแล้ว");
      requestAnimationFrame(() => confirmationRef.current?.focus());
    }
  }

  if (submittedNumber)
    return (
      <div className="campus-enter mx-auto grid w-full max-w-3xl gap-4">
        <section className="campus-panel grid gap-3 p-5 sm:p-7">
          <span className="grid size-11 place-items-center rounded-xl bg-[var(--color-success-bg)] text-[var(--color-success)]">
            <CheckCircle2 size={25} aria-hidden="true" />
          </span>
          <div className="grid gap-1">
            <h2 ref={confirmationRef} tabIndex={-1} className="font-semibold">
              {edit ? "บันทึกการแก้ไขแล้ว" : "ส่งรายงานแล้ว"}
            </h2>
            <p className="text-sm text-muted-foreground">
              ระบบได้รับรายงานแล้วและส่งเข้าคิวของทีมผู้ตรวจสอบ ติดตามสถานะได้ในรายงานของฉัน
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm tabular-nums text-muted-foreground">{submittedNumber}</span>
            <ReportStatusBadge status="PENDING_REVIEW" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/my-reports">
                <FileText aria-hidden="true" /> ไปที่รายงานของฉัน
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                href="/reports/new"
                onNavigate={() => {
                  if (!existing && !targetId && !edit) {
                    setFields(emptyFields);
                    setReportId(undefined);
                    setSaved(false);
                    setSubmittedNumber(undefined);
                    requestAnimationFrame(() =>
                      formRef.current?.querySelector("textarea")?.focus(),
                    );
                  }
                }}
              >
                <PlusCircle aria-hidden="true" /> แจ้งปัญหาเพิ่มเติม
              </Link>
            </Button>
          </div>
        </section>
      </div>
    );

  return (
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 gap-4">
        {requestedId && (
          <Alert>
            <Info aria-hidden="true" />
            <AlertDescription>
              {blockedTarget
                ? "เรื่องที่เลือกสิ้นสุดแล้วหรือไม่พบ กรุณาเริ่มรายงานใหม่"
                : `รายงานเพิ่มเติมสำหรับเรื่อง ${target?.ticketNumber ?? ""} ผู้ตรวจสอบจะพิจารณาการจัดกลุ่มขั้นสุดท้าย`}
            </AlertDescription>
          </Alert>
        )}
        <form
          ref={formRef}
          className="campus-panel grid min-w-0 gap-5 p-4 sm:p-6"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save(false);
          }}
        >
          <FieldGroup className="gap-5 divide-y [&>section+section]:pt-5 [&>section:not(:last-child)]:pb-1">
            <ReportStep
              number={1}
              icon={FileText}
              title="อธิบายปัญหาที่พบ"
              hint="ระบุสิ่งที่พบและช่วงเวลาที่เกิดปัญหา เพื่อให้ตรวจสอบได้ง่ายขึ้น"
            >
              <Field data-invalid={!!errors.description}>
                <FieldLabel htmlFor="report-description">รายละเอียดปัญหา</FieldLabel>
                <Textarea
                  id="report-description"
                  name="description"
                  value={fields.description}
                  className="min-h-28"
                  placeholder="เช่น ไฟทางเดินหน้าอาคารเรียนรวม 1 ดับ 2 ดวง ช่วงค่ำมืดมาก…"
                  aria-required="true"
                  aria-invalid={!!errors.description}
                  aria-describedby={`report-description-count${errors.description ? " report-description-error" : ""}`}
                  onChange={(event) => {
                    const description = event.target.value;
                    setFields((current) => ({ ...current, description }));
                    if (description.trim())
                      setErrors((current) => ({ ...current, description: undefined }));
                  }}
                />
                <FieldDescription id="report-description-count" className="text-end tabular-nums">
                  {fields.description.length} ตัวอักษร
                </FieldDescription>
                {errors.description && (
                  <FieldError id="report-description-error">{errors.description}</FieldError>
                )}
              </Field>
            </ReportStep>
            <ReportStep
              number={2}
              icon={ImagePlus}
              title="แนบรูปภาพประกอบ (1–5 ภาพ)"
              hint="เลือกภาพที่เห็นปัญหาชัดเจน หรือเพิ่มภาพมุมกว้างเพื่อช่วยระบุจุดที่เกิดเหตุ"
            >
              <div className="min-w-0 rounded-xl border border-dashed border-[var(--color-brand-border)] bg-[var(--color-brand-soft)] p-3 sm:p-4">
                <ImageUploader
                  images={fields.images}
                  live={live}
                  disabled={busy}
                  onBusyChange={setUploading}
                  error={errors.images}
                  onChange={(images) => {
                    setFields((current) => ({ ...current, images }));
                    setErrors((current) => ({ ...current, images: undefined }));
                  }}
                />
              </div>
            </ReportStep>
            <ReportStep
              number={3}
              icon={MapPin}
              title="ระบุสถานที่และปักหมุดบนแผนที่"
              hint="เลือกสถานที่ในวิทยาเขต หรือปักหมุดตรงจุดที่เกิดปัญหา"
            >
              <CampusMapPicker
                locations={locations}
                clearUnavailable={live}
                value={fields.location}
                error={errors.location}
                onChange={(location) => {
                  setFields((current) => ({ ...current, location }));
                  setErrors((current) => ({ ...current, location: undefined }));
                }}
              />
            </ReportStep>
          </FieldGroup>
          {locationsLoading && <p role="status">กำลังโหลดสถานที่…</p>}
          {live && masterData.result.status === "error" && (
            <div className="grid gap-2">
              <ErrorNotice message="โหลดรายการสถานที่ไม่สำเร็จ คุณยังสามารถปักหมุดบนแผนที่ได้" />
              <Button
                type="button"
                variant="outline"
                className="justify-self-start"
                onClick={masterData.reload}
              >
                โหลดสถานที่อีกครั้ง
              </Button>
            </div>
          )}
          {error && <ErrorNotice message={error} />}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button type="submit" disabled={busy || uploading || blockedTarget || locationsLoading}>
              <ActionLabel pending={pending === "submit"}>
                {edit ? <Save aria-hidden="true" /> : <Send aria-hidden="true" />}
                {edit ? "บันทึกการแก้ไข" : "ส่งรายงาน"}
              </ActionLabel>
            </Button>
            {!edit && (
              <Button
                type="button"
                variant="outline"
                disabled={busy || uploading || blockedTarget || locationsLoading}
                onClick={() => void save(true)}
              >
                <ActionLabel pending={pending === "draft"}>
                  <Save aria-hidden="true" /> บันทึกฉบับร่าง
                </ActionLabel>
              </Button>
            )}
            {blockedTarget && (
              <Button asChild variant="outline">
                <Link href="/reports/new">เริ่มรายงานใหม่</Link>
              </Button>
            )}
            {saved && (
              <Button asChild variant="outline">
                <Link href="/my-reports">ดูฉบับร่างในรายงานของฉัน</Link>
              </Button>
            )}
          </div>
        </form>
      </div>
      <ReportFormGuidance fields={fields} live={live} />
    </div>
  );
}
