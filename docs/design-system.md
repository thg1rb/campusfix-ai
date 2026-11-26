# KU Spot — Design System

This document defines the visual direction, semantic color tokens, typography, role-based layouts, interactive states, and anti-slop rules for **KU Spot** (`apps/web`). Every interface must remain readable outdoors on mobile devices, operational for campus staff on desktop, and free from generic "AI UI slop."

---

## 1. Design Direction

**Personality: Civic Campus Utility (Clear, Calm, Trustworthy, Operational)**

KU Spot is a campus operations and civic transparency tool — not a marketing landing page or sci-fi AI showcase. Every element on screen should answer at least one concrete question: *What happened? Where? How severe is it? What is its status? Who owns it? What action is next?*

Four core principles:
1. **Light-Mode First:** Students and staff photograph and report issues outdoors on mobile devices. High-contrast light surfaces are the primary default.
2. **Restrained KU Identity:** Keep 85–90% of the viewport clean neutral surfaces and reserve Kasetsart Deep Emerald (`#006B54`) as the single primary accent. Avoid loud gradients.
3. **Typography & Borders over Shadows:** Establish visual hierarchy through type scale, weight, crisp `1px` borders, and disciplined spacing rather than heavy drop shadows or glassmorphism.
4. **Honest Human-in-the-Loop AI:** Present AI suggestions plainly as preliminary recommendations with confidence percentages and one-click override controls — never as opaque "magic."

---

## 2. Color System & Semantic Tokens

### 2.1 Surfaces, Text & Primary Accent

| Token | Value | Usage |
| --- | --- | --- |
| `--color-canvas` | `#F7F7F5` | Primary page canvas (warm paper neutral to reduce glare) |
| `--color-surface` | `#FFFFFF` | Card, table, form, drawer, and modal surfaces |
| `--color-surface-subtle` | `#F0F0EC` | Secondary surface, table header, empty slot, AI suggestion panel |
| `--color-border` | `#E2E4DF` | Standard `1px solid` border for cards, inputs, and dividers |
| `--color-border-strong` | `#C7CBC2` | Hover border or emphasized frame |
| `--color-ink` | `#161B18` | Primary text (contrast ≥ 14:1 on `#FFFFFF`) |
| `--color-ink-muted` | `#525C56` | Secondary text, metadata, timestamps, helper copy |
| `--color-accent` | `#006B54` | Primary CTA, active navigation, focus ring, KU Emerald brand mark |
| `--color-accent-hover` | `#005542` | Hover state for primary actions |
| `--color-accent-soft` | `#E6F3EF` | Subtle tint for active pills and selected items |

### 2.2 Severity Scale (Aligned with `docs/brd.md`)

Never rely on color alone to convey severity; always pair color with an explicit text label (and optional compact dot/icon).

| Severity | Text | Background | Border |
| --- | --- | --- | --- |
| `LOW` | `#475569` | `#F1F5F9` | `#CBD5E1` |
| `MEDIUM` | `#92400E` | `#FEF3C7` | `#FCD34D` |
| `HIGH` | `#9A3412` | `#FFEDD5` | `#FDBA74` |
| `CRITICAL` | `#991B1B` | `#FEE2E2` | `#FCA5A5` |

### 2.3 Ticket & Report Status Badges (Freeze 1 Canonical States)

| Entity / Status | UI Meaning | Palette (Text / Bg / Border) |
| --- | --- | --- |
| Ticket `CONFIRMED` | Confirmed & Published | Emerald (`#065F46` / `#ECFDF5` / `#A7F3D0`) |
| Ticket `IN_PROGRESS` | Department Working | Blue (`#1D4ED8` / `#EFF6FF` / `#BFDBFE`) |
| Ticket `WAITING_INFORMATION` | Waiting for Reporter Info | Amber (`#92400E` / `#FFFBEB` / `#FDE68A`) |
| Ticket `RESOLVED` | Resolved (Final) | Neutral-Teal (`#115E59` / `#F0FDFA` / `#99F6E4`) |
| Ticket `CANNOT_RESOLVE` | Cannot Resolve (Final) | Crimson (`#991B1B` / `#FEF2F2` / `#FECACA`) |
| Report `DRAFT` | Saved Draft | Neutral (`#475569` / `#F8FAFC` / `#CBD5E1`) |
| Report `PENDING_REVIEW` | Pending Reviewer Triage | Slate-Blue (`#1E40AF` / `#EFF6FF` / `#BFDBFE`) |
| Report `CONFIRMED` | Confirmed into Ticket | Emerald (`#065F46` / `#ECFDF5` / `#A7F3D0`) |
| Report `REJECTED` | Rejected by Reviewer | Crimson (`#991B1B` / `#FEF2F2` / `#FECACA`) |
| Report `CANCELLED` | Cancelled by Reporter | Muted Stone (`#57534E` / `#F5F5F4` / `#D6D3D1`) |

### 2.4 Tailwind CSS v4 `@theme` Mapping

Declare design tokens in `apps/web/src/app/globals.css` using Tailwind v4 `@theme`:

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

## 3. Typography (Bilingual Thai + English)

* **Primary Sans:** `IBM Plex Sans Thai` paired with `IBM Plex Sans` (loaded via `next/font/google`) for crisp Thai vowels/tone marks in compact cards and dense operational tables.
* **Monospace:** `IBM Plex Mono` with `tabular-nums` for record IDs (`TKT-2026-00001`, `RPT-2026-00001`), coordinates, report versions (`v3`), confidence/similarity scores (`87%`), and timestamps.
* **Thai Line Height:** Use `leading-relaxed` (`1.6`) or higher for Thai prose and avoid aggressive single-line `truncate` that clips upper tone marks or lower vowels.

| Role | Size / Weight | Usage |
| --- | --- | --- |
| Page Title (`h1`) | `24px–28px` / `600` (`tracking-tight`) | Page header, Ticket Detail title |
| Section Heading (`h2`) | `18px–20px` / `600` | Section titles, tables, map header |
| Card Title (`h3`) | `15px–16px` / `600` (`line-clamp-2`) | Public Feed Ticket card title |
| Body | `14px–15px` / `400` (`leading-relaxed`) | Descriptions, timeline summaries, thread messages |
| Metadata / Label | `12px–13px` / `500` | Location, Category, Department, timestamp, Username |
| Monospace Meta | `12px` / `500` (`tabular-nums`) | Ticket/Report numbers, Confidence %, Version, KPI counters |

---

## 4. Role-Based Layouts & Density

Separate interface density by primary workflow context:

### 4.1 Public & Reporter Views (Mobile-First, Scannable)

* **Public Feed as Primary Entry:** Lead immediately with search, filters, a prominent **"Report Issue"** CTA, List/Map toggle, and live Active Tickets (sorted `Confirmed Time DESC`) — no half-screen marketing hero banner.
* **Responsive Card Grid (`BR-PUB-007`):**
  * Desktop (`xl` / `2xl`): **5 Ticket Cards per row** (as required by Freeze 1 `BR-PUB-007`).
  * Laptop / Tablet / Mobile: Gracefully collapse (`3–4` on medium laptop, `2` on tablet, `1` on mobile) so Thai titles and metadata remain legible.
  * Pagination selector supports `25`, `50`, and `100` items per page (`BR-PUB-006`).
* **Ticket Card Anatomy:**
  1. Cover photo (`16:10`, `object-cover`, clean frame) + top-corner Severity badge.
  2. Ticket title (max 2 lines) + Location name.
  3. Metadata footer: Status badge, Category, Responsible Department chip(s), Report count, Affected count, and confirmed timestamp.
* **Create / Edit Report Form:** Thumb-friendly mobile layout supporting `Save Draft` (`DRAFT`) and `Submit` (`PENDING_REVIEW`), 1–5 photo upload with client-side size/format checks (≤10 MB, PNG/JPG/JPEG), and interactive KU Bangkhen map pin selector.
* **Ticket Detail View:** Displays core Ticket fields, Responsible Departments + per-department completion state, linked Confirmed Reports (thumbnail + AI-generated Report Title), Public Activity Timeline, `Mark Affected` toggle (Active Tickets only), **Private Additional Information Thread** (visible only to authorized participants with an explicit "Private — Not Public" header), and **Multi-Dimensional Feedback** panel (`RESOLVED` Tickets, Reporters of the Ticket only).

### 4.2 Reviewer Workbench (Desktop-First, Split Pane)

* **Left Pane (Source Evidence):** Report Number (`RPT-2026-00001`), Version badge (`v2`), Reporter Username, description, expandable image gallery, and campus map pin.
* **Right Pane (AI Support & Decision Controls):**
  * **AI Recommendation Card** (`bg-surface-subtle`, `1px solid`, Confidence %, Alternative Category, Severity + rationale, Suggested Departments, and quick override inputs).
  * **Candidate Matching Comparison:** Side-by-side comparison of AI-matched Active Tickets (with similarity %) or Reporter-requested target ticket hint, plus option to create a New Ticket from the Ticket Candidate.
  * **Multi-Department Picker:** Select ≥1 Responsible Departments (no Primary Department toggle).
  * **Sticky Action Bar:** `Confirm into Existing Ticket` / `Confirm New Ticket` (accent) and `Reject` (requires mandatory reason).

### 4.3 Department Work Dashboard (Desktop-First, Operational)

* Lists Active Tickets assigned to the staff member's single Department with filters by Status, Severity, Category, and Aging.
* Ticket operational screen provides state-valid actions only: `Start Work` (`CONFIRMED → IN_PROGRESS`), `Request Information` (`WAITING_INFORMATION`), `Resume Work` (`WAITING_INFORMATION → IN_PROGRESS`), `Record Operational Action + Evidence`, `Confirm Department Completion` (with live indicator of other assigned departments' completion status), and `Cannot Resolve` (strictly hidden/disabled when `IN_PROGRESS` per `BR-STA-008`, requiring a mandatory reason when allowed).
* Includes Department-scoped Analytics view (`UC-DEP-004`).

### 4.4 Administrator Dashboard (Desktop-First, Analytical)

* Separates KPI cards explicitly per `BR-ANL-001`: **Tickets**, **Reports**, **Affected Users**, **Average Review Time**, **Average Resolution Time**, **Average Total Lead Time**, and **Average Satisfaction**.
* Uses clean, flat Bar/Line charts (no 3D effects or neon glow).
* Provides Master Data CRUD tables for Users/Roles (enforcing Exclusive Admin and max-1-Department validation), Categories (with soft-disable), Departments, and Campus Locations.

---

## 5. Required Interactive States

Every screen must implement all non-happy-path states:

1. **Loading:** Structural skeletons matching the rendered layout (avoid bare centered spinners).
2. **Empty State:** Concise explanation plus the next logical action (e.g., *"No pending reports in queue"*, *"No tickets match your filters — Reset filters"*).
3. **AI Unavailable / Fallback Banner:** Non-blocking neutral/amber banner explaining that AI analysis is currently unavailable while allowing submission and manual review to proceed (`BR-GEN-008`, `BR-AI-020`).
4. **Version Conflict (`409 STALE_REPORT_VERSION`):** On Reviewer screens, if a Reporter edits a `PENDING_REVIEW` report while open, disable confirmation actions and show a clear banner with a **"Load Latest Version"** action (`BR-RPT-012`).
5. **Separation of Duties Guard:** When a Reviewer or Department Staff views a Report/Ticket they reported themselves, disable/hide operational decision controls and explain the Separation of Duties restriction clearly (`BR-ROLE-004`, `BR-ROLE-005`).
6. **Final Ticket Lock:** On `RESOLVED` and `CANNOT_RESOLVE` tickets, disable adding reports, toggling `Mark Affected`, and modifying departments, while clearly displaying resolution summary or cannot-resolve explanation.

---

## 6. Anti-Slop Rules (Strictly Forbidden)

* **No purple/blue/pink gradients** or dark neon/glow themes.
* **No decorative glassmorphism** (`backdrop-blur` on standard cards that reduces legibility).
* **No repetitive pastel icon-in-box grids** (`rounded-xl bg-*-100`) on every heading or card.
* **No sparkle icons (`✨`) or emojis** in headings, buttons, badges, or status labels.
* **No inflated marketing copy** — keep UI copy direct, calm, and operational.
* **No deeply nested cards-inside-cards.** Standardize radii: `rounded-lg` (`8px`) for cards/modals, `rounded-md` (`6px`) for inputs/buttons, and `rounded-full` exclusively for status pills and avatars.

---

## 7. Accessibility & Component Standards

* **Contrast:** Body text ≥ 4.5:1; large text and UI borders ≥ 3:1 (WCAG AA).
* **Keyboard & Focus:** All interactive controls must include `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`.
* **Touch Targets:** Mobile buttons and links must be at least `44×44px`.
* **Semantic HTML:** Use native `<dialog>` (or accessible Dialog primitive), `<nav>`, `<main>`, `<header>`, and explicit `<label>` bindings for every input.
* **Component Organization:** Keep reusable UI primitives in `apps/web/src/components/ui/`, shared cross-feature UI in `apps/web/src/components/shared/`, and domain feature modules in `apps/web/src/features/<feature>/`.
