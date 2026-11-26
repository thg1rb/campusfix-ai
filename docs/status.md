# KU Spot — Implementation Status & Roadmap

> **Maintenance Rule:** Update this file whenever a vertical slice moves state, a prototype mock is replaced with a live API integration, or an open specification point is resolved.

---

## 1. Current State by Component

| Component | Current Status | Reality Check |
| --- | --- | --- |
| **Infrastructure & Compose** | **Ready (Bootstrap Verified)** | `compose.yaml`, `compose.dev.yaml`, `Makefile`, and `scripts/smoke.sh` verified (see [docs/verification.md](verification.md)). |
| **`apps/web` (Next.js 16)** | **Prototype Migrated (Mock-Backed)** | Full UI prototype migrated to `apps/web` with App Router screens, Leaflet campus map, shadcn primitives, domain helpers (`src/lib/domain/`), and unit tests (`tests/*.test.ts`). Currently backed by in-browser `PrototypeStore.tsx` and `mockAiService.ts` — **not yet wired to `apps/api`** (except `/api/health`). |
| **`apps/api` (Go / Fiber v3)** | **Bootstrap Skeleton** | `/healthz`, `/readyz` (PostgreSQL + AI check), config, and bootstrap wiring exist. `internal/modules/` and `migrations/` are currently empty. |
| **`apps/ai` (Python / FastAPI)** | **Bootstrap Skeleton** | `/healthz` and package layout (`ku_spot_ai`) exist on `develop`. Inference, JEV provider, prompts, similarity scoring, and evaluation cases are pending integration *(note: active work exists on remote branch `origin/feature/ai-triage-gateway`)*. |
| **Documentation & Contracts** | **Aligned to Freeze 1** | Root/scoped `AGENTS.md`, BRD, Business Rules (`BR-*`), Use Cases (`UC-*`), Architecture, Data Model, Design System, Contracts, and Testing specs are aligned to Requirement Freeze 1. |

---

## 2. Feature Vertical Slice Matrix

| Slice | Web UI | Go API | AI Gateway | DB Migrations | End-to-End |
| --- | --- | --- | --- | --- | --- |
| Health & Readiness (`/healthz`, `/readyz`, `/api/health`) | Done | Done | Done | N/A | Verified |
| Auth & Username Profile (`UC-AUTH-001`, `UC-USR-001`) | Prototype Mock | Not Started | N/A | Not Started | Not Started |
| Master Data CRUD (`UC-ADM-002`..`004`) | Prototype Mock | Not Started | N/A | Not Started | Not Started |
| Media Upload & EXIF Stripping (`BR-RPT-003`..`005`) | Prototype DataURL | Not Started | N/A | Not Started | Not Started |
| Report Draft / Submit / Edit / Cancel (`UC-RPT-001`..`005`) | Prototype Mock | Not Started | N/A | Not Started | Not Started |
| AI Triage & Active Ticket Matching (`UC-AI-001`..`003`) | Prototype Mock | Not Started | Skeleton | Not Started | Not Started |
| Reviewer Triage, Optimistic Lock & Dept Edits (`UC-REV-001`..`006`) | Prototype Mock | Not Started | N/A | Not Started | Not Started |
| Public Feed, Search/Filter, Map, Detail (`UC-PUB-*`, `UC-MAP-001`) | Prototype Mock | Not Started | N/A | Not Started | Not Started |
| Department Operations & Multi-Dept Auto-Resolve (`UC-DEP-*`, `UC-TKT-001`..`004`) | Prototype Mock | Not Started | N/A | Not Started | Not Started |
| Private Additional Info Thread (`UC-THR-001`..`002`) | Prototype Mock | Not Started | N/A | Not Started | Not Started |
| Mark Affected (`UC-AFF-001`) | Prototype Mock | Not Started | N/A | Not Started | Not Started |
| Multi-Dimensional Feedback (`UC-FBK-001`..`002`) | Prototype Mock | Not Started | N/A | Not Started | Not Started |
| Major Event Email Notifications (`UC-NOT-001`) | Prototype Log | Not Started | N/A | Not Started | Not Started |
| 30-Day Retention Purge (`BR-RET-001`..`002`) | Prototype Helper | Not Started | N/A | Not Started | Not Started |
| System & Department Analytics (`UC-ADM-005`, `UC-DEP-004`) | Prototype Mock | Not Started | N/A | Not Started | Not Started |

---

## 3. Known Prototype Gaps & Migration Tasks

1. **Browser-only persistence & mock AI in `apps/web`:** `PrototypeStore.tsx`, `prototypeDatabase.ts`, `DemoSimulationBar.tsx`, and `mockAiService.ts` must be replaced incrementally via a typed HTTP API client in `apps/web/src/lib/api/` (tracked under `docs/decisions/0005-web-api-integration.md`).
2. **Mock Google OAuth account switcher in `apps/web`:** Replace the prototype account selector with live backend **Google OAuth 2.0 (`@ku.th`)** sessions behind the pluggable `AuthProvider` boundary in `apps/api/internal/adapters/auth/` (ADR `0002`).
3. **EXIF stripping is not yet implemented:** `apps/web` stores uploaded images as local DataURLs in the prototype. Server-side validation and EXIF stripping must be enforced in `apps/api` before storing or serving any image.

---

## 4. Recommended Implementation Roadmap (Vertical Slices)

1. **Phase 1 — Database Schema & Core Identity:**
   - Create initial Goose SQL migrations from [docs/data-model.md](data-model.md) (`users`, `user_roles`, `categories`, `departments`, `campus_locations`, `record_sequences`, `audit_logs`).
   - Implement `identity` and `masterdata` modules in `apps/api` + pluggable `AuthProvider` (initial provider: Google OAuth 2.0 `@ku.th`) + RBAC middleware (ADR `0002`).
2. **Phase 2 — Media Pipeline & Report Lifecycle:**
   - Implement `media` adapter with magic-byte validation, ≤10 MB limit, and EXIF stripping (ADR `0003`).
   - Implement `reports` module (`DRAFT`, `PENDING_REVIEW`, `CANCELLED`, version bumping, 30-day retention job).
3. **Phase 3 — AI Gateway & Triage Integration:**
   - Complete `apps/ai` endpoints per [contracts/ai-gateway.md](../contracts/ai-gateway.md) (JEV provider boundary, structured validation, similarity scoring, golden evaluation suite; ADR `0004`).
   - Wire `apps/api` candidate shortlisting, async/bounded-timeout AI triage, fallback logging, and Ticket re-evaluation (`UC-AI-001`..`003`).
4. **Phase 4 — Reviewer, Ticket Operations & Multi-Department Resolution:**
   - Implement `review` and `tickets` modules: optimistic lock `409`, Separation of Duties, multi-department assignments, per-department completion, Auto-`RESOLVED`, Public Feed/Map/Detail, and `Mark Affected`.
5. **Phase 5 — Threads, Feedback, Email & Analytics:**
   - Implement `threads` (strictly private), `feedback` (`RESOLVED` only), `notifications` (Major Event Emails to Reporters only), and `analytics` (System + Department).
6. **Phase 6 — Frontend Integration & E2E Verification:**
   - Migrate `apps/web` screens from `PrototypeStore` to live `/api/v1/*` endpoints (ADR `0005`).
   - Run full unit, integration, contract, Playwright E2E, `make check`, `make smoke`, and `make smoke-outage`.

---

## 5. Open Specification Decisions

Track resolution of the remaining open points from [docs/business-rules.md](business-rules.md#21-open-specification-points-tracked-from-freeze-1):

- [ ] Finalize Feedback Rating Dimension names (prototype default: `speed`, `quality`, `communication`, `overall`).
- [ ] Define Email retry and delivery failure policy.
- [ ] Confirm Public Aggregate Feedback display format on Ticket Detail.
- [ ] Decide long-term retention policy for `REJECTED` Reports.
- [ ] Confirm asynchronous storage cleanup policy when `DRAFT`/`CANCELLED` Reports purge at 30 days.
- [ ] Confirm exact responsive card grid breakpoints for tablet/mobile (desktop fixed at 5/row).
