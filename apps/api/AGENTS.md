# KU Spot API Rules (`apps/api`)

Read root `AGENTS.md`, `docs/architecture.md`, `docs/data-model.md`, `docs/business-rules.md`, and `contracts/api-v1.md` before modifying `apps/api`.

## Stack & Layout

* Go 1.26, Fiber v3.7, GORM 1.31 (PostgreSQL driver), Goose CLI v3.30.
* Modular monolith layout:
  * `cmd/server/` — Process entry point and graceful shutdown lifecycle only.
  * `internal/config/` — Typed environment configuration parsing and validation.
  * `internal/bootstrap/` — Explicit constructor injection wiring infrastructure, adapters, and modules.
  * `internal/platform/` — Shared HTTP server, middleware (auth, request logging, error mapping), and PostgreSQL pool setup.
  * `internal/adapters/` — Outbound external service boundaries (`ai/`, `storage/`, `email/`, `auth/`).
  * `internal/modules/<module-name>/`:
    ```text
    domain/
    application/
    adapters/
      inbound/http/
      outbound/postgres/
    ```

## Architecture & Purity Rules

* **`domain/` must stay pure:** Zero imports of Fiber, GORM, `net/http` handlers, or third-party provider SDKs. Encode state machines, Separation of Duties checks, multi-department completion rules, and value validations here.
* **`application/`** orchestrates use cases using `domain/` entities and consumer-defined port interfaces. Enforce transactional boundaries, optimistic version checks, audit logging, and event dispatch here.
* **`adapters/inbound/http/`** parses Fiber requests, enforces route-level auth/role middleware, invokes application use cases, and maps domain errors to the standard HTTP error envelope in `contracts/api-v1.md`.
* **`adapters/outbound/postgres/`** owns GORM structs and maps persistence models to/from separate domain entities. Never leak GORM models outside `outbound/postgres/`.
* Propagate `context.Context` through every use case, repository call, and outbound HTTP client with bounded timeouts.

## Database & Migration Rules

* **Goose owns all schema changes.** Create migrations via `make migration-create NAME=describe_change` with both `-- +goose Up` and `-- +goose Down` sections, and apply via `make migrate`.
* **Never** call `gorm.AutoMigrate` and **never** run migrations automatically during server startup.
* Always use parameterized queries; wrap multi-table state transitions (e.g., confirm report + create/attach ticket + activity event + audit log, or department completion + auto-resolve) in a single SQL transaction.

## Non-Negotiable Backend Enforcement Checklist

* Enforce **Separation of Duties** (`BR-ROLE-004`, `BR-ROLE-005`) server-side on every review, department assignment, thread request, and department operational action — never trust client-side guards alone.
* Enforce **Exclusive Administrator** (`BR-ROLE-002`, `BR-ROLE-007`) and **max 1 Department per Staff** (`BR-ROLE-003`).
* Enforce **Optimistic Locking** on Reviewer Confirm/Reject (`report.version == expected_version`, returning `409 STALE_REPORT_VERSION`).
* Enforce **Pluggable Auth Boundary** (`BR-AUTH-004`) starting with **Google OAuth 2.0 (`@ku.th`)** (`BR-AUTH-001`), and ensure `RESOLVED` is the sole Final Ticket status (auto-triggered when all Responsible Departments complete).
* Strip **EXIF metadata** from all uploaded images before writing to object storage; validate MIME/magic bytes (`.png`, `.jpg`, `.jpeg`), ≤10 MB each, 1–5 per submitted report.
* Enforce **Public DTO Projection**: never serialize `email`, `real_name`, `provider_subject_id`, `student_id`, or private thread messages in public endpoints.
* Treat AI Gateway errors/timeouts as degraded recommendations (`AIAnalysisStatus = FAILED`) — never fail `POST /reports/:id/submit` or `PATCH /reports/:id` because AI is unavailable.

## Verification

Before finishing changes in `apps/api`, run:

```sh
cd apps/api && test -z "$(gofmt -l cmd internal)" && go mod verify && go vet ./... && go test -race ./... && go build ./...
```
