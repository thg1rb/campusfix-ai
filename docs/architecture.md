# KU Spot — System Architecture & Technical Specification

This document defines the service topology, Go modular monolith boundaries, authentication/session strategy, media/EXIF pipeline, AI triage integration, background jobs, and error handling conventions for **KU Spot**.

---

## 1. System Topology

```mermaid
flowchart LR
  Browser["Web Browser (Mobile / Desktop)"] --> Web["apps/web (Next.js 16 / React 19)"]
  Web -->|HTTP JSON /api/v1| API["apps/api (Go 1.26 / Fiber v3)"]
  API -->|SQL via GORM + Goose| DB[("PostgreSQL 18.7")]
  API -->|HTTP JSON /v1/* bounded timeout| AI["apps/ai (FastAPI / Python 3.14)"]
  AI -->|JEV Provider Boundary| LLM["External Multimodal LLM / Vision API"]
  API -->|Auth Provider Boundary| Auth["Google OAuth 2.0 (@ku.th) / Future Providers"]
  API -->|Storage Adapter| Storage["Object Storage (EXIF-stripped Images)"]
  API -->|Email Adapter| Mail["SMTP / Email Delivery Provider"]
```

### Service Responsibilities

| Service | Owns | Must Never Do |
| --- | --- | --- |
| **`apps/web`** | UI rendering, public/authenticated routes, interactive Leaflet campus map, client validation, `/api/health` readiness proxy. | Connect directly to PostgreSQL or AI Gateway; enforce security/Separation-of-Duties client-side only; expose PII on public pages. |
| **`apps/api`** | System of Record, authentication & session management, RBAC & Separation of Duties, state machines, EXIF stripping, media storage orchestration, candidate shortlisting for AI, audit logging, retention jobs, email dispatch, analytics queries. | Run `gorm.AutoMigrate`; allow AI failure to fail report submission; expose private fields in public DTOs. |
| **`apps/ai`** | Stateless multimodal triage (classification, severity, department recommendation, duplicate similarity against supplied Active Tickets, Report/Ticket title & summary generation) and Ticket re-evaluation. | Connect directly to PostgreSQL; mutate operational Tickets/Reports; auto-confirm/reject/resolve; auto-upgrade severity purely from report count. |

---

## 2. Go API Modular Monolith (`apps/api`)

Business capabilities live under `apps/api/internal/modules/<module-name>/` with clean hexagonal layers:

```text
internal/modules/<module-name>/
├── domain/                   # Pure Go: entities, value objects, state machines, domain errors (0 framework imports)
├── application/              # Use cases, transaction coordination, consumer-defined repository/port interfaces
└── adapters/
    ├── inbound/http/         # Fiber v3 handlers, request DTO validation, domain-error -> HTTP mapping
    └── outbound/postgres/    # GORM persistence models & domain mappers
```

### Canonical Module Map

| Module | Owned Responsibilities | Key Tables |
| --- | --- | --- |
| `identity` | Auth callback, session issuance/validation, user provisioning, Username updates (`UC-AUTH-001`, `UC-USR-001`), Admin user/role management (`UC-ADM-001`). | `users`, `user_roles` |
| `masterdata` | Categories, Departments, Campus Locations CRUD & soft-disable (`UC-ADM-002`..`004`). | `categories`, `departments`, `campus_locations` |
| `media` | Upload validation (`.png`/`.jpg`/`.jpeg`, ≤10 MB, 1–5/report), EXIF stripping, object storage adapter, signed/public serving, purge cleanup. | `report_images`, `activity_evidence_images` |
| `reports` | Draft save/resume, Report submission, Pending edit (`version++`), Cancel, AI analysis orchestration & storage (`UC-RPT-001`..`005`, `UC-AI-001`..`002`). | `reports`, `ai_analysis_runs`, `ticket_candidates` |
| `review` | Incoming queue, optimistic-lock Confirm (Existing/New Ticket), Reject with reason, Confirmed Report correction, Ticket AI re-evaluation approval (`UC-REV-001`..`005`, `UC-AI-003`). | Coordinates `reports` + `tickets` |
| `tickets` | Public Feed/Search/Filter/Map, Ticket Detail, Status transitions (`Start`, `Resume`), Multi-Department management & completion, Auto-`RESOLVED`, Public Activity Timeline, `Mark Affected` (`UC-PUB-*`, `UC-MAP-001`, `UC-DEP-001`..`003`, `UC-TKT-001`..`004`, `UC-REV-006`, `UC-AFF-001`). | `tickets`, `ticket_department_assignments`, `ticket_ai_reevaluations`, `ticket_affected_users`, `public_activity_events` |
| `threads` | Private Additional Information Thread (`UC-THR-001`, `UC-THR-002`) with strict participant authorization. | `thread_messages` |
| `feedback` | Multi-dimensional Feedback submission, editing, and aggregate calculation (`UC-FBK-001`, `UC-FBK-002`). | `feedback_submissions` |
| `analytics` | System-wide and Department-scoped KPI & time-metric read models (`UC-ADM-005`, `UC-DEP-004`). | Read-only SQL queries across core tables |
| `audit` | Append-only audit log writer & query port (`BR-AUD-003`..`009`). | `audit_logs` |
| `notifications` | Major Event Email formatting, recipient resolution (Reporters only), delivery log (`UC-NOT-001`). | `email_notification_logs` |

### Cross-Module Interaction Rules

* Wire all module constructors explicitly in `internal/bootstrap/`.
* Modules communicate across boundaries via narrow Go interfaces (application ports) or shared transaction helpers — **never** by importing another module's `adapters/outbound/postgres/` GORM structs.
* Multi-entity mutations (e.g., Confirm Report → Create/Attach Ticket → Append Public Activity → Append Audit Log) execute inside a single PostgreSQL transaction.

---

## 3. Authentication, Sessions & Authorization

* **Pluggable Provider Boundary (`BR-AUTH-001`, `BR-AUTH-004`):** Define an `AuthProvider` interface in `internal/adapters/auth/` returning normalized external identity claims (`provider`, `provider_subject_id`, `email`, `email_verified`, `hosted_domain`, `real_name`, `avatar_url`).
  * **Initial MVP Provider:** **Google OAuth 2.0** restricted to `@ku.th` (`hosted_domain == "ku.th"`).
  * **Future Extensibility:** Designed behind the `AuthProvider` port so additional providers (such as KU-ALL SSO or another OIDC/SAML provider) can be plugged in with zero changes to `domain/` or business modules.
* **Session Transport:** HTTP-only, `Secure` (in production), `SameSite=Lax` signed session cookie managed by `apps/api` (proxied or same-site with `apps/web`). Public read routes ignore missing cookies; write/private routes require a valid active session.
* **Defense-in-Depth RBAC & Separation of Duties:**
  1. HTTP middleware enforces authentication and coarse role membership.
  2. Application/Domain layer enforces resource-level invariants:
     * `ADMINISTRATOR` is exclusive (`len(roles) == 1`, `department_id == nil`) and blocked from operational actions (`BR-ROLE-002`, `BR-ROLE-007`).
     * `DEPARTMENT_STAFF` has exactly one `department_id` and may act only on Tickets assigned to that department (`BR-ROLE-003`).
     * **Separation of Duties (`BR-ROLE-004`, `BR-ROLE-005`):** Before any Reviewer or Department operational action, verify `actor.id != report.reporter_id` (for Reports) and `actor.id NOT IN (SELECT reporter_id FROM reports WHERE ticket_id = :ticketId AND status = 'CONFIRMED')` (for Tickets).

---

## 4. Media Upload, Storage & EXIF Stripping

* **Constraints (`BR-RPT-003`..`005`):** `1–5` images required at submission; each file `≤ 10 MB`; accept only verified PNG/JPEG magic bytes (`.png`, `.jpg`, `.jpeg`). No video files in MVP.
* **EXIF Stripping:** `apps/api` decodes and re-encodes (or strips metadata segments from) every uploaded JPEG/PNG image **before** persisting to object storage so GPS, camera model, timestamps, and author metadata never reach storage or public responses.
* **Storage Adapter (`internal/adapters/storage/`):** Abstract behind an `ObjectStore` port (local disk volume for dev/compose, S3-compatible / MinIO for staging/production).
* **Purge Cleanup:** When the 30-day retention job purges `DRAFT` or `CANCELLED` Reports (`BR-RET-001`..`002`), delete orphaned media objects asynchronously after DB deletion commits.

---

## 5. AI Triage & Re-evaluation Pipeline (`apps/api` ↔ `apps/ai`)

1. **Candidate Shortlisting (in `apps/api`):** Before calling `apps/ai`, the Go API queries PostgreSQL for **Active Tickets only** (`status IN ('CONFIRMED', 'IN_PROGRESS', 'WAITING_INFORMATION')`), shortlisted by geospatial proximity (bounding box / Haversine within KU Bangkhen) and recency (e.g., top 20–50 Active Tickets).
2. **Bounded Timeout & Non-Blocking Submit (`BR-GEN-008`, `BR-AI-020`):**
   * `POST /reports/:id/submit` persists `PENDING_REVIEW` first in PostgreSQL, then triggers AI analysis (asynchronously via worker/goroutine with bounded context timeout, e.g., `15–25s`, or fast-fail retryable job).
   * If `apps/ai` times out, returns `5xx`, or is unreachable, `apps/api` records `ai_analysis_runs(status = 'FAILED', error_message = ...)` and writes an audit entry. The Report stays `PENDING_REVIEW` and Reviewers can triage manually immediately.
3. **Edit Re-analysis (`UC-AI-002`):** Editing a `PENDING_REVIEW` Report marks all prior `ai_analysis_runs` for that Report `is_outdated = true`, increments `report.version`, and triggers a fresh AI run tagged with the new `report_version`.
4. **Ticket Re-evaluation (`UC-AI-003`):** Attaching a Confirmed Report (`UC-REV-002`) or correcting a Confirmed Report (`UC-REV-005`) commits the Report/Ticket update first, then triggers `POST /v1/tickets/reevaluate` on `apps/ai` with all Confirmed Reports in that Ticket. On success, the result is stored in `ticket_ai_reevaluations(status = 'COMPLETED', is_reviewed = false)` and **never** overwrites final Ticket fields until a Reviewer explicitly applies it (`BR-AI-015`). On timeout/error/outage, `apps/api` records `ticket_ai_reevaluations(status = 'FAILED', error_message = ...)` and writes an audit entry while **preserving** the already-confirmed Report and existing Ticket data intact (never rolling back confirmation or correction).
5. **Duplicate Similarity Guidance (from Overview + Freeze 1):**
   * Primary signals (`BR-AI-001`): Multimodal image similarity, text/description semantic similarity, and geographic proximity.
   * Auxiliary signals (`BR-AI-003`): Category overlap, recency, and existing linked Reports.
   * Reference baseline weighting from Project Overview (tunable in `apps/ai/src/ku_spot_ai/scoring/` and benchmarked via `apps/ai/evaluation/`): semantic/multimodal content + spatial proximity + category + time proximity.

---

## 6. Background Jobs & Notifications

* **30-Day Retention Purge (`BR-RET-001`..`003`):** Scheduled daily job in `apps/api` deletes:
  * `reports` where `status = 'DRAFT' AND created_at <= NOW() - INTERVAL '30 days'`
  * `reports` where `status = 'CANCELLED' AND cancelled_at <= NOW() - INTERVAL '30 days'`
  * Writes a `RETENTION` audit log summary and cleans up associated storage objects.
* **Major Event Email Dispatch (`UC-NOT-001`, `BR-NOT-001`..`005`):**
  * Triggered on `CONFIRMED_NEW_TICKET`, `CONFIRMED_EXISTING_TICKET`, `WAITING_INFORMATION`, and `RESOLVED`.
  * Recipients are resolved strictly from distinct `reporter_id`s with a `CONFIRMED` Report on the Ticket (never Affected-only users).
  * Subject prefixed with `[KU Spot] `. Logged in `email_notification_logs` with `SENT` / `FAILED` status; email delivery failures must never roll back already-committed operational transitions.

---

## 7. HTTP Error Envelope & Status Code Convention

All `/api/v1/*` business API error responses use one consistent JSON structure (operational probes `/healthz` and `/readyz` use their dedicated probe payloads documented in [contracts/api-v1.md](../contracts/api-v1.md#2-health--readiness-implemented-in-bootstrap)):

```json
{
  "error": {
    "code": "STALE_REPORT_VERSION",
    "message": "Report was updated by the reporter while under review. Reload the latest version before confirming or rejecting.",
    "details": {
      "expectedVersion": 1,
      "currentVersion": 2
    },
    "requestId": "req_01J..."
  }
}
```

| HTTP Status | Standard Error Codes (`/api/v1/*`) | Typical Trigger |
| --- | --- | --- |
| `400` | `INVALID_REQUEST`, `INVALID_MEDIA_FORMAT`, `MEDIA_TOO_LARGE` | Malformed JSON, unsupported file type, >10 MB image |
| `401` | `UNAUTHENTICATED` | Missing or expired session on write/private endpoint |
| `403` | `FORBIDDEN`, `SEPARATION_OF_DUTIES_VIOLATION`, `ADMIN_NON_OPERATIONAL`, `THREAD_ACCESS_DENIED` | Role check failed, self-review/self-operate attempt, Admin trying operational action, non-participant accessing Thread |
| `404` | `NOT_FOUND` | Unknown entity ID or unauthorized private record hidden as not found |
| `409` | `STALE_REPORT_VERSION`, `TRANSITION_FORBIDDEN`, `TICKET_IS_FINAL`, `THREAD_READ_ONLY`, `USERNAME_TAKEN`, `ALREADY_COMPLETED` | Optimistic lock mismatch (`BR-RPT-012`), invalid state transition, mutating Final (`RESOLVED`) Ticket, posting to Thread outside `WAITING_INFORMATION`, duplicate username |
| `422` | `VALIDATION_ERROR`, `REJECTION_REASON_REQUIRED`, `DEPARTMENT_REQUIRED`, `EXCLUSIVE_ADMIN_CONFLICT`, `SINGLE_DEPARTMENT_LIMIT` | Missing mandatory domain fields or role/department constraint violation |
| `503` | `SERVICE_UNAVAILABLE` | Unexpected downstream outage on `/api/v1/*` business routes (not used by `/readyz`, which returns `{ "status": "unavailable", "checks": { ... } }`) |

---

## 8. Key Libraries & Dependencies Registry

> **Maintenance Rule (Mandatory):** Whenever a new library or package is installed in **any service** (`apps/web`, `apps/api`, or `apps/ai`), update the corresponding table below in the same PR so AI agents and contributors always have an accurate architectural inventory.

### 8.1 Web (`apps/web` — `package.json`)

| Library | Version | Purpose |
| --- | --- | --- |
| `next` | `16.4.6` | App Router framework & server route handlers |
| `react` / `react-dom` | `19.3.1` | UI component runtime |
| `tailwindcss` / `@tailwindcss/turbopack` | `4.3.5` | CSS utility framework (`@theme` tokens) |
| `typescript` | `5.9.3` | Static type checking |
| `shadcn` / `radix-ui` / `class-variance-authority` / `cn` / `tw-animate-css` | `^4.23.0` / `^1.8.1` / `^0.7.1` / `^0.5.2` / `^1.4.0` | Accessible UI component primitives and variant styling |
| `lucide-react` | `^1.78.0` | Line iconography |
| `leaflet` / `react-leaflet` | `^1.9.4` / `^5.0.0` | KU Bangkhen interactive campus map and pin picker |
| `recharts` | `^3.8.0` | Flat operational/analytics charts |
| `sonner` | `^2.0.8` | Toast notifications |
| `next-themes` | `^0.4.6` | Theme provider support (light-mode first) |
| `vitest` / `fake-indexeddb` | `^5.1.1` / `^6.2.8` | Unit testing and prototype IndexedDB test doubles |
| `eslint` / `eslint-config-next` | `^9` / `16.4.6` | Static linting |

### 8.2 Go API (`apps/api` — `go.mod`)

| Library | Version | Purpose |
| --- | --- | --- |
| `github.com/gofiber/fiber/v3` | `v3.7.0` | HTTP router, server, and middleware |
| `gorm.io/gorm` | `v1.31.2` | Persistence ORM inside `adapters/outbound/postgres/` only |
| `gorm.io/driver/postgres` | `v1.6.3` | PostgreSQL driver for GORM (`pgx/v5`) |
| `github.com/pressly/goose/v3` *(CLI via `Makefile`)* | `v3.30.1` | Explicit SQL schema migrations (`make migration-create`, `make migrate`) |

### 8.3 AI Gateway (`apps/ai` — `pyproject.toml`)

| Library | Version | Purpose |
| --- | --- | --- |
| `fastapi` | `0.165.0` | HTTP API framework and Pydantic schema validation |
| `uvicorn` | `0.54.0` | ASGI server managing gateway lifecycle |
| `hatchling` *(build backend)* | `1.33.0` | Python src-layout packaging (`ku_spot_ai`) |
