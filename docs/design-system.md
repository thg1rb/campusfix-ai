# KU Spot — Design System

เอกสารนี้กำหนดทิศทางภาพลักษณ์ ระบบสี ตัวอักษร โครงสร้างหน้าจอ และกฎการออกแบบของ **KU Spot** (`apps/web`) เพื่อให้งาน UI มีเอกลักษณ์สอดคล้องกับมหาวิทยาลัยเกษตรศาสตร์ อ่านง่าย ใช้งานจริงได้เร็ว และปราศจากลักษณะของ "AI UI Slop"

---

## 1. ทิศทางการออกแบบ (Design Direction)

**บุคลิก: Civic Campus Utility (เรียบ ชัด เชื่อถือได้ ใช้งานจริง)**

KU Spot คือเครื่องมือแจ้งและติดตามปัญหาทางกายภาพในพื้นที่มหาวิทยาลัย ไม่ใช่เว็บการตลาดหรือเดโม AI แนวไซไฟ ทุกองค์ประกอบบนหน้าจอต้องตอบคำถามอย่างน้อยหนึ่งข้อ: *เกิดอะไรขึ้น, ที่ไหน, รุนแรงแค่ไหน, สถานะอะไร, และต้องทำอะไรต่อ*

หลักคิด 4 ข้อ:
1. **Light-Mode First:** นิสิตและบุคลากรมักถ่ายรูปและแจ้งปัญหากลางแจ้งบนมือถือ พื้นหลังสว่างที่มีคอนทราสต์คมชัดจึงอ่านง่ายกว่าและเป็นค่าเริ่มต้นหลักของระบบ
2. **Restrained KU Identity:** ใช้พื้นผิวสี Neutral ที่สะอาดเป็น 85–90% ของหน้าจอ และใช้สีเขียวเข้มอัตลักษณ์ มก. (KU Deep Emerald) เป็นสีหลักเพียงสีเดียว ไม่ใช้ gradient ฉูดฉาด
3. **Typography & Borders over Shadows:** สร้างลำดับชั้นข้อมูลด้วยขนาดตัวอักษร น้ำหนัก เส้นขอบบาง (`1px`) และช่องไฟที่แม่นยำ แทนการซ้อนเงาหนาหรือ glassmorphism
4. **Honest Human-in-the-Loop AI:** ผลวิเคราะห์จาก AI ต้องถูกนำเสนออย่างสุภาพ ชัดเจนว่าเป็น "ข้อเสนอเบื้องต้น" พร้อมค่าความเชื่อมั่นและปุ่มให้ Reviewer แก้ไขได้ทันที ไม่ตกแต่งให้ดูเหมือนเวทมนตร์

---

## 2. Color System & Semantic Tokens

### 2.1 Surfaces, Text & Primary Accent

| Token | Value | การใช้งาน |
| :--- | :--- | :--- |
| `--color-canvas` | `#F7F7F5` | พื้นหลังหลักของหน้า (Warm paper neutral ลดแสงจ้า) |
| `--color-surface` | `#FFFFFF` | พื้นหลัง Card, Table, Form, Drawer |
| `--color-surface-subtle` | `#F0F0EC` | พื้นหลังรอง, Table header, Empty slot, AI suggestion box |
| `--color-border` | `#E2E4DF` | เส้นขอบหลัก (`1px solid`) ของ Card, Input, Divider |
| `--color-border-strong` | `#C7CBC2` | เส้นขอบตอน hover หรือเน้นกรอบ |
| `--color-ink` | `#161B18` | ข้อความหลัก (High contrast ≥ 14:1 บน `#FFFFFF`) |
| `--color-ink-muted` | `#525C56` | ข้อความรอง, Metadata, Timestamp, Helper text |
| `--color-accent` | `#006B54` | Primary CTA, Active nav, Focus ring, Brand mark (KU Emerald) |
| `--color-accent-hover` | `#005542` | สถานะ Hover ของปุ่มหลัก |
| `--color-accent-soft` | `#E6F3EF` | พื้นหลังอ่อนสำหรับ Active pill / Selected item |

### 2.2 Severity Scale (ตรงกับ `docs/brd.md`)

ห้ามใช้สีอย่างเดียวในการสื่อความหมาย ต้องแสดงคู่กับ **ข้อความกำกับ** เสมอ (และใส่จุด/ไอคอนขนาดเล็กช่วยแยกได้)

| Severity | Text | Background | Border |
| :--- | :--- | :--- | :--- |
| `LOW` | `#475569` | `#F1F5F9` | `#CBD5E1` |
| `MEDIUM` | `#92400E` | `#FEF3C7` | `#FCD34D` |
| `HIGH` | `#9A3412` | `#FFEDD5` | `#FDBA74` |
| `CRITICAL` | `#991B1B` | `#FEE2E2` | `#FCA5A5` |

### 2.3 Ticket & Report Status Badges

| Entity / Status | ความหมายบน UI | โทนสี |
| :--- | :--- | :--- |
| Ticket `CONFIRMED` | เผยแพร่แล้ว | Emerald (`#065F46` / `#ECFDF5` / `#A7F3D0`) |
| Ticket `WAITING_INFO` | รอข้อมูลเพิ่มเติม | Amber (`#92400E` / `#FFFBEB` / `#FDE68A`) |
| Ticket `RESOLVED` | แก้ไขแล้ว | Neutral-Ink (`#334155` / `#F1F5F9` / `#CBD5E1`) |
| Report `PENDING` | รอตรวจสอบ | Slate-Blue (`#1E40AF` / `#EFF6FF` / `#BFDBFE`) |
| Report `CONFIRMED` | ยืนยันแล้ว | Emerald (`#065F46` / `#ECFDF5` / `#A7F3D0`) |
| Report `REJECTED` | ไม่ผ่านการตรวจสอบ | Crimson (`#991B1B` / `#FEF2F2` / `#FECACA`) |

### 2.4 Tailwind CSS v4 `@theme` Mapping

เมื่อเริ่มวางสไตล์ใน `apps/web/src/app/globals.css` ให้ประกาศ Token ด้วย `@theme` ของ Tailwind v4 โดยตรง:

```css
@import "tailwindcss";

@theme {
  --color-canvas: #f7f7f5;
  --color-surface: #ffffff;
  --color-surface-subtle: #f0f0ec;
  --color-border: #e2e4df;
  --color-border-strong: #c7cbc2;
  --color-ink: #161b18;
  --color-ink-muted: #525c56;
  --color-accent: #006b54;
  --color-accent-hover: #005542;
  --color-accent-soft: #e6f3ef;

  --font-sans: var(--font-ibm-plex-sans-thai), var(--font-ibm-plex-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-ibm-plex-mono), ui-monospace, SFMono-Regular, monospace;
}
```

---

## 3. Typography (รองรับไทย + อังกฤษอย่างประณีต)

- **ฟอนต์หลัก:** `IBM Plex Sans Thai` คู่กับ `IBM Plex Sans` (โหลดผ่าน `next/font/google`) เพราะสระและวรรณยุกต์ภาษาไทยอ่านคม ชัดเจนทั้งบนจอเล็กและตารางข้อมูล
- **ฟอนต์ตัวเลข/รหัส:** `IBM Plex Mono` ใช้กับ Ticket ID (`CF-2026-0042`), พิกัดแผนที่, เวอร์ชัน Report (`v3`), คะแนน Confidence (`87%`) และ Timestamp พร้อม `tabular-nums` เพื่อให้ตัวเลขเรียงตรงคอลัมน์
- **Line-height สำหรับภาษาไทย:** เนื้อหาภาษาไทยต้องใช้ `leading-relaxed` (`1.6`) ขึ้นไป และหลีกเลี่ยง `truncate` ที่ตัดวรรณยุกต์ด้านบน/สระด้านล่าง

| Role | Size / Weight | ตัวอย่างการใช้งาน |
| :--- | :--- | :--- |
| Page Title (`h1`) | `24px–28px` / `600` (`tracking-tight`) | ชื่อหน้าหลัก, หัวข้อ Ticket Detail |
| Section Heading (`h2`) | `18px–20px` / `600` | หัวข้อกลุ่มข้อมูล, ตาราง, แผนที่ |
| Card Title (`h3`) | `15px–16px` / `600` (`line-clamp-2`) | หัวข้อปัญหาบน Public Feed Card |
| Body | `14px–15px` / `400` (`leading-relaxed`) | รายละเอียดปัญหา, ข้อความใน Thread |
| Metadata / Label | `12px–13px` / `500` | ชื่อสถานที่, Category, เวลา, Username |
| Monospace Meta | `12px` / `500` (`tabular-nums`) | Ticket ID, Confidence %, Version, Metrics |

---

## 4. Layout & Density ตามบทบาทผู้ใช้

แยกความหนาแน่นของหน้าจอออกเป็น **2 โหมด** ตามบริบทการใช้งานจริง:

### 4.1 Reporter Views (Mobile-First, Scannable)
- **Public Feed เป็นหน้าหลักทันที:** ไม่ใส่ Marketing Hero Banner สูงครึ่งหน้า — เปิดมาเห็นแถบค้นหา/ตัวกรอง + ปุ่ม **"แจ้งปัญหา"** + รายการ Ticket จริง (พร้อมปุ่มสลับมุมมอง List/Grid กับ Map)
- **Responsive Grid:** ใช้ Grid ที่ยืดหยุ่นตามขนาดจอ (`1` คอลัมน์บนมือถือ, `2` บน Tablet, `3` บน Laptop `1280px`, `4` บนจอใหญ่ `≥1536px`) เพื่อให้หัวข้อภาษาไทยและข้อมูลสถานที่อ่านสบาย ไม่เบียดแคบ
- **Card Anatomy (เรียงลำดับข้อมูลชัดเจน):**
  1. ภาพปกสัดส่วน `16:10` (object-cover, ไม่มี overlay รก) + Badge Severity มุมบน
  2. หัวข้อ Ticket (สูงสุด 2 บรรทัด) + สถานที่ (Location)
  3. Metadata แถวล่าง: Category, Status (แสดงชัดเมื่อเป็น `WAITING_INFO` หรือ `RESOLVED`), จำนวน Report, จำนวนผู้ได้รับผลกระทบ (`Affected`) และเวลาที่ยืนยัน
- **ฟอร์มแจ้งปัญหา (Create Report):** ออกแบบให้ใช้งานมือเดียวบนมือถือได้ง่าย (ปุ่มถ่าย/เลือก 1–5 ภาพ, ปักหมุดบนแผนที่, Auto-save ชั่วคราวในเบราว์เซอร์ และปุ่ม `Submit` ชัดเจน)

### 4.2 Reviewer & Admin Workspace (Desktop-First, Operational)
- **Incoming Review Workbench (Split Pane):**
  - **ฝั่งซ้าย (หลักฐานต้นทาง):** Report ID, Version badge (`v2`), Username ผู้แจ้ง, รายละเอียด, แกลเลอรีรูปภาพ (คลิกขยายได้), และตำแหน่งบนแผนที่
  - **ฝั่งขวา (การตัดสินใจ + AI Support):**
    - กล่อง **ข้อเสนอจาก AI** (`bg-surface-subtle`, กรอบ `1px solid`, ระบุ Confidence % และปุ่มคัดลอก/แก้ไขค่า Category, Severity, Title/Description)
    - รายการ **Ticket เดิมที่ใกล้เคียง** เปรียบเทียบข้อมูลข้างกันให้เลือกผูก Ticket เดิม หรือยืนยันสร้าง Ticket ใหม่
    - แถบ Action ด้านล่างติดจอ: `Confirm Ticket` (สี accent) และ `Reject` (ต้องกรอกเหตุผล)
- **Admin Dashboard:** เน้นตัวเลขที่แยกกันชัดเจนตาม BRD (`Tickets` / `Reports` / `Affected Users` / `Average Review Time`) ใช้กราฟเรียบสะอาด (Bar/Line ไม่มี 3D หรือ glow)

---

## 5. Interactive States ที่ต้องออกแบบครบทุกหน้า

ห้ามส่งมอบหน้าจอที่มีแค่ "Happy Path" ทุกหน้าต้องรองรับสถานะต่อไปนี้:
1. **Loading:** ใช้ Skeleton ที่โครงสร้างตรงกับข้อมูลจริง (ไม่ใช้ spinner กลางหน้าจอเปล่า ๆ)
2. **Empty State:** ข้อความสั้นตรงไปตรงมา + Action ถัดไป (เช่น *"ยังไม่มีรายการรอตรวจสอบ"*, *"ไม่พบปัญหาตามตัวกรองที่เลือก — ล้างตัวกรอง"*)
3. **AI Unavailable / Fallback Banner:** เมื่อ AI Gateway ล่มหรือหมดเวลา แสดงแถบแจ้งเตือนสี Neutral/Amber แบบไม่ขวางการทำงาน (*"ไม่สามารถวิเคราะห์ด้วย AI ได้ในขณะนี้ — คุณยังสามารถส่งรายงาน / ตรวจสอบและกรอกข้อมูลด้วยตนเองได้ตามปกติ"*)
4. **Version Conflict (`409`):** บนหน้า Reviewer หาก Reporter แก้ไข Report ระหว่างที่เปิดค้างไว้ ต้องแสดงแถบเตือนและปุ่ม **"โหลดเวอร์ชันล่าสุด"** พร้อมปิดปุ่ม Confirm จนกว่าจะโหลดข้อมูลใหม่
5. **Separation of Duties Guard:** หากผู้ใช้เปิดดู Report/Ticket ของตนเองในโหมด Reviewer ต้องซ่อน/ปิดปุ่มตัดสินใจพร้อมข้อความอธิบายสิทธิ์อย่างสุภาพ

---

## 6. Anti-Slop Rules (กฎเหล็กที่ห้ามทำเด็ดขาด)

เพื่อป้องกันไม่ให้หน้าตาเว็บออกมาเหมือนเว็บ AI ทั่วไป:
- **ห้ามใช้ Gradient ม่วง/น้ำเงิน/ชมพู** หรือธีมมืดเรืองแสง (Neon/Glow)
- **ห้ามใช้ Glassmorphism ฟุ่มเฟือย** (`backdrop-blur` บนการ์ดทั่วไปที่ทำให้ตัวอักษรอ่านยาก)
- **ห้ามวาง Lucide Icon ในกล่องสี่เหลี่ยมสีพาสเทล (`rounded-xl bg-*-100`)** ซ้ำ ๆ ในทุกหัวข้อหรือทุกการ์ด
- **ห้ามใช้ไอคอนประกายดาว (`✨`) หรือ Emoji** ในหัวข้อ, ปุ่ม, Badge หรือหน้าสถานะต่าง ๆ
- **ห้ามเขียน Copy แนวโฆษณาเกินจริง** (เช่น *"ยกระดับวิทยาเขตด้วย AI อัจฉริยะ"*, *"รวดเร็วไร้รอยต่อ"*) — ใช้ภาษาที่เป็นธรรมชาติ ตรงประเด็น และเป็นทางการแบบพอดี
- **ห้ามสร้าง Card ซ้อน Card หลายชั้น** และจำกัดรัศมีมุมให้อยู่ในระบบเดียว (`rounded-lg` 8px สำหรับ Card/Modal, `rounded-md` 6px สำหรับ Input/Button, `rounded-full` เฉพาะ Status pill/Avatar)

---

## 7. Accessibility & Component Standards

- **Contrast:** ข้อความปกติ ≥ 4.5:1, ข้อความใหญ่และเส้นขอบ UI ≥ 3:1 (WCAG AA)
- **Keyboard & Focus:** ทุกปุ่ม/ลิงก์/อินพุตต้องมี `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`
- **Touch Target:** ปุ่มและลิงก์บนมือถือต้องมีขนาดพื้นที่สัมผัสอย่างน้อย `44×44px`
- **Semantic HTML:** ใช้ `<dialog>` สำหรับ Modal, `<nav>`/`<main>`/`<header>` ให้ถูกต้อง, และผูก `<label>` กับทุก `<input>`
- **Component Primitives:** เก็บชิ้นส่วนพื้นฐานที่ใช้ซ้ำใน `apps/web/src/components/ui/` (`Button`, `Badge`, `Card`, `Input`, `Select`, `Dialog`, `EmptyState`, `Banner`) และสร้างคอมโพเนนต์เฉพาะโดเมนไว้ใน `apps/web/src/features/<feature>/`
