# KU Spot — Business Requirements Document (Requirement Freeze 1)

> **Source Alignment:** This document is the English canonical Business Requirements Document for **KU Spot**, aligned with **Requirement Freeze 1** (originating from the CampusFix AI V4 Requirement Freeze 1 specification suite). Detailed atomic rules live in [docs/business-rules.md](business-rules.md) (`BR-*`), and behavioral flows live in [docs/use-cases.md](use-cases.md) (`UC-*`).

| Field | Detail |
| --- | --- |
| **Platform Name** | KU Spot — AI-Assisted Campus Issue Management Platform |
| **Scope Campus (MVP)** | Kasetsart University, Bangkhen Campus |
| **Requirement Baseline** | Requirement Freeze 1 (V4) |
| **Authors** | Rugsit Rungrattanachai (6610402205), Bowornrat Tangnararatchakit (6610402132) |

---

## 1. System Overview

**KU Spot** is a centralized platform for students, staff, and campus community members at Kasetsart University (Bangkhen Campus) to report physical infrastructure and shared campus service issues, leverage AI-assisted analysis and duplicate matching, support human verification by Reviewers, coordinate multi-department resolution, and publish transparent status updates.

### 1.1 Issue Scope

* **In Scope:** Physical facilities, infrastructure, shared spaces, assets, and campus services — including lighting/electrical, classrooms/restrooms/buildings, damaged furniture or equipment, campus internet/IT infrastructure, cleanliness/waste, water leaks/drainage/flooding, elevators, campus safety hazards, and traffic/parking issues.
* **Out of Scope:** Personal complaints against faculty, staff, or students; harassment; interpersonal conflicts; or disciplinary matters (`BR-GEN-001`, `BR-GEN-002`).

### 1.2 End-to-End Value Flow

```text
Recognize Issue → Submit Report → AI Analysis & Active Ticket Matching → Reviewer Verification
  → Group into Ticket → Assign Responsible Department(s) → Department Operations & Tracking
  → Multi-Department Completion / Auto-Resolve → Reporter Feedback → Analytics & Prevention
```

### 1.3 Core Domain Concept: Report vs. Ticket

The central architectural abstraction is separating **Report** (one individual's observation) from **Ticket** (one verified campus incident):

```text
Ticket 1 ──────── 1..* Confirmed Report
```

| Dimension | Report | Ticket |
| --- | --- | --- |
| **Represents** | One Reporter's submission at a point in time | One verified campus incident/problem tracked operationally |
| **Core Data** | Reporter, Description, 1–5 Images, Location + Map Point, Version, Report Status, AI Analysis Runs | Ticket Number, Title, Summary, Category, Severity, Canonical Location, Responsible Departments, Ticket Status, Public Activity Timeline |
| **Cardinality** | Many Reports can describe the same incident; each confirmed Report links to **exactly one** Ticket (`BR-GEN-005`) | Must contain **at least one** confirmed Report (`BR-GEN-006`) |
| **Deduplication** | Duplicate detection **never deletes or overwrites** original Reports; it groups them under one Ticket | Aggregates evidence and counts while preserving every linked Report |
| **Pre-Confirmation Draft** | `DRAFT` and `PENDING_REVIEW` are never public | On AI No Match, the system prepares an unpublished `Ticket Candidate` without operational status until Reviewer confirms (`BR-TKT-009`) |

---

## 2. Problem Statement & Objectives

### 2.1 Current Pain Points

1. Issue reports are fragmented across direct staff contact, phone, email, LINE, and social media.
2. Reporters do not know which university department owns a given issue.
3. Submissions frequently lack photos or precise location data.
4. Multiple people report the same incident without grouping or deduplication.
5. Staff must manually triage, categorize, and route issues.
6. Reporters lack visibility into progress and resolution evidence.
7. Departments and Administrators lack unified operational and spatial visibility.
8. Historical issue data is not structured for preventive maintenance planning.
9. Affected campus users who do not wish to write a full report have no lightweight way to signal impact.

### 2.2 Platform Objectives

* Consolidate physical issue reporting for KU Bangkhen into a single transparent channel.
* Use multimodal AI (description + images + location) as a **Decision Support System** for category classification, severity assessment, duplicate detection, department recommendation, and title/summary generation.
* Preserve strict **human-in-the-loop** control: Reviewers verify and finalize every report and ticket decision; AI outages never block submission or review.
* Coordinate multi-department work cleanly without primary-department ambiguity or individual staff assignment bottlenecks.
* Provide public accountability through a Public Feed, Map, and Public Activity Timeline while protecting personal identity data and keeping clarification threads private.
* Separate **Ticket Count**, **Report Count**, and **Affected User Count** across all analytics and dashboards.

---

## 3. Stakeholders, Roles & Access Control

The platform defines **4 roles**:

| Role | Responsibilities & Capabilities | Key Constraints |
| --- | --- | --- |
| **Reporter** | Save/resume `DRAFT` reports, submit `PENDING_REVIEW` reports, edit/cancel while `PENDING_REVIEW`, add a report from an Active Ticket, track tickets, participate in private Additional Information Thread (only on tickets where they have a Confirmed Report), toggle `Mark Affected` on Active Tickets, and submit/edit multi-dimensional Feedback after `RESOLVED`. | Cannot edit/cancel after `CONFIRMED` or `REJECTED`. Does not manually choose Category, Severity, or Department on submission. |
| **Reviewer** | Central triage authority. Inspect `PENDING_REVIEW` reports (latest version only), override AI results (Category, Severity, Departments, Title/Summary, Matching), confirm into an Existing Active Ticket or confirm a Ticket Candidate as a New Ticket, reject with mandatory reason, correct Confirmed Reports (triggering ticket re-evaluation), add/remove Responsible Departments on Active Tickets, and request additional information (`WAITING_INFORMATION`). | **Separation of Duties (`BR-ROLE-004`):** Cannot review, confirm, reject, or manage any Report/Ticket where they are a Reporter. |
| **Department Staff** | View Department Work Dashboard for their department's Active Tickets, start work (`CONFIRMED → IN_PROGRESS`), request additional information (`WAITING_INFORMATION`), resume work (`WAITING_INFORMATION → IN_PROGRESS`), record operational actions and evidence on Public Activity Timeline, confirm their department's completion, and view department-scoped analytics. | Belongs to **at most 1 Department** (`BR-ROLE-003`). **No individual staff assignment** (`BR-TKT-012`). **Separation of Duties (`BR-ROLE-005`):** Cannot perform operational actions on Tickets where they are a Reporter. |
| **Administrator** | Manage Users, Account Status, Roles, Permissions, Username policy, Categories, Departments, Campus Locations, System Configuration, and System-wide Analytics. | **Exclusive Role (`BR-ROLE-002`):** Cannot hold `REPORTER`, `REVIEWER`, or `DEPARTMENT_STAFF` on the same account. Cannot operate on Tickets (`BR-ROLE-007`). |

### 3.1 Cross-Cutting Access & Privacy Principles

* **Multi-Role Accounts:** A single non-admin account may hold multiple operational roles (e.g., `REPORTER` + `REVIEWER`, or `REPORTER` + `DEPARTMENT_STAFF`), subject to Separation of Duties (`BR-ROLE-001`, `BR-ROLE-004`..`006`).
* **Public Read vs. Authenticated Write:** Public Feed, Ticket Detail, Public Report Detail, Campus Map, Public Activity Timeline, and Public Reporter Profile are readable **without login** (`BR-AUTH-003`). All write/interactive actions require authentication (`BR-AUTH-002`).
* **Authentication Provider:** MVP uses **Google OAuth 2.0 (`@ku.th`)** as the initial authentication provider (`BR-AUTH-001`), implemented behind a **pluggable Auth Provider boundary** (`BR-AUTH-004`) so other providers (such as KU-ALL SSO) can be added in the future without modifying domain logic.
* **Public Identity & Privacy:** Every user has a unique, mutable `Username` displayed on public reports and profiles; changing a username updates display retroactively across historical reports (`BR-AUTH-005`..`009`). Real name, email, student ID, and academic department must never be exposed publicly (`BR-AUTH-010`). Uploaded images must have EXIF metadata stripped prior to storage/publication.

---

## 4. End-to-End Lifecycle & Workflow

### 4.1 Report Lifecycle (`BR-RLC-001`..`010`)

```text
DRAFT ──(Submit)──▶ PENDING_REVIEW
                        ├──(Reviewer Confirm)──▶ CONFIRMED   [Final]
                        ├──(Reviewer Reject)───▶ REJECTED    [Final]
                        └──(Reporter Cancel)───▶ CANCELLED   [Final Workflow State]
```

* **`DRAFT`:** Persistent state allowing Reporters to resume later. Purged automatically 30 days after `created_at` (`BR-RET-001`).
* **`PENDING_REVIEW`:** Created on submission (requires Description, Location + Map Point, and 1–5 images ≤10 MB in `.png`/`.jpg`/`.jpeg`). Reporter may edit or cancel until Reviewer confirms/rejects. Every edit increments `version`, marks prior AI output outdated, and triggers AI re-analysis (`BR-RPT-008`..`012`).
* **`CONFIRMED`:** Final state for the Report; linked to exactly one Ticket. Report status does not change as Ticket status evolves (`BR-RLC-007`).
* **`REJECTED`:** Final state; requires a mandatory rejection reason; never linked to a Ticket; never public (`BR-RLC-008`, `BR-REV-007`).
* **`CANCELLED`:** Final workflow state used instead of immediate hard deletion to preserve audit trails. Purged automatically 30 days after `cancelled_at` (`BR-RLC-009`, `BR-RET-002`).

### 4.2 Ticket Lifecycle (`BR-TKT-001`..`013`, `BR-STA-001`..`011`)

* **Active Tickets:** `CONFIRMED`, `IN_PROGRESS`, `WAITING_INFORMATION`
* **Final Ticket:** `RESOLVED` *(every Ticket terminates at `RESOLVED`; there is no `CANNOT_RESOLVE` state)*

```text
Ticket Candidate (Unpublished)
  └──(Reviewer Confirm)──▶ CONFIRMED
                              ├──(Department Start)──────────────▶ IN_PROGRESS
                              └──(Reviewer/Dept Request Info)────▶ WAITING_INFORMATION

IN_PROGRESS
  ├──(Reviewer/Dept Request Info)────────────────────────────────▶ WAITING_INFORMATION
  └──(System: All Responsible Departments Complete)──────────────▶ RESOLVED       [Final]

WAITING_INFORMATION
  ├──(Department Resume)─────────────────────────────────────────▶ IN_PROGRESS
  └──(System: Remaining Departments Complete after Dept Removal)─▶ RESOLVED       [Final]
```

**Critical Ticket Invariants:**
1. **`RESOLVED` is the sole Final Ticket status** (`BR-STA-009`). Every Ticket ends at `RESOLVED` via multi-department completion; `CANNOT_RESOLVE` is not part of the platform.
2. Only **Active Tickets** can accept additional Reports, serve as AI Matching candidates, accept `Mark Affected` toggles, or have Responsible Departments modified (`BR-TKT-001`..`004`).
3. **Final Tickets** never reopen and cannot be modified operationally (`BR-TKT-005`..`007`, `BR-STA-009`).
4. **Multi-Department Resolution (`BR-DEP-001`..`007`):** A Ticket may have 1 or more Responsible Departments with **no Primary Department**. Completion is recorded per department. When all assigned departments complete (or when an incomplete department is removed by a Reviewer leaving all remaining departments complete), the System **immediately auto-transitions the Ticket to `RESOLVED`** with no additional Reviewer approval.

---

## 5. AI Capabilities & Guardrails (`BR-AI-001`..`020`)

AI operates strictly as a **Decision Support System**:

* **Capabilities (MVP):**
  1. Optional **Report Rephrasing** (`Rephrase`) to polish user-authored report text without inventing facts.
  2. Multimodal **Category Classification** (from Description + Images + Location) with Confidence (`0–100%`) and optional Alternative Category.
  3. **Severity Assessment** (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) using deterministic scoring at both Report and Ticket levels. High report volume must **never** automatically escalate Severity (`BR-AI-013`).
  4. **Duplicate / Ticket Matching** comparing against **Active Tickets only**, using Images + Description + Location + extracted keywords and semantic embedding vectors (the AI Gateway produces unit-normalized report/ticket embeddings and keywords while `apps/api` computes cosine similarity + keyword matching + spatial/recency ranking). Returns either `MATCHED` (ranked Active Ticket candidates + similarity %) or `NO_MATCH` (prepares an unpublished `Ticket Candidate`).
  5. **Multi-Department Recommendation** based on Category, Description, Location, Images, and Department responsibility scopes.
  6. **Report Title** generation (short summary of each Report for Ticket Detail) and **Ticket Title / Summary (Description)** synthesis across all linked Reports.
  7. **Ticket Re-evaluation (`UC-AI-003`):** Triggered when a Confirmed Report is added to or corrected on a Ticket. Produces recommendations and updated ticket vectors only; never mutates final Ticket fields without Reviewer approval (`BR-AI-014`, `BR-AI-015`).
* **Hard Guardrails:** AI must **never** confirm, reject, resolve, delete, hide, or mutate final operational Tickets (`BR-AI-016`..`019`).
* **Failure Resilience:** AI timeouts, errors, or outages must **never** block Report submission or manual Reviewer operations (`BR-GEN-008`, `BR-AI-020`).

### 5.1 Severity Scale

| Level | Definition |
| --- | --- |
| `CRITICAL` | Direct risk to human life, safety, or major property requiring immediate attention (e.g., electrical short/leakage, structural hazard, flooding near electrical equipment). |
| `HIGH` | Severely disrupts core services or affects a large area/population (e.g., building-wide outage, water shutoff, broken elevator). |
| `MEDIUM` | Partially disrupts convenience or usability while workarounds exist (e.g., isolated light out, single broken fixture). |
| `LOW` | Routine minor issue or cosmetic defect that can follow standard queuing. |

---

## 6. Public Publishing, Interaction & Notifications

### 6.1 Public Feed, Map & Details (`BR-PUB-001`..`010`)

* **Default Feed:** Displays **Active Tickets** sorted by `Confirmed Time DESC`.
* **Search:** Ticket ID, Ticket Title, Description, Location, Category, Department.
* **Filters:** Status, Severity, Category, Department, Date range, Location.
* **Pagination & Layout:** Page sizes `25`, `50`, `100`; desktop grid displays **5 Ticket Cards per row** (`BR-PUB-006`, `BR-PUB-007`).
* **Public Ticket Detail:** Ticket ID, Title, Summary, Status, Severity, Category, Location, Responsible Departments, Linked Confirmed Reports (Thumbnail + AI-generated Report Title), Report Count, Affected User Count, Public Activity Timeline, Resolution Information, and Aggregate Feedback Rating.
* **Public Report Detail:** Reporter current Username, Description, Images, Location (only for `CONFIRMED` Reports).
* **Map:** Basic campus map for pinning Report locations and viewing Public Tickets (no advanced heatmap in MVP).

### 6.2 Additional Information Thread (`BR-THR-001`..`006`)

* Strictly **private** — never shown in Public Feed, Public Ticket Detail, or Public Activity Timeline.
* Accessible only by active `REVIEWER`s (central pool), Responsible Department Staff, and Reporters who have a Confirmed Report in that Ticket (`403` for all others, including `ADMINISTRATOR`). Posting is allowed only in `WAITING_INFORMATION`; `IN_PROGRESS` allows read-only history when messages exist; `CONFIRMED` and `RESOLVED` keep the Thread closed/hidden.
* No general public comments in MVP.

### 6.3 Mark Affected (`BR-AFF-001`..`007`)

* Authenticated users may mark/unmark themselves as affected once per **Active Ticket**.
* Final Tickets freeze the count for historical display.
* Affected-only users do **not** receive Major Event Emails unless they are also a Reporter on that Ticket.

### 6.4 Multi-Dimensional Feedback (`BR-FBK-001`..`009`)

* Available **only when Ticket status is `RESOLVED`**, exclusively to Reporters with a Confirmed Report in that Ticket.
* One Feedback Set per Reporter per Ticket; editable after submission.
* Multi-dimensional `1–5` star ratings; system computes per-dimension averages and an aggregate Ticket average.

### 6.5 Major Event Email Notifications (`BR-NOT-001`..`005`)

* MVP delivers Email notifications to **Reporters of the Ticket only** for major events:
  1. Report Confirmed → New Ticket created
  2. Report Confirmed → Attached to Existing Ticket
  3. Ticket transitioned to `WAITING_INFORMATION`
  4. Ticket transitioned to `RESOLVED`

---

## 7. Administration, Audit & Analytics

### 7.1 Master Data Management

Administrators manage Users/Roles/Permissions, Problem Categories (starting with ~5 core groups: Buildings & Facilities, Electrical & Lighting, Cleanliness, Internet & IT, Safety, plus Other; soft-disable preserves historical readability), Departments (responsibility scope + staff membership), and Campus Locations (Buildings, Common Areas, Roads, Activity Plazas, Service Points, Landmarks within KU Bangkhen).

### 7.2 Auditability (`BR-AUD-001`..`009`)

Every Report save/submit/edit/cancel/confirm/reject, AI analysis run, Reviewer decision, Ticket status/department change, Department completion, and Retention purge must be audited with Actor, Role/Department, and Timestamp — sufficient to prove Separation of Duties compliance.

### 7.3 Analytics & Time Metrics (`BR-ANL-001`..`008`)

* Strictly separate **Ticket Count**, **Report Count**, and **Affected User Count**.
* Track four time metrics (no SLA enforcement in MVP):
  * **Review Time:** Report Submitted → Reviewer Final Decision
  * **Resolution Time:** Ticket Confirmed → `RESOLVED`
  * **Total Lead Time:** First Report Submitted → `RESOLVED`
  * **Ticket Aging (Active Tickets):** `Current Time - Ticket Confirmed Time`
* Administrators view system-wide analytics and Department performance; Department Staff view analytics scoped to their own department.

---

## 8. Out of Scope (MVP) & Post-MVP Roadmap

### Explicitly Out of MVP

* Video upload and video analysis
* Voice-to-Text reporting
* AI Chat Assistant (natural language queries)
* Detailed Heatmap and advanced spatial analytics
* Predictive Maintenance and Recurring Ticket Links (`recurrence_of`)
* SLA timers and escalation workflows
* Individual Staff Assignment and Transfer Workflows
* Internal staff-only notes
* General Public Comment discussions
* Ticket Reopen, `CANNOT_RESOLVE`, and `CLOSED` states
* LINE OA / LIFF integration
* Multi-campus / Multi-university / Multi-tenant support

### Post-MVP Expansion Candidates

Video analysis, Voice-to-Text, LINE OA / LIFF secondary channel (sharing the same Backend API), Detailed Heatmap & spatial analytics, Recurring Problem Analysis (`recurrence_of`), Predictive Maintenance, AI Chat Assistant (permission-aware DB queries), SLA/Escalation, additional notification channels and authentication providers, and multi-campus expansion.
