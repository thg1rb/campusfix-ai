## Summary

<!-- Briefly describe what changed and why. Reference related BR-*, UC-*, or issue IDs. -->

## PR Type

- [ ] Feature / Fix / Docs into `develop` (`<feature-branch>` → `develop`)
- [ ] Production Release (`develop` → `main`)

## Checklist

### Git & Scope
- [ ] Branched from `develop` (for feature/fix/docs PRs) and targeting the correct base branch (`develop` for integration, `main` only from `develop`)
- [ ] Changes stay strictly within MVP scope (`docs/brd.md`, `docs/business-rules.md`)
- [ ] No `.env` files, secrets, API keys, or credentials committed

### Contracts, Schema & Docs
- [ ] Updated `contracts/api-v1.md` and/or `contracts/ai-gateway.md` if cross-service payloads changed
- [ ] Used Goose SQL migrations (`make migration-create` / `make migrate`) for any DB change (no `gorm.AutoMigrate`)
- [ ] Updated `docs/status.md` (and added an ADR in `docs/decisions/` if a major architectural decision was made)

### Domain Invariants & Security
- [ ] Enforced Separation of Duties (`BR-ROLE-004`, `BR-ROLE-005`) and Exclusive Administrator (`BR-ROLE-002`, `BR-ROLE-007`) where applicable
- [ ] Preserved Human-in-the-Loop AI & non-blocking AI failure fallback (`BR-GEN-008`, `BR-AI-016`..`020`)
- [ ] Verified no private PII (`realName`, `email`, `providerSubjectId`, `avatarUrl`) or Additional Information Thread data leaks into Public Read endpoints
- [ ] Preserved EXIF stripping on uploaded images where applicable

### Verification
- [ ] `make check` passed
- [ ] Relevant unit / integration tests added or updated and passing
- [ ] `make smoke` (and `make smoke-outage` if touching Compose, readiness, or AI paths) verified

## Verification Output

<!-- Paste exact commands run and observed results. -->
