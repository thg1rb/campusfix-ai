# KU Spot — Use Case Specification (Requirement Freeze 1)

> **Source of Truth:** Derived from **Requirement Freeze 1 (V4)** and linked to [docs/business-rules.md](business-rules.md) (`BR-*`). All 42 Use Cases below define the expected end-to-end behavior across Web, Go API, and Python AI Gateway.

---

## 1. Actors

* **Public Visitor** — Unauthenticated reader browsing Public Feed, Ticket Detail, Public Report Detail, Campus Map, Public Activity Timeline, and Public Reporter Profiles.
* **Reporter** — Authenticated campus user who creates/edits/cancels Reports, participates in private Threads for their confirmed Tickets, toggles Mark Affected, and submits/edits Feedback.
* **Reviewer** — Central triage officer who verifies Reports, overrides AI recommendations, controls Ticket matching and Responsible Department assignments, corrects Confirmed Reports, requests additional information, and marks `CANNOT_RESOLVE` when allowed.
* **Department Staff** — Staff belonging to at most one Department who operates on assigned Active Tickets, records actions/evidence, confirms department completion, marks `CANNOT_RESOLVE` when allowed, and views Department Analytics.
* **Administrator** — Exclusive system administration role managing Users, Roles, Permissions, Categories, Departments, Locations, and System-wide Analytics (never operates on Tickets).
* **AI Service** — Stateless multimodal Decision Support service (`apps/ai`) analyzing Images + Description + Location.
* **Authentication Provider** — Primary Freeze 1 provider is **KU-ALL (SSO)** behind a pluggable provider boundary (`BR-AUTH-001`, `BR-AUTH-004`); `UC-AUTH-001` also supports Google OAuth 2.0 (`@ku.th`) during MVP/prototype transition.
* **Email Service** — Outbound notification provider delivering Major Event Emails to Ticket Reporters.
* **System** — Automated backend orchestration (e.g., Auto-`RESOLVED` on multi-department completion, 30-day retention purge).

---

## 2. Use Case Catalog

| ID | Use Case | Primary Actor | Rule Group |
| --- | --- | --- | --- |
| `UC-AUTH-001` | Login via Authentication Provider (KU-ALL SSO / Google OAuth `@ku.th`) | Authenticated User | `BR-AUTH-001`..`004`, `BR-ROLE-001`..`003` |
| `UC-USR-001` | Set or Change Username | Authenticated User | `BR-AUTH-005`..`010` |
| `UC-RPT-001` | Save / Resume Draft Report | Reporter | `BR-RLC-001`, `BR-RET-001`, `BR-RET-003` |
| `UC-RPT-002` | Submit Report | Reporter | `BR-RPT-001`..`007`, `BR-AI-001`..`020` |
| `UC-RPT-003` | Edit Pending Report | Reporter | `BR-RPT-008`..`012`, `BR-ROLE-004` |
| `UC-RPT-004` | Cancel Pending Report | Reporter | `BR-RLC-006`, `BR-RLC-009`, `BR-RET-002` |
| `UC-RPT-005` | Add Report from Existing Active Ticket | Reporter | `BR-RPT-014`..`015`, `BR-REV-003`..`005` |
| `UC-AI-001` | Analyze and Match Report | AI Service | `BR-AI-001`..`013` |
| `UC-AI-002` | Re-analyze Edited Pending Report | AI Service | `BR-RPT-009`..`012`, `BR-AI-020` |
| `UC-AI-003` | Re-evaluate Ticket after Confirmed Report Change | AI Service / Reviewer | `BR-AI-014`, `BR-AI-015` |
| `UC-REV-001` | Review Pending Report | Reviewer | `BR-ROLE-004`, `BR-REV-001`..`010` |
| `UC-REV-002` | Confirm Report into Existing Ticket | Reviewer | `BR-GEN-005`, `BR-TKT-001`, `BR-NOT-004` |
| `UC-REV-003` | Confirm New Ticket | Reviewer | `BR-TKT-008`..`013` |
| `UC-REV-004` | Reject Pending Report | Reviewer | `BR-REV-006`..`009` |
| `UC-REV-005` | Correct Confirmed Report | Reviewer | `BR-AI-014`..`015`, `BR-AUD-003`..`005` |
| `UC-REV-006` | Change Responsible Departments | Reviewer | `BR-TKT-004`, `BR-DEP-004`..`007`, `BR-ROLE-004` |
| `UC-PUB-001` | Browse Public Feed | Public Visitor | `BR-PUB-001`..`003` |
| `UC-PUB-002` | Search / Filter / Paginate Tickets | Public Visitor | `BR-PUB-004`..`007` |
| `UC-PUB-003` | View Ticket Detail | Public Visitor | `BR-PUB-008`, `BR-PUB-010` |
| `UC-PUB-004` | View Public Report Detail | Public Visitor | `BR-PUB-009`, `BR-RLC-008` |
| `UC-PUB-005` | View Reporter Public Profile | Public Visitor | `BR-AUTH-009`, `BR-AUTH-010` |
| `UC-MAP-001` | View Tickets on Campus Map | Public Visitor | `BR-PUB-001`, `BR-AUTH-003` |
| `UC-THR-001` | Request Additional Information | Reviewer / Department | `BR-THR-001`..`006`, `BR-STA-002`, `BR-STA-004` |
| `UC-THR-002` | Respond in Ticket Thread | Reporter | `BR-THR-001`..`005` |
| `UC-DEP-001` | View Department Work Dashboard | Department Staff | `BR-ROLE-003`, `BR-ROLE-005` |
| `UC-TKT-001` | Start Ticket Work | Department Staff | `BR-STA-001`, `BR-ROLE-005` |
| `UC-TKT-002` | Request Information During Work | Reviewer / Department | `BR-STA-002`, `BR-STA-004` |
| `UC-TKT-003` | Resume Work | Department Staff | `BR-STA-006` |
| `UC-DEP-002` | Record Department Action | Department Staff | `BR-AUD-001`, `BR-ROLE-005` |
| `UC-DEP-003` | Confirm Department Completion | Department Staff | `BR-DEP-001`..`003`, `BR-DEP-009` |
| `UC-TKT-004` | Auto Resolve Ticket | System | `BR-STA-005`, `BR-STA-009`, `BR-DEP-003`, `BR-DEP-007` |
| `UC-TKT-005` | Mark Ticket Cannot Resolve | Reviewer / Department | `BR-STA-003`, `BR-STA-007`..`011`, `BR-DEP-008` |
| `UC-AFF-001` | Mark / Unmark Affected | Authenticated User | `BR-AFF-001`..`007` |
| `UC-FBK-001` | Submit Multi-dimensional Feedback | Reporter | `BR-FBK-001`..`009` |
| `UC-FBK-002` | Edit Feedback | Reporter | `BR-FBK-003`..`008` |
| `UC-NOT-001` | Send Major Event Email | System | `BR-NOT-001`..`005` |
| `UC-ADM-001` | Manage Users / Roles / Permissions | Administrator | `BR-ROLE-001`..`003`, `BR-ROLE-007` |
| `UC-ADM-002` | Manage Categories | Administrator | Soft-disable preserves history |
| `UC-ADM-003` | Manage Departments | Administrator | `BR-ROLE-003` |
| `UC-ADM-004` | Manage Campus Locations | Administrator | `BR-GEN-003` |
| `UC-ADM-005` | View System Analytics | Administrator | `BR-ANL-001`..`006`, `BR-ANL-008` |
| `UC-DEP-004` | View Department Analytics | Department Staff | `BR-ANL-001`..`007` |

---

## 3. Authentication & Identity

### `UC-AUTH-001` — Login via Authentication Provider
* **Preconditions:** User is unauthenticated.
* **Main Flow:**
  1. User initiates login.
  2. System redirects to the configured Authentication Provider (KU-ALL SSO per `BR-AUTH-001`, or Google OAuth 2.0 `@ku.th` via the pluggable provider boundary `BR-AUTH-004`).
  3. Provider authenticates the identity and returns claims (`provider_subject_id`, verified email, real name).
  4. System loads or provisions the user account, roles, and single department membership.
  5. System grants actions according to active roles.
* **Alternative:** Authentication failure denies write/interactive actions while Public Read remains accessible.

### `UC-USR-001` — Set or Change Username
* **Main Flow:** User submits a new `username` → System validates uniqueness (`BR-AUTH-006`) → Saves change → All historical public Reports immediately reflect the updated `username` (`BR-AUTH-008`).
* **Alternative:** Duplicate username is rejected with a validation error (`409` / `422`).

---

## 4. Report Lifecycle Use Cases

### `UC-RPT-001` — Save / Resume Draft Report
* **Primary Actor:** Reporter (authenticated).
* **Save Flow:** Reporter enters partial or complete report fields → clicks Save Draft → System persists Report as `DRAFT` with `created_at` and `updated_at` → Reporter may close and return later.
* **Resume Flow:** Reporter opens their Draft list → loads Draft → edits further → saves again or submits (`UC-RPT-002`).
* **Retention:** Any Report remaining `DRAFT` for 30 days from `created_at` is purged automatically (`BR-RET-001`).

### `UC-RPT-002` — Submit Report
* **Primary Actor:** Reporter; **Supporting Actor:** AI Service.
* **Preconditions:** Authenticated; non-empty `description`; Location with Map Point (`lat`, `lng`); `1–5` images, each `≤ 10 MB`, `.png`/`.jpg`/`.jpeg`.
* **Main Flow:**
  1. Reporter submits a `DRAFT` or new report form.
  2. System validates required fields and media constraints, strips EXIF metadata, assigns `report_number`, sets `version = 1`, and transitions Report to `PENDING_REVIEW`.
  3. System invokes AI (`UC-AI-001`) with Images + Description + Location + active open Tickets.
  4. AI produces Report Title, Category + Confidence, Severity, Recommended Department(s), and Active Ticket Matching (`MATCHED` candidate(s) or `NO_MATCH` → unpublished `Ticket Candidate`).
  5. Reporter can view preliminary AI output; Report enters Reviewer queue.
* **Alternative (AI Failure):** Report remains `PENDING_REVIEW`; System logs `AIAnalysisRun(status=FAILED)`; Reviewer can complete triage manually (`BR-GEN-008`, `BR-AI-020`).
* **Postcondition:** Report is `PENDING_REVIEW`; no final `report.ticket_id` link exists yet.

### `UC-RPT-003` — Edit Pending Report
* **Primary Actor:** Reporter (owner).
* **Preconditions:** Report status is `PENDING_REVIEW`; no Reviewer final decision has occurred.
* **Main Flow:**
  1. Reporter edits Description, Images, or Location.
  2. System validates input, strips EXIF on new images, increments `report.version`, and persists changes.
  3. System marks prior AI analysis runs `is_outdated = true` and triggers `UC-AI-002`.
  4. Report remains `PENDING_REVIEW`.
* **Concurrency Alternative:** If a Reviewer already had the Report open at version `N`, their confirmation/rejection attempt fails with `409 STALE_REPORT_VERSION`, forcing a reload (`BR-RPT-012`).
* **Alternative:** If Reviewer confirmed/rejected before save completes, edit is rejected (`409`).

### `UC-RPT-004` — Cancel Pending Report
* **Primary Actor:** Reporter (owner).
* **Preconditions:** Report is `PENDING_REVIEW` and not yet decided by a Reviewer.
* **Main Flow:** Reporter clicks Cancel → System verifies latest status → transitions Report to `CANCELLED`, records `cancelled_at`, removes from Reviewer queue, writes Audit Log.
* **Retention:** Purged 30 days after `cancelled_at` (`BR-RET-002`).
* **Alternative:** Already `CONFIRMED` or `REJECTED` → cancellation rejected.

### `UC-RPT-005` — Add Report from Existing Active Ticket
* **Primary Actor:** Reporter.
* **Preconditions:** Target Ticket is **Active** (`CONFIRMED`, `IN_PROGRESS`, `WAITING_INFORMATION`).
* **Main Flow:** Reporter opens Ticket Detail → chooses "Report this issue too" → System stores `requested_target_ticket_id` as a non-binding hint → Reporter fills normal report fields and submits (`PENDING_REVIEW`) → AI analyzes → Reviewer may confirm into the hinted ticket, choose another Active Ticket, create a New Ticket, or Reject (`BR-RPT-015`, `BR-REV-005`).
* **Alternative:** If Target Ticket becomes Final before Reviewer confirms, linking to that Ticket is forbidden (`BR-TKT-005`).

---

## 5. AI Use Cases

### `UC-AI-001` — Analyze and Match Report
* **Preconditions:** Report is `PENDING_REVIEW`.
* **Main Flow:** Receive Images + Description + Location + active Categories/Departments + shortlisted Active Tickets → Generate Report Title → Classify Category + Confidence % (+ optional Alternative) → Assess Severity + rationale → Recommend Department(s) → Compare against Active Tickets using Image + Description + Location → Return `MATCHED` (ranked Active Ticket IDs + similarity %) or `NO_MATCH` (Ticket Candidate draft Title/Summary/Category/Severity/Departments) → Persist recommendation for Reviewer.

### `UC-AI-002` — Re-analyze Edited Pending Report
* **Trigger:** Reporter saves an edit to a `PENDING_REVIEW` Report (`UC-RPT-003`).
* **Main Flow:** Mark previous `AIAnalysisRun` records `is_outdated = true` → Execute fresh analysis against latest Report version → Persist new run → Reviewer views latest run as current recommendation.
* **Exception:** AI failure records `FAILED` without blocking manual review.

### `UC-AI-003` — Re-evaluate Ticket after Confirmed Report Change
* **Trigger:** A new Confirmed Report is attached to an existing Ticket (`UC-REV-002`) OR a Reviewer corrects a Confirmed Report (`UC-REV-005`).
* **Main Flow:** Read all Confirmed Reports in the Ticket → Re-evaluate suggested Ticket Severity (without auto-escalating purely on count, `BR-AI-013`), Ticket Title/Summary, and Responsible Department recommendations → Store pending `TicketAIReevaluation` → Reviewer reviews and explicitly decides whether to apply changes (`BR-AI-015`).

---

## 6. Reviewer Use Cases

### `UC-REV-001` — Review Pending Report
* **Preconditions:** Report is `PENDING_REVIEW`; Actor holds `REVIEWER`; Actor is **not** `report.reporter_id` (`BR-ROLE-004`).
* **Main Flow:** Open Report → Display current `version`, `updated_at`, Description, Images, Location, latest AI recommendation & status, and candidate Active Tickets → Reviewer inspects/overrides Category, Severity, Departments, Title/Summary, and Matching → Reviewer proceeds to `UC-REV-002`, `UC-REV-003`, or `UC-REV-004`.
* **Alternatives:** Self-review blocked (`403`); Report updated concurrently forces refresh (`409 STALE_REPORT_VERSION`).

### `UC-REV-002` — Confirm Report into Existing Ticket
* **Preconditions:** Report is `PENDING_REVIEW` at expected `version`; target Ticket is **Active**; Reviewer is not Reporter of the Report.
* **Main Flow:** Verify Ticket is still Active → Transition Report to `CONFIRMED` and set `report.ticket_id` → Append `REPORT_ATTACHED` Public Activity Event → Trigger `UC-AI-003` Ticket Re-evaluation → Write Audit Log → Dispatch `CONFIRMED_EXISTING_TICKET` Major Event Email to Reporter (`UC-NOT-001`).
* **Alternative:** If target Ticket became Final before confirm, fail and prompt Reviewer to pick another Active Ticket or confirm a New Ticket.

### `UC-REV-003` — Confirm New Ticket
* **Preconditions:** Report is `PENDING_REVIEW` at expected `version`; Reviewer provides Final Category, Final Severity, Final Ticket Title/Summary, and **≥ 1 Responsible Department**; Reviewer is not Reporter.
* **Main Flow:** Assign `ticket_number` → Create operational Ticket in status `CONFIRMED` (immediately public) → Transition Report to `CONFIRMED` linked to new Ticket → Create `TICKET_CONFIRMED` Public Activity Event → Write Audit Log → Dispatch `CONFIRMED_NEW_TICKET` Major Event Email to Reporter.

### `UC-REV-004` — Reject Pending Report
* **Preconditions:** Report is `PENDING_REVIEW` at expected `version`; Reviewer is not Reporter; non-empty `rejection_reason` provided (e.g., Out of Scope, Non-actionable, Sensitive Information, Reviewer discretion).
* **Main Flow:** Transition Report to `REJECTED` (Final State) → Do not link to any Ticket; never publish → Write Audit Log.

### `UC-REV-005` — Correct Confirmed Report
* **Preconditions:** Report is `CONFIRMED`; Actor is `REVIEWER` and not Reporter of that Report.
* **Main Flow:** Reviewer updates erroneous Report metadata/fields → Write Audit Log → Trigger `UC-AI-003` Ticket Re-evaluation → Reviewer inspects any new Ticket recommendations.

### `UC-REV-006` — Change Responsible Departments
* **Preconditions:** Ticket is **Active**; Actor is `REVIEWER` and not a Reporter of the Ticket; resulting department list has `≥ 1` department.
* **Add Flow:** Add new Department(s) with `is_completed = false`; retain `is_completed` state of existing departments (`BR-DEP-005`, `BR-DEP-006`); log `DEPARTMENT_ADDED` activity and audit entry.
* **Remove Flow:** Remove Department(s); retain `is_completed` state of remaining departments; log `DEPARTMENT_REMOVED`; **if all remaining assigned Departments are now complete, immediately invoke `UC-TKT-004` Auto Resolve (`BR-DEP-007`)**.
* **Alternative:** Final Ticket → department edits rejected (`409`).

---

## 7. Public Access & Map Use Cases

* **`UC-PUB-001` — Browse Public Feed:** Unauthenticated access displays Active Tickets by default, sorted `confirmed_at DESC`.
* **`UC-PUB-002` — Search / Filter / Paginate Tickets:** Search across Ticket ID, Title, Description, Location, Category, Department; filter by Status, Severity, Category, Department, Date, Location; page size `25`/`50`/`100`; desktop 5 cards/row.
* **`UC-PUB-003` — View Ticket Detail:** Shows core Ticket fields, Responsible Departments, linked Confirmed Reports (thumbnail + AI Report Title), Report Count, Affected Count, Public Activity Timeline, Resolution Info, and Aggregate Feedback Rating. Excludes Additional Information Thread (`BR-PUB-010`).
* **`UC-PUB-004` — View Public Report Detail:** For `CONFIRMED` Reports only — shows Reporter's current Username, Description, EXIF-stripped Images, and Location.
* **`UC-PUB-005` — View Reporter Public Profile:** Shows Username and public (`CONFIRMED`) Report history; excludes all private SSO/PII attributes (`BR-AUTH-010`).
* **`UC-MAP-001` — View Tickets on Campus Map:** Displays Public Tickets as interactive map markers within KU Bangkhen; clicking a marker opens Ticket summary/detail.

---

## 8. Additional Information Thread Use Cases

### `UC-THR-001` — Request Additional Information
* **Primary Actor:** Reviewer or Responsible Department Staff (must not be a Reporter of the Ticket).
* **Preconditions:** Ticket is `CONFIRMED`, `IN_PROGRESS`, or `WAITING_INFORMATION`.
* **Main Flow:** Actor posts a question in the private Thread → If not already `WAITING_INFORMATION`, Ticket transitions to `WAITING_INFORMATION` → System writes Audit Log & Public Status Change Activity (without leaking thread text) → System sends `WAITING_INFORMATION` Major Event Email to all Reporters of the Ticket.

### `UC-THR-002` — Respond in Ticket Thread
* **Primary Actor:** Reporter (must have a `CONFIRMED` Report in the Ticket).
* **Main Flow:** Reporter reads private Thread → posts follow-up response → Message saved privately → Involved Reviewers and Responsible Department Staff can read and reply. Unrelated users and public visitors are strictly blocked (`403`).

---

## 9. Department & Ticket Operation Use Cases

* **`UC-DEP-001` — View Department Work Dashboard:** Authenticated `DEPARTMENT_STAFF` (single Department) sees Active Tickets assigned to their Department, filterable/searchable; operational buttons disabled on any Ticket where the staff user is a Reporter (`BR-ROLE-005`).
* **`UC-TKT-001` — Start Ticket Work:** Ticket is `CONFIRMED`; Responsible Department Staff (not Reporter) starts work → Ticket transitions to `IN_PROGRESS` → Public Activity + Audit recorded.
* **`UC-TKT-002` — Request Information During Work:** Reviewer or Responsible Department Staff requests clarification from `CONFIRMED` or `IN_PROGRESS` → creates Thread request (`UC-THR-001`), transitions Ticket to `WAITING_INFORMATION`, emails Reporters.
* **`UC-TKT-003` — Resume Work:** Ticket is `WAITING_INFORMATION`; Responsible Department Staff (not Reporter) resumes work → Ticket transitions to `IN_PROGRESS` → Public Activity + Audit recorded.
* **`UC-DEP-002` — Record Department Action:** Responsible Department Staff (not Reporter) records operational updates, notes, and permitted evidence images → recorded on Public Activity Timeline + Audit Log.
* **`UC-DEP-003` — Confirm Department Completion:** Ticket is `IN_PROGRESS`; Responsible Department Staff (not Reporter) confirms their Department's completion (with optional note) → System marks that department `is_completed = true` → Logs `DEPARTMENT_COMPLETED` → Checks all Responsible Departments: if incomplete remain, Ticket stays `IN_PROGRESS`; if all complete, immediately invokes `UC-TKT-004`.
* **`UC-TKT-004` — Auto Resolve Ticket (System):** Triggered when all Responsible Departments complete (`UC-DEP-003`) OR an incomplete department is removed leaving all remaining departments complete (`UC-REV-006`) → Transitions Ticket immediately to `RESOLVED` (Final) → Records `resolved_at` and `AUTO_RESOLVED` activity → Locks new Reports, Mark Affected, and Department edits → Sends `RESOLVED` Major Event Email to Reporters → Opens Feedback (`UC-FBK-001`).
* **`UC-TKT-005` — Mark Ticket Cannot Resolve:** Reviewer or Responsible Department Staff (not Reporter) on a Ticket in **`CONFIRMED` or `WAITING_INFORMATION` ONLY** (**forbidden from `IN_PROGRESS`**, `BR-STA-008`) provides mandatory `description` → Entire Ticket transitions immediately to `CANNOT_RESOLVE` (Final; a single Department suffices, `BR-DEP-008`) → Records Public Activity & Audit Log → Sends `CANNOT_RESOLVE` Major Event Email to Reporters → Locks Ticket permanently.

---

## 10. Affected User, Feedback & Notification Use Cases

* **`UC-AFF-001` — Mark / Unmark Affected:** Authenticated non-Admin user toggles affected status on an **Active Ticket** (unique per `(ticket_id, user_id)`). Final Tickets freeze historical count. Affected-only users do not receive Major Event Emails.
* **`UC-FBK-001` — Submit Multi-dimensional Feedback:** Reporter with a `CONFIRMED` Report in a **`RESOLVED`** Ticket submits 1–5 star ratings per dimension (one Feedback Set per Reporter per Ticket) → System recalculates per-dimension averages and overall Ticket aggregate average.
* **`UC-FBK-002` — Edit Feedback:** Reporter updates their existing Feedback Set → System saves and recalculates averages.
* **`UC-NOT-001` — Send Major Event Email (System):** Dispatches email notifications strictly to Reporters of the Ticket for `CONFIRMED_NEW_TICKET`, `CONFIRMED_EXISTING_TICKET`, `WAITING_INFORMATION`, `RESOLVED`, and `CANNOT_RESOLVE` (`BR-NOT-001`..`005`).

---

## 11. Administrator & Analytics Use Cases

* **`UC-ADM-001` — Manage Users / Roles / Permissions:** Manage account status, roles, and permissions while strictly enforcing Exclusive Administrator (`BR-ROLE-002`) and max-1-Department per Staff (`BR-ROLE-003`). Admin cannot operate on Tickets.
* **`UC-ADM-002` — Manage Categories:** Add, edit, or soft-disable Categories (disabled categories cannot be assigned to new Reports/Tickets but remain readable on historical records).
* **`UC-ADM-003` — Manage Departments:** Add, edit, or soft-disable Departments; define responsibility scope; manage staff assignment (max 1 department per user).
* **`UC-ADM-004` — Manage Campus Locations:** Add, edit, or soft-disable KU Bangkhen master locations (Buildings, Common Areas, Roads, Activity Plazas, Service Points, Landmarks) with coordinates.
* **`UC-ADM-005` — View System Analytics:** System-wide dashboard separating Tickets, Reports, Affected Users, Review Time, Resolution Time, Total Lead Time, Satisfaction, and per-Department Performance.
* **`UC-DEP-004` — View Department Analytics:** Department Staff view Ticket Count, Active/Resolved breakdown, Average Resolution Time, Average Satisfaction, and linked Report Count scoped strictly to their own Department.

---

## 12. State-Related Use Case Summary

### Report State Flow
```text
UC-RPT-001 (Save Draft) ──▶ DRAFT ──(30d purge)
                              │
                   UC-RPT-002 (Submit)
                              ▼
                        PENDING_REVIEW ◀── UC-RPT-003 (Edit → version++ & UC-AI-002)
                       ╱      │       ╲
     UC-REV-002/003   ╱   UC-REV-004   ╲  UC-RPT-004
         (Confirm)   ▼     (Reject)     ▼  (Cancel)
                 CONFIRMED  REJECTED  CANCELLED ──(30d purge)
```

### Ticket State Flow
```text
Ticket Candidate (Unpublished)
      │ UC-REV-003 (Confirm New Ticket)
      ▼
  CONFIRMED ───────(UC-TKT-001 Start)────────▶ IN_PROGRESS
    │   │                                        │      │
    │   └──(UC-THR-001 / UC-TKT-002)──▶ WAITING_INFORMATION ◀──┘ (UC-TKT-002)
    │                                     │      │
    │                                     │      └──(UC-TKT-003 Resume)──▶ IN_PROGRESS
    │                                     │                                     │
    └──(UC-TKT-005 Cannot Resolve)────────┴──(UC-TKT-005)──▶ CANNOT_RESOLVE     │
                                                                 [Final]        │
                                                                                ▼
                                          (UC-DEP-003 / UC-REV-006 → UC-TKT-004)
                                                                            RESOLVED
                                                                             [Final]
```
*(Forbidden: `IN_PROGRESS → CANNOT_RESOLVE` per `BR-STA-008`.)*
