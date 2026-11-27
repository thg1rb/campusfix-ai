import type { Role } from "../../types/domain";

export const roleLabels: Record<Role, string> = {
  REPORTER: "ผู้แจ้ง",
  REVIEWER: "ผู้ตรวจสอบ",
  DEPARTMENT_STAFF: "เจ้าหน้าที่หน่วยงาน",
  ADMINISTRATOR: "ผู้ดูแลระบบ",
};
