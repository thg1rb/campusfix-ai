# AGENTS.md — KU Spot

Repository-wide rules and context map for AI coding agents working in `ku-spot`. Keep changes small, verifiable, contract-first, and strictly faithful to Requirement Freeze 1.

---

## 1. Project Overview & Sources of Truth

**KU Spot** is an AI-assisted physical-issue reporting, triage, multi-department resolution tracking, and public transparency platform for **Kasetsart University (Bangkhen Campus)**.

Read only the relevant source-of-truth docs before implementing a slice:

| Topic | Source of Truth |
| --- | --- |
| Business overview & MVP scope | `docs/brd.md` |
| Atomic business rules (`BR-*`) & RBAC matrix | `docs/business-rules.md` |
| Behavioral flows & acceptance flows (`UC-*`) | `docs/use-cases.md` |
| System architecture, auth, storage, AI, errors | `docs/architecture.md` |
| Enums, record numbers, DB schema, state machines | `docs/data-model.md` |
| Cross-service contracts (`Web ↔ API`, `API ↔ AI`) | `contracts/api-v1.md`, `contracts/ai-triage.v1.yaml`, `contracts/ai-gateway.md` |
| UI direction, Tailwind v4 tokens, anti-slop rules | `docs/design-system.md` |
| Current status, prototype gaps, roadmap | `docs/status.md` |
| Testing strategy & mandatory domain test cases | `docs/testing.md` |
| Architectural decisions (ADRs) | `docs/decisions/` (start with `0001-bootstrap.md`) |
| Service-specific agent rules | `apps/web/AGENTS.md`, `apps/api/AGENTS.md`, `apps/ai/AGENTS.md` |

**Explicitly Out of MVP (do not build unless scope changes):** Video upload/analysis, Voice-to-Text, LINE OA/LIFF, AI Chat Assistant, Detailed Heatmap, Predictive Maintenance, `recurrence_of` links, SLA/Escalation, Individual Staff Assignment, Transfer Workflows, Internal Notes, General Public Comments, Ticket Reopen, `CANNOT_RESOLVE` / `CLOSED` states, and Multi-campus/Multi-tenant support.

---

## 2. Non-Negotiable Domain Invariants

Never violate these rules (see `docs/business-rules.md` for full IDs):

1. **`Report` vs. `Ticket` separation (`BR-GEN-004`..`006`):** A `Report` is one user's submission; a `Ticket` is one verified campus incident (`Ticket 1 ── 1..* Confirmed Report`). Deduplication groups Reports into a Ticket — never deletes or overwrites original Reports.
2. **Human-in-the-loop AI & fallback (`BR-GEN-007`..`008`, `BR-AI-016`..`020`):** AI is strictly Decision Support. AI must **never** confirm, reject, resolve, delete, hide, or mutate final operational Ticket data. AI errors/timeouts/outages must **never** block Report submission or manual Reviewer work.
3. **Roles & Separation of Duties (`BR-ROLE-001`..`007`):**
   - 4 roles: `REPORTER`, `REVIEWER`, `DEPARTMENT_STAFF`, `ADMINISTRATOR`.
   - `ADMINISTRATOR` is **exclusive** (cannot combine with any other role, cannot belong to a department, cannot operate on tickets).
   - A user belongs to **at most 1 Department** (`DEPARTMENT_STAFF` only).
   - **Separation of Duties:** A user who is a Reporter of a Report or Ticket must **never** review, confirm, reject, manage departments, or perform Department operational actions on that same Report/Ticket.
4. **Report lifecycle & optimistic locking (`BR-RLC-001`..`010`, `BR-RPT-008`..`012`):**
   - States: `DRAFT`, `PENDING_REVIEW`, `CONFIRMED`, `REJECTED`, `CANCELLED`.
   - Editing a `PENDING_REVIEW` report increments `version`, marks prior AI output outdated, and triggers AI re-analysis.
   - Reviewers may confirm/reject **only against the latest `version`**; stale review actions must fail safely with `409 STALE_REPORT_VERSION`.
   - Purge `DRAFT` 30 days after `created_at` and `CANCELLED` 30 days after `cancelled_at` (`BR-RET-001`..`002`).
5. **Ticket lifecycle (`BR-TKT-001`..`013`, `BR-STA-001`..`011`):**
   - **Active:** `CONFIRMED`, `IN_PROGRESS`, `WAITING_INFORMATION`.
   - **Final:** `RESOLVED` only (immutable; every Ticket terminates at `RESOLVED`; no `CANNOT_RESOLVE`, no reopen, no new reports, no new `Mark Affected`, no department edits).
   - Unpublished `Ticket Candidate` created on AI `NO_MATCH` is never public and has no operational status until Reviewer confirms.
6. **Multi-Department resolution (`BR-DEP-001`..`007`):** Multiple departments may own a Ticket with **no Primary Department** and **no Individual Staff Assignment**. Completion is tracked per department; once all assigned departments are complete (including when removing an incomplete department leaves all remaining departments complete), the system **auto-transitions the Ticket to `RESOLVED` immediately**.
7. **Authentication, Visibility, Privacy & EXIF (`BR-AUTH-001`..`010`, `BR-THR-001`..`006`):**
   - MVP authentication uses **Google OAuth 2.0 (`@ku.th`)** behind a **pluggable Auth Provider boundary** so additional providers (e.g., KU-ALL SSO) can be added without changing domain code.
   - Public Read requires no login; all write/interactive actions require authentication.
   - Public identity is a unique, mutable `Username` (reflected retroactively on old reports). Never expose real name, email, student ID, or academic department publicly.
   - Strip all **EXIF metadata** from uploaded images (1–5 images, ≤10 MB, `.png`/`.jpg`/`.jpeg`) before storage/serving.
   - Additional Information Thread is **strictly private** to active `REVIEWER`s, assigned `DEPARTMENT_STAFF`, and Reporters with a Confirmed Report in that Ticket (posting only in `WAITING_INFORMATION`; read-only history in `IN_PROGRESS` when messages exist) — never exposed on Public Feed or Public Activity Timeline.
8. **Metrics & Notifications (`BR-AI-013`, `BR-AFF-006`..`007`, `BR-NOT-001`..`005`, `BR-ANL-001`):**
   - Report count alone must **never** auto-upgrade Severity (`CRITICAL`/`HIGH`/`MEDIUM`/`LOW`).
   - Keep `Ticket Count`, `Report Count`, and `Affected User Count` strictly distinct.
   - Send Major Event Emails **only to Reporters of the Ticket** (never to Affected-only users).

---

## 3. Toolchain & Version Discipline

Verify APIs against installed packages/docs rather than legacy training data (see `docs/decisions/0001-bootstrap.md`):

* **Web (`apps/web`):** Node 24.22, Bun 1.4, Next.js 16.4, React 19.3, TypeScript 5.9, Tailwind CSS 4.3
* **API (`apps/api`):** Go 1.26, Fiber v3.7, GORM 1.31, Goose CLI 3.30
* **AI (`apps/ai`):** Python 3.14, uv 0.13, FastAPI 0.165, Uvicorn 0.54
* **Infrastructure:** PostgreSQL 18.7, Docker Compose with Watch

---

## 4. Service Boundaries & Contract Discipline

* **Contract-first:** Update `contracts/api-v1.md` or `contracts/ai-gateway.md` before coding cross-service changes.
* **`apps/api`:** Modular monolith under `internal/modules/<module>/` (`domain/`, `application/`, `adapters/inbound/http/`, `adapters/outbound/postgres/`). Keep `domain/` free of Fiber/GORM/SDK imports. All schema changes use Goose SQL migrations (`make migration-create`, `make migrate`); **never** use `gorm.AutoMigrate`. Read `apps/api/AGENTS.md`.
* **`apps/web`:** App Router in `src/app/`, features in `src/features/`, UI primitives in `src/components/ui/`. Follow `docs/design-system.md`. Read `apps/web/AGENTS.md`.
* **`apps/ai`:** Runtime package in `src/ku_spot_ai/` managed strictly with `uv`. Keep external model calls behind provider boundaries; keep evaluation datasets/scripts in `apps/ai/evaluation/`. Read `apps/ai/AGENTS.md`.

---

## 5. Git Workflow & Definition of Done

### 5.1 Mandatory Git Branching & PR Flow

Every AI agent and contributor MUST follow this Git flow without exception:

1. **Protected Branches (`develop` and `main`):** Never commit directly to or push directly to `develop` or `main`.
2. **Always Start from a Feature Branch:** For every new feature, enhancement, bug fix, or documentation update, create a fresh branch off `develop` first (e.g., `feature/<short-kebab-name>`, `fix/<short-kebab-name>`, `docs/<short-kebab-name>`).
3. **Test Before Opening a PR:** Complete implementation and verify all relevant checks (`make check`, unit/integration tests, and `make smoke` / `make smoke-outage` when applicable) on the feature branch **before** opening a Pull Request.
4. **Integrate into `develop` via PR:** Open a Pull Request from `<feature-branch>` → **`develop`** (the integration branch for all completed features). Never open a PR from a feature branch directly into `main`.
5. **Production Release (`develop` → `main`):** Releasing integrated features to end users MUST be done via a Pull Request from **`develop` → `main`** only.
6. **Human Review Gate:** Do not push, open a PR, or merge automatically unless the user explicitly instructs you to do so; allow the user to review changes on the feature branch first when requested.

### 5.2 Hygiene, Documentation Sync & Definition of Done

* **Secrets:** Never commit `.env` files, OAuth secrets, API keys, or credentials. Keep local defaults in `.env.example` only.
* **Library & Dependency Registry (Mandatory):** Every time a new library or package is installed in **any service** (`apps/web`, `apps/api`, or `apps/ai`), record its name, version, service, and purpose in the **Key Libraries & Dependencies Registry** in `docs/architecture.md`.
* **Confirmed Requirement / Architecture Changes (Mandatory):** Whenever a confirmed decision conflicts with an existing requirement, business rule, contract, or current system design, you MUST update **both**:
  1. The canonical source-of-truth document(s) affected (`docs/brd.md`, `docs/business-rules.md`, `docs/use-cases.md`, `docs/data-model.md`, `docs/architecture.md`, `contracts/*`, etc.), **and**
  2. An Architecture Decision Record (ADR) in `docs/decisions/` (plus its entry in `docs/decisions/README.md`).
* **Keep Status Current:** When implementing a feature or resolving a prototype gap, update `docs/status.md`.
* **Mandatory Feature Tests:** Every newly developed feature MUST include automated test file(s) covering its behavior and domain invariants (especially Separation of Duties, state transitions, optimistic locking, and privacy boundaries per `docs/testing.md`). Never ship a new feature without tests.
* **Mandatory Verification before finishing code changes:**
  1. Run `make check` and report exact results.
  2. Run `make smoke` (and `make smoke-outage` when changing Compose, readiness, or AI paths).
  3. Run all relevant service test suites (`cd apps/web && bun run test`, `cd apps/api && go test -race ./...`, and `cd apps/ai && uv run --locked pytest`) and report exact results.
