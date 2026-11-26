# Architecture Decision Records (ADRs)

Record significant architectural, protocol, security, and schema decisions here so future contributors and AI agents understand *why* choices were made and do not inadvertently reverse them.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001-bootstrap.md](0001-bootstrap.md) | Bootstrap architecture and toolchains | Accepted |

## Planned ADRs (Create When Implementing)

* `0002-auth-and-session-strategy.md` — Pluggable Auth Provider boundary (KU-ALL SSO vs. Google OAuth `@ku.th`), session cookies/JWT, and RBAC enforcement.
* `0003-media-storage-and-exif.md` — Object storage choice, upload flow, EXIF stripping library, and 30-day purge media cleanup.
* `0004-ai-triage-and-similarity.md` — JEV provider protocol, multimodal prompt strategy, candidate shortlist query, similarity weighting, and retry policy.
* `0005-web-api-integration.md` — Replacing the in-browser `PrototypeStore` and `mockAiService` in `apps/web` with live Go API integration.

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
