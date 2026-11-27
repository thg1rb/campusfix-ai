# KU Spot — Cross-Service Contracts

This directory holds the authoritative service boundary contracts for **KU Spot**.

## Contracts

| File | Boundary | Description |
| --- | --- | --- |
| [api-v1.md](api-v1.md) | `apps/web` ↔ `apps/api` | REST HTTP `/api/v1/*` contract, operational probes (`/healthz`, `/readyz`), auth/RBAC rules, query params, optimistic locking, and error codes. |
| [openapi-v1.yaml](../apps/api/docs/openapi-v1.yaml) | `apps/web` ↔ `apps/api` | Machine-readable OpenAPI 3.0.3 for the registered Go API routes. |
| [ai-triage.v1.yaml](ai-triage.v1.yaml) | `apps/api` ↔ `apps/ai` | **Canonical OpenAPI 3.1.0 schema** (`v1.2.0`) for the implemented Pluggable AI Triage Gateway (`/v1/triage/rephrase`, `/v1/triage/analyze`, `/v1/triage/summarize-ticket`, `/v1/triage/embed-ticket`, `/healthz`). |
| [ai-gateway.md](ai-gateway.md) | `apps/api` ↔ `apps/ai` | Operational integration guide, auth (`X-API-Key`), timeout budgets, backend-side cosine/keyword matching flow, revision freshness, and failure fallback rules complementing `ai-triage.v1.yaml`. |

## Contract-First Rules

1. Update the relevant contract document (`api-v1.md`, `ai-triage.v1.yaml`, and/or `ai-gateway.md`) **before** changing request/response shapes across services.
2. Enum values and field semantics must match [docs/data-model.md](../docs/data-model.md) exactly.
3. Public endpoints must strictly follow the Field Visibility Matrix in [docs/business-rules.md](../docs/business-rules.md#202-field-visibility-matrix) (zero PII or private thread leakage).
4. Update the [embedded OpenAPI spec](../apps/api/docs/openapi-v1.yaml) in the same PR as any new or modified Go API endpoint. Schema validation and route parity run in `make check-api`.

With the API running locally, open [Swagger UI](http://localhost:8080/swagger) or download the [raw OpenAPI spec](http://localhost:8080/openapi.yaml). Both are enabled by default when `APP_BASE_URL` uses `localhost`, `127.0.0.1`, or `::1`. Set `SWAGGER_ENABLED=true` or `SWAGGER_ENABLED=false` to override the default.
