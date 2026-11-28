# Architecture Decision Records (ADRs)

Record significant architectural, protocol, security, and schema decisions here so future contributors and AI agents understand *why* choices were made and do not inadvertently reverse them.

> **Mandatory Conflict & Change Rule:** Whenever a confirmed decision conflicts with an existing requirement, business rule, contract, or current system behavior, you MUST both:
> 1. Update the affected canonical source-of-truth document(s) (`docs/brd.md`, `docs/business-rules.md`, `docs/use-cases.md`, `docs/data-model.md`, `docs/architecture.md`, `contracts/*`), **and**
> 2. Record or update the corresponding ADR in `docs/decisions/` and list it in the index below.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001-bootstrap.md](0001-bootstrap.md) | Bootstrap architecture and toolchains | Accepted |
| [0002-auth-provider-and-resolved-only-final-state.md](0002-auth-provider-and-resolved-only-final-state.md) | MVP Auth Provider (Google OAuth `@ku.th`) and `RESOLVED`-only final Ticket state | Accepted |
| [0003-identity-session-and-auth-provider.md](0003-identity-session-and-auth-provider.md) | Identity sessions and AuthProvider | Accepted |
| [0004-media-storage-and-exif-stripping.md](0004-media-storage-and-exif-stripping.md) | Media storage and EXIF stripping | Accepted |

## Planned ADRs (Create When Implementing)

* `0005-ai-triage-and-similarity.md` — JEV provider protocol, multimodal prompt strategy, candidate shortlist query, similarity weighting, and retry policy.
* `0006-web-api-integration.md` — Replacing the in-browser `PrototypeStore` and `mockAiService` in `apps/web` with live Go API integration.

## Template

Create new ADRs as `docs/decisions/NNNN-short-kebab-title.md`:

```markdown
# NNNN: Short Title

- **Status:** Proposed | Accepted | Superseded by NNNN
- **Date:** YYYY-MM-DD

## Context
What problem or requirement forced a decision?

## Decision
What did we decide and what exact boundaries/contracts apply?

## Consequences
What trade-offs, constraints, or follow-up work result from this decision?
```
