# Web ↔ Go API Contract (`/api/v1`)

This document defines the HTTP contract between `apps/web` and `apps/api`. All timestamps use ISO 8601 UTC (`RFC3339`), JSON fields use `camelCase`, and enums match [docs/data-model.md](../docs/data-model.md).

---

## 1. Conventions

* **Base Path:** `/api/v1` (except operational health endpoints `/healthz` and `/readyz`).
* **Request ID:** Responses include `X-Request-Id`. Errors include the same value as `error.requestId`.
* **Auth:** HTTP-only session cookie (`ku_spot_session`). Public endpoints work with or without a cookie; authenticated endpoints return `401 UNAUTHENTICATED` when missing/invalid.
* **Pagination Envelope:**
  ```json
  {
    "items": [],
    "pagination": { "page": 1, "pageSize": 25, "totalItems": 120, "totalPages": 5 }
  }
  ```
  Supported `pageSize` values for Public Feed: `25`, `50`, `100` (`BR-PUB-006`).
* **Standard Error Envelope:** Defined in [docs/architecture.md](../docs/architecture.md#7-http-error-envelope--status-code-convention).

---

## 2. Health & Readiness (Implemented in Bootstrap)

> **Operational Probe Contract:** `/healthz` and `/readyz` intentionally use lightweight probe JSON rather than the `/api/v1/*` error envelope. `apps/web/src/app/api/health/route.ts` and `scripts/smoke.sh` parse `status`, `checks.db`, and `checks.ai` directly — keep both `200` and `503` payloads synchronized if ever changed.

| Method & Path | Auth | Headers | Response Payloads |
| --- | --- | --- | --- |
| `GET /healthz` | Public | — | `200`: `{"status":"ok"}` |
| `GET /readyz` | Public | `Cache-Control: no-store` | Checks PostgreSQL (`SELECT 1`) and AI Gateway (`/healthz`) under a `2s` timeout.<br>`200`: `{"status":"ok","checks":{"db":"ok","ai":"ok"}}`<br>`503`: `{"status":"unavailable","checks":{"db":"ok\|unavailable","ai":"ok\|unavailable"}}` |

---

## 3. Authentication & Profile (`UC-AUTH-001`, `UC-USR-001`)

| Method & Path | Auth | Behavior |
| --- | --- | --- |
| `GET /api/v1/auth/login` | Public | Redirects to the configured Authentication Provider (initial MVP: Google OAuth 2.0 `@ku.th` via pluggable `AuthProvider` boundary). |
| `GET /api/v1/auth/callback` | Public | Validates provider callback, provisions/loads user + roles + department, sets session cookie. |
| `POST /api/v1/auth/logout` | Auth | Invalidates current session cookie. |
| `GET /api/v1/me` | Auth | Returns current authenticated user profile (`id`, `username`, `roles`, `departmentId`, `isActive`; never exposed publicly). |
| `PATCH /api/v1/me/username` | Auth | Updates unique `username` (`BR-AUTH-006`..`008`). Returns `409 USERNAME_TAKEN` on collision. |

Login accepts an optional same-origin absolute path via `next`. It returns `302` on success and `503 SERVICE_UNAVAILABLE` when Google OAuth is disabled. The callback redirects to that path or defaults to `/admin` for exclusive administrators and `/feed` for other users. On failure it redirects to `/login?error=<code>` with a stable code such as `INVALID_OAUTH_STATE`, `OAUTH_DENIED`, `INVALID_OAUTH_IDENTITY`, `ACCOUNT_INACTIVE`, or `SERVICE_UNAVAILABLE`. Logout returns `204`.

The private profile and successful username patch return `id`, `username`, `realName`, `email`, `emailVerified`, `hostedDomain`, `avatarUrl`, `authProvider`, `roles`, `departmentId`, `isActive`, and `createdAt`. The username patch takes `{"username":"name"}`. Invalid usernames return `422 VALIDATION_ERROR`.

Cookie-authenticated identity writes require a same-origin `Origin` or, when it is absent, a same-origin `Referer`. Conflicting Fetch Metadata or missing origin proof returns `403 FORBIDDEN`. Both identity PATCH endpoints require `Content-Type: application/json` (parameters allowed). A missing or unsupported media type returns `415 UNSUPPORTED_MEDIA_TYPE`.

---

## 4. Public Read Endpoints (No Login Required — `BR-AUTH-003`, `BR-PUB-*`)

> **Privacy Guard (`BR-AUTH-010`, `BR-PUB-010`):** Public responses MUST NEVER include `realName`, `email`, `providerSubjectId`, `avatarUrl`, `DRAFT`/`PENDING_REVIEW`/`REJECTED`/`CANCELLED` reports, `Ticket Candidate`, or `threadMessages`.

| Method & Path | Query / Behavior |
| --- | --- |
| `GET /api/v1/public/tickets` | Public Feed (`UC-PUB-001`, `UC-PUB-002`). Defaults: Active Tickets (`CONFIRMED,IN_PROGRESS,WAITING_INFORMATION`), sort `confirmed_at DESC`, `pageSize=25`. Params: `q` (search Ticket Number, Title, Description, Location, Category, Department), `status` (comma-separated), `severity`, `categoryId`, `departmentId`, `locationId`, `dateFrom`, `dateTo`, `page`, `pageSize` (`25|50|100`). |
| `GET /api/v1/public/tickets/map` | Lightweight markers for `UC-MAP-001` (`ticketNumber`, `title`, `status`, `severity`, `lat`, `lng`, `locationName`, `categoryId`). Accepts same filters as Feed. |
| `GET /api/v1/public/tickets/:ticketNumber` | Ticket Detail (`UC-PUB-003`): core fields, `departments` (with per-dept completion status), linked `CONFIRMED` reports (`reportNumber`, `aiGeneratedTitle`, `thumbnailUrl`, `reporterUsername`, `submittedAt`), `reportCount`, `affectedCount`, `viewerHasMarkedAffected` (if logged in), `publicActivities`, `resolutionSummary`, and `feedbackAggregate`. |
| `GET /api/v1/public/reports/:reportNumber` | Public Report Detail (`UC-PUB-004`). Returns `404` unless `status == 'CONFIRMED'`. Fields: `reportNumber`, `ticketNumber`, `reporterUsername` (current), `description`, `images` (EXIF-stripped), `location`, `submittedAt`. |
| `GET /api/v1/public/users/:username` | Public Reporter Profile (`UC-PUB-005`): `username` + paginated list of their `CONFIRMED` public reports. |
| `GET /api/v1/public/master-data` | Active Categories, Departments, and Campus Locations for search filters and map pickers. |

---

## 5. Reporter Endpoints (`UC-RPT-001`..`005`)

All require authenticated non-Admin user (`REPORTER`).

| Method & Path | Behavior & Rules |
| --- | --- |
| `POST /api/v1/media/report-images` | Multipart upload for a single image (`.png`/`.jpg`/`.jpeg`, `≤ 10 MB`). Strips EXIF server-side, stores a **staged** `report_images` row (`report_id = NULL`, `uploaded_by = caller`, `expires_at = +24h`), and returns `{ "imageId": "...", "previewUrl": "/api/v1/media/report-images/:imageId", "expiresAt": "..." }`. |
| `GET /api/v1/media/report-images/:imageId` | Serves EXIF-stripped image bytes enforcing report-aligned access control: staged (`report_id IS NULL`) → `uploaded_by` only; `DRAFT`/`CANCELLED` → owner only; `PENDING_REVIEW`/`REJECTED` → owner or active `REVIEWER`; `CONFIRMED` → Public (no login required). |
| `GET /api/v1/my-reports` | Lists caller's own reports (`DRAFT`, `PENDING_REVIEW`, `CONFIRMED`, `REJECTED`, `CANCELLED`). |
| `GET /api/v1/reports/:id` | Returns report detail + latest AI analysis run. Accessible by owner (`reporterId`) or `REVIEWER` (for `PENDING_REVIEW`/`REJECTED`). |
| `POST /api/v1/reports/drafts` | Save new `DRAFT` (`UC-RPT-001`). Partial fields allowed; any `imageIds` are validated for caller ownership and bound to the new Report in the same transaction (clearing `expires_at`). |
| `PATCH /api/v1/reports/:id/draft` | Update existing `DRAFT` (owner only); binds newly added staged `imageIds` owned by caller in the same transaction. |
| `POST /api/v1/reports/:id/submit` | Submit `DRAFT` (or `POST /api/v1/reports` to create+submit directly, `UC-RPT-002`). Validates Description, Location+Map Point, `1–5` caller-owned staged/attached `imageIds` (binding them inside the same transaction and clearing `expires_at`); assigns `reportNumber`; sets `PENDING_REVIEW`, `version = 1`; triggers `UC-AI-001` without failing submission on AI outage. Optional `requestedTargetTicketId` (must be Active, `UC-RPT-005`). |
| `PATCH /api/v1/reports/:id` | Edit `PENDING_REVIEW` report (`UC-RPT-003`, owner only). Validates/binds any new caller-owned staged `imageIds` in the same transaction, increments `version`, marks prior AI runs `isOutdated = true`, triggers `UC-AI-002`. Returns `409` if already `CONFIRMED`/`REJECTED`. |
| `POST /api/v1/reports/:id/cancel` | Cancel `PENDING_REVIEW` report (`UC-RPT-004`, owner only) → `CANCELLED` with `cancelledAt`. |

---

## 6. Reviewer Endpoints (`UC-REV-001`..`006`)

All require `REVIEWER` (never `ADMINISTRATOR`) and enforce **Separation of Duties** (`403 SEPARATION_OF_DUTIES_VIOLATION` if caller is Reporter of the target Report/Ticket).

| Method & Path | Request Body / Rules |
| --- | --- |
| `GET /api/v1/reviewer/queue` | Paginated `PENDING_REVIEW` reports with latest AI status, version, and `isSelfReported` indicator. |
| `POST /api/v1/reviewer/reports/:id/confirm-existing` | `UC-REV-002`. Body: `{ "expectedVersion": 2, "targetTicketId": "...", "reportTitle": "...", "categoryId": "...", "severity": "HIGH", "departmentIds": ["..."] }`. Enforces two-level Separation of Duties (caller is neither Reporter of the pending Report nor a Confirmed Reporter of `targetTicketId`, `403 SEPARATION_OF_DUTIES_VIOLATION`), `expectedVersion == report.version` (`409 STALE_REPORT_VERSION`), Active target Ticket (`409 TICKET_IS_FINAL`), and active `categoryId` / `departmentIds` (`≥ 1`). **Does not overwrite** the target Ticket's existing `categoryId`, `severity`, `departments`, `title`, or `summary`; records verified values + AI `overrides` flags in `audit_logs` (`BR-AUD-005`), triggers `UC-AI-003` (isolated failure), and sends Email. |
| `POST /api/v1/reviewer/reports/:id/confirm-new` | `UC-REV-003`. Body: `{ "expectedVersion": 2, "title": "...", "summary": "...", "categoryId": "...", "severity": "HIGH", "departmentIds": ["..."], "reportTitle": "..." }`. Requires `≥ 1` active department and caller ≠ Reporter of the Report. Creates `CONFIRMED` Ticket + `CONFIRMED` Report + Activity + Audit (`overrides`) + Email. |
| `POST /api/v1/reviewer/reports/:id/reject` | `UC-REV-004`. Body: `{ "expectedVersion": 2, "reason": "..." }`. Mandatory `reason` (`422 REJECTION_REASON_REQUIRED`); caller ≠ Reporter of the Report. |
| `PATCH /api/v1/reviewer/reports/:id/correction` | `UC-REV-005`. Corrects fields/`reportTitle` on a `CONFIRMED` Report whose parent Ticket is **Active** (`409 TICKET_IS_FINAL` if `RESOLVED`). Enforces two-level Separation of Duties (caller is neither Reporter of that Report nor a Confirmed Reporter of the parent Ticket). Increments `report.version`, writes audit log, and triggers `UC-AI-003` (isolated failure). |
| `PUT /api/v1/reviewer/tickets/:ticketId/departments` | `UC-REV-006`. Body: `{ "departmentIds": ["..."] }`. Acquires `SELECT ... FOR UPDATE` on Ticket; Active Ticket only; caller is not a Confirmed Reporter of the Ticket; `≥ 1` active department; preserves completed flags on retained departments; triggers Auto-`RESOLVED` immediately from `IN_PROGRESS` or `WAITING_INFORMATION` if all remaining departments are complete (`BR-DEP-007`). |
| `POST /api/v1/reviewer/tickets/:ticketId/reevaluations/:reevalId/apply` | Reviewer applies or dismisses a pending `TicketAIReevaluation` (`BR-AI-015`). Acquires `SELECT ... FOR UPDATE` on Ticket; verifies Active Ticket (`409 TICKET_IS_FINAL`), Ticket-level Separation of Duties (`403 SEPARATION_OF_DUTIES_VIOLATION`), `status == 'COMPLETED'`, `isReviewed == false`, and **`isOutdated == false && ticketRevision == ticket.reevaluationRevision`** (returns `409 STALE_REEVALUATION` if superseded by a newer revision). If applying updates `departmentIds`, enforces the exact `UC-REV-006` rules (active departments ≥1, preserves completion on retained departments, evaluates `BR-DEP-007` Auto-`RESOLVED`). |

---

## 7. Department & Ticket Operation Endpoints (`UC-DEP-*`, `UC-TKT-*`)

All require `DEPARTMENT_STAFF` (for assigned Department) or `REVIEWER` where noted, and enforce **Separation of Duties** (`BR-ROLE-004`, `BR-ROLE-005`).

| Method & Path | Role | Behavior & Rules |
| --- | --- | --- |
| `GET /api/v1/department/tickets` | Dept Staff | `UC-DEP-001`. Active (and filterable Final) Tickets assigned to caller's single Department. |
| `POST /api/v1/tickets/:ticketId/start` | Assigned Dept Staff | `UC-TKT-001`. `CONFIRMED → IN_PROGRESS`. |
| `POST /api/v1/tickets/:ticketId/resume` | Assigned Dept Staff | `UC-TKT-003`. `WAITING_INFORMATION → IN_PROGRESS`. |
| `POST /api/v1/tickets/:ticketId/actions` | Assigned Dept Staff | `UC-DEP-002`. Records operational update + optional EXIF-stripped evidence images onto Public Activity Timeline. |
| `POST /api/v1/tickets/:ticketId/departments/complete` | Assigned Dept Staff | `UC-DEP-003`. Acquires `SELECT ... FOR UPDATE` on Ticket; Ticket must be `IN_PROGRESS`. Marks caller's Department `isCompleted = true` with optional `note`. Re-checks all assignments under the lock; if all assigned departments are complete, transitions Ticket to `RESOLVED` immediately (`UC-TKT-004`), appends a single `AUTO_RESOLVED` activity, commits, and dispatches `RESOLVED` Email once. |
| `GET /api/v1/department/analytics` | Dept Staff | `UC-DEP-004`. Scoped strictly to caller's single Department. |

---

## 8. Private Thread, Affected & Feedback Endpoints

> **Thread Participant Eligibility (`BR-THR-001`..`005`):** Active non-Admin user who is (a) a Confirmed Reporter of the Ticket, (b) **any active `REVIEWER`** (shared central pool), or (c) an assigned `DEPARTMENT_STAFF` member of the Ticket's Responsible Department(s). All other callers (including public visitors, `ADMINISTRATOR`, unrelated Reporters, unassigned Department Staff, and inactive users) receive `403 THREAD_ACCESS_DENIED`.
> **Thread Status Lifecycle:** Posting is allowed **only** in `WAITING_INFORMATION` (`409 THREAD_READ_ONLY` in all other states). `IN_PROGRESS` allows read-only access to history **only when messages already exist**. `CONFIRMED` and `RESOLVED` keep the Thread hidden/closed (`canView: false`, `canPost: false`).

| Method & Path | Auth / Role | Behavior & Rules |
| --- | --- | --- |
| `GET /api/v1/tickets/:ticketId/thread` | Authorized Thread Participant | Returns `{ "ticketStatus": "...", "canView": true, "canPost": true, "messages": [...] }` according to the status lifecycle above (`canView: true` in `WAITING_INFORMATION`, or in `IN_PROGRESS` when `messages.length > 0`; `canPost: true` only in `WAITING_INFORMATION`). Returns `403 THREAD_ACCESS_DENIED` to unauthorized callers. |
| `POST /api/v1/tickets/:ticketId/thread/request-info` | Any active `REVIEWER` or Assigned `DEPARTMENT_STAFF` (**Not** a Confirmed Reporter of Ticket) | `UC-THR-001` / `UC-TKT-002`. **Status-transition command only** — allowed strictly when Ticket is **`CONFIRMED` or `IN_PROGRESS`** (returns `409 TRANSITION_FORBIDDEN` if already `WAITING_INFORMATION` or `RESOLVED`). Posts the opening question into `thread_messages`, transitions Ticket → `WAITING_INFORMATION`, appends ONE public `STATUS_CHANGED` activity (without thread text), writes Audit Log, and sends ONE `WAITING_INFORMATION` Major Event Email to Ticket Reporters. |
| `POST /api/v1/tickets/:ticketId/thread/messages` | Authorized Thread Participant | `UC-THR-002`. Allowed **only when Ticket status is `WAITING_INFORMATION`** (returns `409 THREAD_READ_ONLY` otherwise). Used for all follow-up messages while in `WAITING_INFORMATION` — including Reporter replies and any additional Reviewer/Department follow-up questions. Appends private message + Audit Log; records `authorRole = "REPORTER"` if caller has a Confirmed Report on the Ticket, else `"REVIEWER"` or `"DEPARTMENT_STAFF"`; does **not** emit duplicate `STATUS_CHANGED` events or duplicate `WAITING_INFORMATION` emails. |
| `PUT /api/v1/tickets/:ticketId/affected` | Auth non-Admin | `UC-AFF-001`. Marks caller affected on an **Active Ticket** (idempotent). Returns `409 TICKET_IS_FINAL` on Final Tickets. |
| `DELETE /api/v1/tickets/:ticketId/affected` | Auth non-Admin | `UC-AFF-001`. Unmarks caller affected while Ticket is Active. |
| `PUT /api/v1/tickets/:ticketId/feedback` | Confirmed Reporter of Ticket | `UC-FBK-001` / `UC-FBK-002`. Upserts caller's multi-dimensional feedback (`1..5` per dimension) on a **`RESOLVED` Ticket only**. Recalculates aggregates. |

---

## 9. Administrator Endpoints (`UC-ADM-001`..`005`)

All require exclusive `ADMINISTRATOR` role (`BR-ROLE-002`).

| Method & Path | Behavior |
| --- | --- |
| `GET /api/v1/admin/users`, `PATCH /api/v1/admin/users/:id` | Manage account status, roles, and single department membership. Enforces `BR-ROLE-002` (Exclusive Admin) and `BR-ROLE-003` (max 1 Department, only with `DEPARTMENT_STAFF`). |
| `GET / POST / PATCH /api/v1/admin/categories` | Create, update, and soft-disable (`isActive: false`) Problem Categories. |
| `GET / POST / PATCH /api/v1/admin/departments` | Create, update, soft-disable Departments and manage responsibility scopes. |
| `GET / POST / PATCH /api/v1/admin/locations` | Create, update, soft-disable KU Bangkhen Campus Locations. |
| `GET /api/v1/admin/analytics` | `UC-ADM-005`. System-wide KPIs (distinct Tickets, Reports, Affected Users), breakdowns, time metrics (`Review`, `Resolution`, `Total Lead`, `Aging`), satisfaction, and Department Performance table. |
| `GET /api/v1/admin/audit-logs` | Paginated read-only audit log explorer for compliance verification (`BR-AUD-008`..`009`). |

### Phase 1 admin responses

* Users list uses the pagination envelope and supports `q` (username, real name or email), `role`, and `isActive`. Rows and successful updates use the private profile shape. PATCH accepts any combination of `roles`, `departmentId`, and `isActive`. An explicit `null` clears the department. The last active administrator is protected by `409 LAST_ACTIVE_ADMIN`.
* The department list uses the pagination envelope with `id`, `name`, `responsibilityScope`, and `isActive` per item. Phase 1 serves it for user assignments.
* Audit rows include `id`, `entityType`, `entityId`, `action`, `actorType`, `actorUserId`, `actorRoles`, `departmentId`, `details`, and `createdAt`. Filters are `entityType`, `action`, and `actorUserId`. Lists default to page 1 and page size 25, with 25, 50, and 100 supported.
