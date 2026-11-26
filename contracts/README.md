# KU Spot — Cross-Service Contracts

This directory holds the authoritative service boundary contracts for **KU Spot**.

## Contracts

| File | Boundary | Description |
| --- | --- | --- |
| [api-v1.md](api-v1.md) | `apps/web` ↔ `apps/api` | REST HTTP `/api/v1/*` contract, operational probes (`/healthz`, `/readyz`), auth/RBAC rules, query params, optimistic locking, and error codes. |
| [ai-triage.v1.yaml](ai-triage.v1.yaml) | `apps/api` ↔ `apps/ai` | **Canonical OpenAPI 3.1.0 schema** (`v1.1.0`) for the implemented Pluggable AI Triage Gateway (`/v1/triage/rephrase`, `/v1/triage/analyze`, `/v1/triage/summarize-ticket`, `/v1/triage/embed-ticket`, `/healthz`). |
| [ai-gateway.md](ai-gateway.md) | `apps/api` ↔ `apps/ai` | Operational integration guide, auth (`X-API-Key`), timeout budgets, backend-side cosine/keyword matching flow, revision freshness, and failure fallback rules complementing `ai-triage.v1.yaml`. |

## Contract-First Rules

1. Update the relevant contract document (`api-v1.md`, `ai-triage.v1.yaml`, and/or `ai-gateway.md`) **before** changing request/response shapes across services.
2. Enum values and field semantics must match [docs/data-model.md](../docs/data-model.md) exactly.
3. Public endpoints must strictly follow the Field Visibility Matrix in [docs/business-rules.md](../docs/business-rules.md#202-field-visibility-matrix) (zero PII or private thread leakage).
4. Once `apps/api` modules stabilize, machine-readable OpenAPI YAML (`contracts/openapi-v1.yaml`) may be added alongside `contracts/api-v1.md`.
