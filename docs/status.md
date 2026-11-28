# KU Spot — Implementation Status & Roadmap

> **Maintenance Rule:** Update this file whenever a vertical slice moves state, a prototype mock is replaced with a live API integration, or an open specification point is resolved.

---

## 1. Current State by Component

| Component | Current Status | Reality Check |
| --- | --- | --- |
| **Infrastructure, Compose & CI** | **Ready (Compose, MinIO and Path-Filtered CI)** | `compose.yaml`, `compose.dev.yaml`, `Makefile`, `scripts/smoke.sh`, and path-filtered GitHub Actions CI (`.github/workflows/ci.yml`: 3 clean jobs `CI / Web`, `CI / API`, `CI / AI` with path-filtered checks, including PostgreSQL-backed API race tests for API and workflow changes) configured. Compose builds MinIO from pinned upstream source and provisions the private local S3 bucket through the API. |
| **`apps/web` (Next.js 16)** | **Phase 4 Reporter integration** | Full UI prototype migrated to `apps/web` with App Router screens, Leaflet campus map, shadcn primitives, domain helpers (`src/lib/domain/`), and unit tests (`tests/*.test.ts`). Authentication, username settings, Admin Users, Audit Logs, and Master Data and authenticated Reporter screens use the Go API. Live sessions synchronize across tabs, and admin searches debounce requests while keeping visible results during refresh. Public browsing uses labeled prototype data. Prototype-only operational screens are available to development guests after session resolution. |
| **`apps/api` (Go / Fiber v3)** | **Phase 0–4 implemented** | Health and readiness, Goose schema, record numbers, audit, Google OAuth sessions, profiles, and administrator user management are available. Identity writes enforce origin and media type. PostgreSQL integration tests cover session expiry and the requirement for every user to have at least one role at commit. Master Data provides auditable admin writes and an active-only public reference endpoint. Phase 3 adds staged media, orientation-preserving EXIF stripping, and expired image and session cleanup. Phase 4 adds the Reporter lifecycle, attachment visibility, and 30-day persistence cleanup. Embedded Swagger UI covers all 30 documented operations. `make check-api` validates the OpenAPI schema and examples, checks route parity and operation metadata, and exercises documentation serving. |
| **`apps/ai` (Python / FastAPI)** | **Implemented (Ticket Severity + Multi-Dept Recommendation)** | Pluggable Gemini Triage & Embedding Gateway (`contracts/ai-triage.v1.yaml` `v1.3.0`: `/v1/triage/rephrase`, `/v1/triage/analyze`, `/v1/triage/summarize-ticket` with deterministic 4-factor ticket-level severity per `BR-AI-013` and multi-department recommendation per `BR-AI-010`, `/v1/triage/embed-ticket`, `X-API-Key` auth, unit-length vectors) with `pytest` suite (`apps/ai/tests/`) and cross-domain evaluation demo (`apps/ai/evaluation/demo_cross_domain.py`). |
| **Documentation & Contracts** | **Aligned to Freeze 1 + PR #2** | Root/scoped `AGENTS.md`, BRD, Business Rules (`BR-*`), Use Cases (`UC-*`), Architecture (including Dependency Registry), Data Model, Design System, Contracts (`api-v1.md`, `ai-triage.v1.yaml`, `ai-gateway.md`), ADRs, and Testing specs are synchronized. |

---

## 2. Feature Vertical Slice Matrix

| Slice | Web UI | Go API | AI Gateway | DB Migrations | End-to-End |
| --- | --- | --- | --- | --- | --- |
| Health & Readiness (`/healthz`, `/readyz`, `/api/health`) | Done | Done | Done | N/A | Verified |
| Auth & Username Profile (`UC-AUTH-001`, `UC-USR-001`) | Live API | Implemented | N/A | Applied in verification | Mock-provider and Web tests pass |
| Admin Users & Audit Logs | Live API | Implemented | N/A | Applied in verification | Mock-provider and Web tests pass |
| Master Data CRUD (`UC-ADM-002`..`004`) | Live admin screens validate forms before writes | Unchanged PATCH requests preserve timestamps and audit history | N/A | Applied in verification | Go unit, PostgreSQL integration, and Web tests cover validation and no-op edits |
| Public Master Data | Typed API client available | Implemented | N/A | Applied in verification | Live HTTP and PostgreSQL tests pass |
| Media Upload & EXIF Stripping (`BR-RPT-003`..`005`) | Live Reporter uploader stages images in MinIO. Development guests use DataURLs. | Staged uploads, EXIF stripping, 24-hour expiry, and Report-aligned attachment visibility | N/A | `report_images.report_id` foreign key applied | PostgreSQL visibility, live MinIO, and Web uploader tests pass. See [ADR 0004](decisions/0004-media-storage-and-exif-stripping.md). |
| Report Draft / Submit / Edit / Cancel (`UC-RPT-001`..`004`) | Live Reporter screens | Implemented with audit and versioning | No-op triage hook | `reports` applied | PostgreSQL lifecycle and Vitest live Reporter flows pass |
| AI Triage, Embeddings & Ticket Synthesis (`UC-AI-001`..`003`) | Prototype Mock | Not Started | **Done (PR #2)** | Not Started | Not Started |
| Reviewer Triage, Optimistic Lock & Dept Edits (`UC-REV-001`..`006`) | Prototype Mock | Not Started | N/A | Not Started | Not Started |
| Public Feed, Search/Filter, Map, Detail (`UC-PUB-*`, `UC-MAP-001`) | Prototype Mock | Not Started | N/A | Not Started | Not Started |
| Department Operations & Multi-Dept Auto-Resolve (`UC-DEP-*`, `UC-TKT-001`..`004`) | Prototype Mock | Not Started | N/A | Not Started | Not Started |
| Private Additional Info Thread (`UC-THR-001`..`002`) | Prototype Mock | Not Started | N/A | Not Started | Not Started |
| Mark Affected (`UC-AFF-001`) | Prototype Mock | Not Started | N/A | Not Started | Not Started |
| Multi-Dimensional Feedback (`UC-FBK-001`..`002`) | Prototype Mock | Not Started | N/A | Not Started | Not Started |
| Major Event Email Notifications (`UC-NOT-001`) | Prototype Log | Not Started | N/A | Not Started | Not Started |
| 30-Day Retention Purge (`BR-RET-001`..`002`) | N/A | Startup and daily maintenance with audited post-commit object deletion | N/A | Partial retention indexes applied | PostgreSQL cutoff, status preservation, FK cascade, and object cleanup tests pass |
| System & Department Analytics (`UC-ADM-005`, `UC-DEP-004`) | Prototype Mock | Not Started | N/A | Not Started | Not Started |

---

## 3. Known Prototype Gaps & Migration Tasks

1. **Browser-only persistence & mock AI in `apps/web`:** `PrototypeStore.tsx`, `prototypeDatabase.ts`, `DemoSimulationBar.tsx`, and `mockAiService.ts` must be replaced incrementally via a typed HTTP API client in `apps/web/src/lib/api/` (tracked under planned ADR `0006`).
2. **Live Google OAuth:** Configure the public callback and credentials using [ADR 0003](decisions/0003-identity-session-and-auth-provider.md). The live admin overview shows Audit Logs. Analytics and retention controls remain in the development demo. The live master data client is available for the future migration of public filters and map pickers.
3. **Ticket-targeted reports:** `UC-RPT-005` remains available in the development prototype. Live Reporter screens support standalone submissions until the Ticket module is available.

---

## 4. Recommended Implementation Roadmap (Vertical Slices)

1. **Phase 0–1 — Platform and Identity:** Implemented in the API. See [ADR 0003](decisions/0003-identity-session-and-auth-provider.md).
2. **Phase 2 — Master Data:** Categories, departments, and campus locations support live administration and active-only public reads. Operational prototype screens still use seed references.
3. **Phase 3 — Media Pipeline:** Implemented staged PNG/JPEG uploads, server-side EXIF stripping, private MinIO-backed storage, typed Web client, and hourly cleanup for expired staged images and sessions. See [ADR 0004](decisions/0004-media-storage-and-exif-stripping.md).
4. **Phase 4 — Report Lifecycle:** Implemented Draft, Submit, Edit, Cancel, version increments, and 30-day retention. The image foreign key and visibility resolver are wired, and authenticated Reporter screens use the live report and media APIs.
5. **Phase 5 — AI Gateway Triage & Matching Integration:**
   - `apps/ai` endpoints (`contracts/ai-triage.v1.yaml`) and the `pytest` suite are implemented.
   - Wire `apps/api` to `/v1/triage/*` with `X-API-Key`, backend-computed cosine similarity and keyword matching against Active Tickets, bounded AI triage, fallback logging, and Ticket re-evaluation (`UC-AI-001`..`003`, planned ADR `0005`).
6. **Phase 6 — Reviewer, Ticket Operations & Multi-Department Resolution:** Implement reviewer and ticket modules for optimistic locking, Separation of Duties, multi-department assignment and completion, auto-resolution, the public feed and map, and Mark Affected.
7. **Phase 7 — Threads, Feedback, Email & Analytics:** Implement private threads, feedback on resolved Tickets, Major Event Email, and system and department analytics.
8. **Phase 8 — Frontend Integration & E2E Verification:** Migrate the remaining screens to live `/api/v1/*` endpoints (planned ADR `0006`). Run unit, integration, contract, Playwright E2E, `make check`, `make smoke`, and `make smoke-outage`.

---

## 5. Open Specification Decisions

Track resolution of the remaining open points from [docs/business-rules.md](business-rules.md#21-open-specification-points-tracked-from-freeze-1):

- [ ] Finalize Feedback Rating Dimension names (prototype default: `speed`, `quality`, `communication`, `overall`).
- [ ] Define Email retry and delivery failure policy.
- [ ] Confirm Public Aggregate Feedback display format on Ticket Detail.
- [ ] Decide long-term retention policy for `REJECTED` Reports.
- [ ] Confirm asynchronous storage cleanup policy when `DRAFT`/`CANCELLED` Reports purge at 30 days.
- [ ] Confirm exact responsive card grid breakpoints for tablet/mobile (desktop fixed at 5/row).
