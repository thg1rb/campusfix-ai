# AGENTS.md — CampusFix AI

This file defines repository-wide rules for AI coding agents working in `campusfix-ai`. Keep changes small, verifiable, and faithful to the documented domain and architecture.

## 1. Project Overview & Sources of Truth

**CampusFix AI** is a university physical-issue reporting, AI-assisted triage, human review, and public publishing platform for Kasetsart University (Bangkhen Campus).

Read the relevant source-of-truth documents before implementing features:
- **Business requirements & rules:** `docs/brd.md` (canonical for scope, roles, lifecycles, privacy, and acceptance criteria)
- **Architecture & toolchain decisions:** `docs/decisions/` (start with `docs/decisions/0001-bootstrap.md`)
- **UI & visual direction:** `docs/design-system.md` (mandatory for all `apps/web` UI work)
- **Verification baseline:** `docs/verification.md`
- **Service contracts:** `contracts/` (define or update API/AI schemas here before coding cross-service changes)
- **Next.js-specific rules:** `apps/web/AGENTS.md` (read before touching `apps/web`)

**Scope boundary:** The system ends at Reviewer confirmation, public publishing, `WAITING_INFORMATION` follow-up threads on confirmed tickets, `Mark Affected`, and Admin analytics. Do **not** build Department repair workflows (`IN_PROGRESS`, `RESOLVED`, repair evidence, SLA, post-repair feedback), video upload, public comments, or multi-campus/multi-tenant features.

## 2. Non-Negotiable Domain Invariants

Never violate these rules from `docs/brd.md`:

1. **`Report` vs `Ticket` separation:** A `Report` is one user's submission; a `Ticket` is one verified campus incident. Multiple confirmed `Report`s can link to one `Ticket` without deleting or overwriting individual reports.
2. **Human-in-the-loop AI & fallback:** AI only suggests (`Category`, `Severity`, candidate `Ticket` matches, `Title`/`Summary`, confidence). AI must **never** confirm, reject, delete, hide, or mutate final `Ticket` data. AI timeouts/errors/outages must **never** block report submission or manual review.
3. **`Ticket Candidate` lifecycle:** No-match creates an unpublished `Ticket Candidate` (never public). If the source report is rejected, cancelled, or confirmed into an existing ticket, **soft delete** the unused candidate and write an audit log.
4. **Optimistic review locking:** Reviewers may only confirm/reject against the latest `Report` version. Editing a `PENDING_REVIEW` report bumps its version and re-triggers AI analysis; stale review actions must fail safely (e.g., `409 Conflict`).
5. **Separation of Duties:** A user who is the `Reporter` of a `Report` or `Ticket` must **never** review, confirm, or reject that same item using a `Reviewer` role. `Administrator` is an exclusive role.
6. **`WAITING_INFORMATION` & visibility:** Request Additional Information applies **only to `CONFIRMED` Tickets** (never `PENDING_REVIEW` reports). Tickets with status `CONFIRMED` or `WAITING_INFORMATION` remain visible on the Public Feed/Map as active published tickets; the Additional Information Thread itself is strictly private to involved reviewers and reporters with a confirmed report on that ticket.
7. **Severity scale:** Use `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` consistently across DB, API, AI, and UI. Report count alone must **never** auto-upgrade severity.
8. **Privacy & Auth:**
   - MVP auth uses **Google OAuth** behind a pluggable Auth Provider boundary (ready for **KU-ALL SSO** later); public read requires no login; writes/interactions require login.
   - Public identity is a unique, mutable `Username` (old reports display the current username). Never expose real name, email, student ID, or department publicly.
   - Strip all **EXIF metadata** from uploaded images before storing or serving them.
9. **Metrics & Retention:** Keep `Ticket Count`, `Report Count`, and `Affected User Count` strictly distinct. Purge `DRAFT` 30 days after creation and `CANCELLED` 30 days after cancellation. Record actor, role, and timestamp in audit logs for state/data changes, AI decisions, and soft deletes.

## 3. Toolchain & Version Discipline

This repository uses very recent toolchains (`docs/decisions/0001-bootstrap.md`):
- **Web (`apps/web`):** Node 24, Bun 1.4, Next.js 16.4, React 19.3, TypeScript 5.9, Tailwind CSS 4.3
- **API (`apps/api`):** Go 1.26, Fiber v3.7, GORM 1.31, Goose v3.30
- **AI (`apps/ai`):** Python 3.14, uv 0.13, FastAPI 0.165, Uvicorn 0.54
- **Infra:** PostgreSQL 18.7, Docker Compose with Watch

Do not assume legacy APIs from training data (especially Next.js 16, React 19, Tailwind v4 `@theme`, and Fiber v3). Verify against installed docs/code (for Next.js, check `apps/web/node_modules/next/dist/docs/`).

## 4. Architecture & Code Rules

### `apps/api` (Go Modular Monolith)
- Organize business features under `internal/modules/<module-name>/` with:
  ```text
  domain/
  application/
  adapters/
    inbound/http/
    outbound/postgres/
  ```
- `domain/` must stay pure: **zero imports** of Fiber, GORM, or external provider SDKs.
- `application/` depends on `domain/` types and consumer-defined port interfaces.
- `adapters/outbound/postgres/` owns GORM structs and maps them to/from separate domain entities.
- Wire dependencies via explicit constructor injection in `internal/bootstrap/`.
- **Migrations:** Use `make migration-create NAME=...` and `make migrate` (Goose SQL only, with both Up and Down sections). **Never** use `gorm.AutoMigrate` or run migrations on app startup.

### `apps/web` (Next.js App Router)
- Keep routes in `src/app/`, domain feature code in `src/features/`, and shared primitives in `src/components/ui/`.
- Follow `docs/design-system.md` for tokens, typography, density, states, and anti-slop rules.
- Use Bun (`bun install --frozen-lockfile`, `bun run ...`) for Web package and script commands.

### `apps/ai` (Python AI Gateway)
- Runtime package lives in `src/campusfix_ai/` and is managed exclusively with `uv` (`uv.lock` must stay in sync).
- Keep provider calls behind a clear provider boundary; enforce strict schema validation and bounded timeouts.
- Evaluation datasets and benchmark scripts belong in `apps/ai/evaluation/` (outside the installed runtime package).

### `contracts/`
- Define or update shared request/response contracts (Web ↔ API, API ↔ AI) before implementing endpoints across services.

## 5. Workflow, Git & Verification

- **Work in small vertical slices:** Plan before coding complex changes; record major architecture decisions in `docs/decisions/NNNN-short-title.md`.
- **Branching:** Branch from `develop` and return reviewed changes to `develop`. Never push directly to `main`.
- **Secrets:** Never commit `.env` files, OAuth secrets, API keys, or credentials. Keep local defaults in `.env.example` files only.
- **Definition of Done:** Before finishing a task, run the relevant checks and report exact results:
  - Always run `make check` after code changes (validates Compose configs, Web lint/typecheck/build, Go fmt/vet/test/build, Python lock/import/tests).
  - Run `make smoke` (and `make smoke-outage` when touching Compose, readiness, or AI integration paths) to verify runtime behavior.
  - Add or update unit/integration tests for new domain rules, authorization checks (especially Separation of Duties), and optimistic locking paths.
