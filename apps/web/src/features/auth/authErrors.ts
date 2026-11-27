import { ApiError } from "@/lib/api/client";

const messages: Record<string, string> = {
  SERVICE_UNAVAILABLE: "ขณะนี้ระบบเข้าสู่ระบบหรือบริการยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง",
  INVALID_OAUTH_STATE: "คำขอเข้าสู่ระบบหมดอายุหรือไม่ถูกต้อง กรุณาเริ่มเข้าสู่ระบบอีกครั้ง",
  OAUTH_DENIED: "การเข้าสู่ระบบ Google ถูกยกเลิก กรุณาลองอีกครั้ง",
  INVALID_OAUTH_IDENTITY: "กรุณาใช้บัญชี Google ของมหาวิทยาลัย (@ku.th) ที่ยืนยันอีเมลแล้ว",
  ACCOUNT_INACTIVE: "บัญชีถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
  USERNAME_TAKEN: "ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น",
  VALIDATION_ERROR: "กรุณาตรวจสอบข้อมูลที่กรอก",
  EXCLUSIVE_ADMIN_CONFLICT: "ผู้ดูแลระบบต้องมีบทบาทเดียวและไม่สังกัดหน่วยงาน",
  SINGLE_DEPARTMENT_LIMIT: "เฉพาะเจ้าหน้าที่หน่วยงานเท่านั้นที่สังกัดหน่วยงานได้",
  DEPARTMENT_REQUIRED: "กรุณาเลือกหน่วยงานสำหรับเจ้าหน้าที่",
  DEPARTMENT_UNAVAILABLE: "ไม่พบหน่วยงานหรือหน่วยงานถูกปิดใช้งาน",
  LAST_ACTIVE_ADMIN: "ต้องมีผู้ดูแลระบบที่เปิดใช้งานอย่างน้อยหนึ่งบัญชี",
  FORBIDDEN: "คุณไม่มีสิทธิ์ดำเนินการ",
  UNAUTHENTICATED: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง",
};

export function oauthErrorMessage(code: string) {
  return Object.hasOwn(messages, code) ? messages[code] : "เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง";
}

export function identityErrorMessage(error: unknown) {
  if (error instanceof ApiError && Object.hasOwn(messages, error.code)) return messages[error.code];
  return "ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง";
}
