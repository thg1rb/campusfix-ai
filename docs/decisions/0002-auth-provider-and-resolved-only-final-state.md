# 0002: MVP Auth Provider (Google OAuth `@ku.th`) and `RESOLVED`-Only Final Ticket State

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

The original Requirement Freeze 1 baseline (`V4` and `BR-AUTH-001`) referenced **KU-ALL (SSO)** as the default authentication provider and included **`CANNOT_RESOLVE`** as a second Final Ticket status alongside `RESOLVED`. Meanwhile, `UC-AUTH-001` and the migrated `apps/web` prototype used **Google OAuth 2.0 (`@ku.th`)** and modeled `RESOLVED` as the sole Final Ticket status. Before starting backend implementation, these two discrepancies had to be resolved cleanly across all canonical specifications.

## Decision

1. **Initial MVP Authentication Provider (`BR-AUTH-001`, `BR-AUTH-004`):**
   - Start MVP authentication with **Google OAuth 2.0** restricted to verified `@ku.th` accounts (`hosted_domain == "ku.th"`).
   - Implement authentication strictly behind a pluggable `AuthProvider` boundary in `apps/api/internal/adapters/auth/` so future providers (such as **KU-ALL SSO** or additional OIDC/SAML providers) can be added without modifying domain or application modules.
2. **Retire `CANNOT_RESOLVE` — `RESOLVED` as Sole Final Ticket State (`BR-STA-009`):**
   - Every operational Ticket terminates exclusively at **`RESOLVED`** via multi-department completion (`UC-DEP-003` or `UC-REV-006` department removal triggering `UC-TKT-004`).
   - Retire `CANNOT_RESOLVE`, `UC-TKT-005`, `BR-STA-003`, `BR-STA-007`, `BR-STA-008`, `BR-STA-010`, and `BR-DEP-008` from MVP scope and all API/data-model contracts.

## Consequences

- `docs/brd.md`, `docs/business-rules.md`, `docs/use-cases.md`, `docs/data-model.md`, `docs/architecture.md`, `docs/design-system.md`, `docs/testing.md`, `docs/status.md`, `contracts/api-v1.md`, `contracts/ai-gateway.md`, and `AGENTS.md` are all aligned to Google OAuth 2.0 (`@ku.th`) + pluggable `AuthProvider` and `RESOLVED`-only ticket finality.
- `apps/web` no longer has status or auth-model drift against the canonical specs.
- Adding KU-ALL SSO later requires only implementing a new `AuthProvider` adapter and configuration wiring without altering domain logic or existing user/report/ticket workflows.
