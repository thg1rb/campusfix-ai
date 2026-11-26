# KU Spot — Testing Strategy & Verification Standards

This document defines the verification commands, test pyramid, mandatory domain invariant test matrix, and AI evaluation standards for **KU Spot**.

---

## 1. Standard Verification Commands

Always run the repository-wide check before finishing code changes:

```sh
make check          # Validates Compose configs + Web lint/typecheck/build + Go fmt/vet/test/build + AI lock/import
make smoke          # Full running stack HTTP + dependency readiness verification
make smoke-outage   # Stops AI container, verifies degraded 503 readiness and automatic 200 recovery
```

### Per-Service Test Commands

| Service | Command | Scope |
| --- | --- | --- |
| **Web (`apps/web`)** | `cd apps/web && bun test` | Pure domain unit tests (`tests/*.test.ts`), component logic tests |
| **Web E2E** | `cd apps/web && bunx playwright test` *(when E2E suite added)* | Full browser journeys across Public, Reporter, Reviewer, Department, Admin |
| **API (`apps/api`)** | `cd apps/api && go test -race ./...` | Domain state machines, authorization, HTTP handlers, PostgreSQL integration tests |
| **AI (`apps/ai`)** | `cd apps/ai && uv run --locked pytest` | Schema validation, provider mocking, similarity scoring, fallback errors |

---

## 2. Test Pyramid by Service

1. **`apps/api` (Go):**
   - **Domain Unit Tests (`internal/modules/*/domain/`):** Pure Go table-driven tests with zero DB/network dependencies covering all state transitions, Separation of Duties, Exclusive Admin, multi-department auto-resolve, and record numbering.
   - **Integration Tests (`adapters/outbound/postgres/` & HTTP handlers):** Run against a disposable PostgreSQL instance migrated with Goose (`make migrate`), verifying SQL constraints, optimistic version conflicts, transaction atomicity, and public DTO redaction.
2. **`apps/ai` (Python):**
   - **Unit & Contract Tests (`apps/ai/tests/`):** FastAPI `TestClient` + mocked JEV provider verifying request/response schemas against [contracts/ai-gateway.md](../contracts/ai-gateway.md), invalid model output rejection, and timeout/error handling.
   - **Offline Evaluation (`apps/ai/evaluation/`):** Golden benchmark suite measuring AI quality metrics (see Section 4).
3. **`apps/web` (Next.js / TypeScript):**
   - **Unit Tests (`apps/web/tests/`):** Domain helpers, formatting, numbering, pagination, and state guards.
   - **E2E Tests (Playwright):** Critical end-to-end user journeys, responsive layouts (including 5-card desktop grid), and error/fallback banners.

---

## 3. Mandatory Domain Invariant Test Matrix

Any PR implementing or modifying a module MUST include automated tests covering the corresponding rows below:

| Domain Area | Rule IDs | Required Test Cases |
| --- | --- | --- |
| **Auth Provider Boundary** | `BR-AUTH-001`, `BR-AUTH-004` | Google OAuth 2.0 callback accepts verified `@ku.th` (`hosted_domain == "ku.th"`) and rejects non-`@ku.th` domains; `identity` use cases run cleanly against a mock `AuthProvider` implementation proving provider pluggability. |
| **Role & Department Constraints** | `BR-ROLE-002`, `BR-ROLE-003`, `BR-ROLE-007` | Reject assigning `ADMINISTRATOR` + any other role; reject assigning a department to `ADMINISTRATOR`; reject `DEPARTMENT_STAFF` with 0 or >1 departments; block `ADMINISTRATOR` from operational Ticket/Report endpoints (`403`). |
| **Separation of Duties** | `BR-ROLE-004`, `BR-ROLE-005`, `BR-DEP-009` | Reviewer cannot confirm/reject own Report (`403`); **two-level Ticket SoD:** Reviewer cannot `confirm-existing` someone else's Report into a Ticket where Reviewer already has a Confirmed Report (`403`) and cannot `correctReport` someone else's Confirmed Report on a Ticket where Reviewer has a Confirmed Report (`403`); Reviewer cannot edit departments/request info on own Ticket (`403`); Department Staff cannot start/resume/record action/complete on Ticket containing own Confirmed Report (`403`). |
| **Report Lifecycle & Optimistic Lock** | `BR-RLC-001`..`010`, `BR-RPT-008`..`012`, `BR-AUD-005` | Editing `PENDING_REVIEW` increments `version` and sets prior AI runs `is_outdated = true`; Reviewer confirm/reject with stale `expectedVersion` returns `409 STALE_REPORT_VERSION`; cannot edit/cancel after `CONFIRMED`/`REJECTED`; `REJECTED` requires non-empty reason; `confirm-existing` validates and audits Reviewer-verified `categoryId`/`severity`/`departmentIds` + `overrides` without overwriting target Ticket fields; `UC-REV-005` (`correctReport`) rejects Reports whose parent Ticket is `RESOLVED` (`409 TICKET_IS_FINAL`). |
| **Media & EXIF Stripping** | `BR-RPT-003`..`005` | Reject 0 images or >5 images on submit; reject >10 MB; reject non-PNG/JPEG (e.g., video/PDF/spoofed extension); assert uploaded JPEG with GPS/camera EXIF tags has **zero EXIF metadata** in stored/served output. |
| **30-Day Retention Purge** | `BR-RET-001`..`004` | Purge job deletes `DRAFT` ≥30d from `created_at` and `CANCELLED` ≥30d from `cancelled_at`; preserves `DRAFT`/`CANCELLED` <30d; never deletes `CONFIRMED` or `REJECTED`. |
| **Ticket State Machine** | `BR-STA-001`..`011`, `BR-TKT-005`..`007` | Verify all allowed transitions (`CONFIRMED → IN_PROGRESS`, `CONFIRMED/IN_PROGRESS → WAITING_INFORMATION`, `WAITING_INFORMATION → IN_PROGRESS`, System `IN_PROGRESS → RESOLVED`, System `WAITING_INFORMATION → RESOLVED` via `BR-DEP-007`); reject direct manual transition to `RESOLVED`; assert Final Tickets (`RESOLVED`) reject new Reports, `Mark Affected`, department changes, and reopen attempts. |
| **Multi-Department Resolution** | `BR-DEP-001`..`007` | Ticket with 2 departments stays `IN_PROGRESS` after 1st completes; auto-resolves immediately to `RESOLVED` when 2nd completes; adding a 3rd department before completion preserves completed state of existing departments and waits for the 3rd; removing the only incomplete department triggers Auto-`RESOLVED` immediately from both **`IN_PROGRESS` and `WAITING_INFORMATION`** (and in pure domain helpers for any active state). |
| **AI Decision Support & Fallback** | `BR-GEN-008`, `BR-AI-002`, `BR-AI-013`, `BR-AI-015`..`020` | Submit succeeds and enters `PENDING_REVIEW` with `ai_analysis_runs(status='FAILED')` when triage AI fails/times out; AI shortlist contains **only Active Tickets**; adding/correcting a Confirmed Report creates unreviewed `ticket_ai_reevaluations` without mutating live Ticket fields; **`UC-AI-003` re-evaluation failure** records `ticket_ai_reevaluations(status='FAILED')` while keeping the `CONFIRMED` Report and Ticket data intact; high report count alone does not auto-upgrade Severity. |
| **Privacy & Thread Isolation** | `BR-AUTH-008`..`010`, `BR-THR-001`..`005`, `BR-PUB-010` | Public Feed/Ticket/Report/Profile JSON never contains `email`, `realName`, `providerSubjectId`, `avatarUrl`, `DRAFT`/`PENDING_REVIEW`/`REJECTED`/`CANCELLED` reports, `Ticket Candidate`, or `threadMessages`; changing Username updates historical Public Reports; Thread allows any active `REVIEWER`, assigned `DEPARTMENT_STAFF`, and Confirmed Reporters of the Ticket, while blocking public, `ADMINISTRATOR`, outsiders, unassigned staff, and inactive users (`403 THREAD_ACCESS_DENIED`); Thread allows posting **only in `WAITING_INFORMATION`** (`409 THREAD_READ_ONLY` otherwise), read-only history in `IN_PROGRESS` when messages exist, and hidden/closed in `CONFIRMED` and `RESOLVED`. |
| **Affected, Feedback & Email** | `BR-AFF-001`..`007`, `BR-FBK-001`..`008`, `BR-NOT-003`..`005` | Affected toggle works only on Active Tickets and is unique per user; Feedback works only on `RESOLVED` Tickets for Confirmed Reporters of that Ticket and supports editing; Major Event Emails dispatch **only to Ticket Reporters** and never to Affected-only users. |

---

## 4. AI Evaluation Standards (`apps/ai/evaluation/`)

Before releasing prompt, model, or similarity scoring changes in `apps/ai`, benchmark against the offline golden dataset in `apps/ai/evaluation/` and track:

* **Category Classification:** Macro/Weighted Precision, Recall, and F1-score per category.
* **Duplicate Detection:** Precision, Recall, and Top-1 / Top-3 match accuracy against Active Tickets (ensuring zero false grouping across distinct buildings/incidents).
* **Severity Assessment:** Accuracy and confusion matrix across `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` (especially zero false negatives on `CRITICAL` safety hazards).
* **Department Recommendation:** Recall@K for single- and multi-department incidents.
* **Latency & Reliability:** p50 / p95 inference latency under the `15s` upstream budget and valid JSON schema compliance rate (`100%` after parser/validation layer).
