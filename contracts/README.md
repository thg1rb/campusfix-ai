# KU Spot — Cross-Service Contracts

This directory holds the authoritative service boundary contracts for **KU Spot**.

## Contracts

| File | Boundary | Description |
| --- | --- | --- |
| [api-v1.md](api-v1.md) | `apps/web` ↔ `apps/api` | REST HTTP `/api/v1/*` contract, auth/RBAC rules, query params, optimistic locking, and error codes. |
| [ai-gateway.md](ai-gateway.md) | `apps/api` ↔ `apps/ai` | Internal HTTP `/v1/*` AI triage and Ticket re-evaluation payloads, timeout budgets, and fallback rules. |

## Contract-First Rules

1. Update the relevant contract document **before** changing request/response shapes in `apps/api`, `apps/web`, or `apps/ai`.
2. Enum values and field semantics must match [docs/data-model.md](../docs/data-model.md) exactly.
3. Public endpoints must strictly follow the Field Visibility Matrix in [docs/business-rules.md](../docs/business-rules.md#202-field-visibility-matrix) (zero PII or private thread leakage).
4. Once `apps/api` modules stabilize, machine-readable OpenAPI YAML (`contracts/openapi-v1.yaml`) may be generated/maintained alongside these Markdown specifications.
