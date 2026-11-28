import { ApiError } from "@/lib/api/client";
import type { ReportDetail } from "@/lib/api/reports";
import type { Report } from "@/types/domain";

export function asReport(detail: ReportDetail): Report {
  const { location, images, ...report } = detail;
  return {
    ...report,
    images: images.map(({ previewUrl, fileName, ...image }) => ({
      ...image,
      fileName,
      url: previewUrl,
      alt: fileName,
    })),
    location: location && {
      locationId: location.locationId,
      locationName: location.locationName ?? "",
      detailNote: location.detailNote ?? undefined,
      lat: location.lat ?? 0,
      lng: location.lng ?? 0,
    },
  };
}

export function reportErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "TRANSITION_FORBIDDEN":
        return "สถานะรายงานเปลี่ยนแล้ว กรุณาตรวจสอบสถานะล่าสุดในรายงานของฉัน";
      case "LOCATION_UNAVAILABLE":
        return "สถานที่นี้ไม่พร้อมใช้งาน กรุณาเลือกสถานที่อื่นหรือปักหมุดใหม่";
      case "VALIDATION_ERROR":
        return "กรุณาตรวจสอบรายละเอียด สถานที่ และรูปแนบ รูปที่หมดอายุต้องอัปโหลดใหม่";
      case "UNAUTHENTICATED":
        return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง";
      case "NOT_FOUND":
        return "ไม่พบรายงานนี้ กรุณาตรวจสอบรายการรายงานของฉัน";
      case "FORBIDDEN":
      case "ADMIN_NON_OPERATIONAL":
        return "คุณไม่มีสิทธิ์ดำเนินการกับรายงานนี้";
    }
  }
  return "ไม่สามารถดำเนินการกับรายงานได้ กรุณาลองอีกครั้ง";
}

export function uploadErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "INVALID_MEDIA_FORMAT") return "ไฟล์ภาพใช้ไม่ได้ กรุณาเลือกไฟล์ PNG หรือ JPEG ใหม่";
    if (error.code === "MEDIA_TOO_LARGE" || error.code === "PAYLOAD_TOO_LARGE")
      return "รูปภาพต้องมีขนาดไม่เกิน 10 MB ต่อไฟล์";
  }
  return "อัปโหลดรูปภาพไม่สำเร็จ กรุณาลองอีกครั้ง";
}
