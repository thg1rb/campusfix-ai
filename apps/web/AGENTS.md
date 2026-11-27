<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# KU Spot Web Rules (`apps/web`)

Read root `AGENTS.md`, `docs/design-system.md`, `contracts/api-v1.md`, and `docs/status.md` before modifying `apps/web`.

## Stack & Package Management

* Use **Bun** (`bun install --frozen-lockfile`, `bun run lint`, `bun run typecheck`, `bun run build`, `bun run test`) for package management and scripts. Node 24 runs Next.js.
* Keep `bun.lock` committed and consistent. Whenever a new library is installed in `apps/web`, record it in `docs/architecture.md` (Section 8).
* Use Tailwind CSS v4 `@theme` tokens defined in `src/app/globals.css`; follow all color, typography, density, and anti-slop rules in `docs/design-system.md`.

## Structure & Boundaries

* `src/app/` — Next.js App Router pages, layouts, and server route handlers (such as `/api/health`).
* `src/features/<feature>/` — Domain screens, feature-scoped components, and feature data/hooks.
* `src/components/ui/` — Reusable primitive UI components (shadcn/Radix primitives).
* `src/components/shared/` — Cross-feature KU Spot UI primitives (`Badges`, `AppShell`, `EmptyState`, etc.).
* `src/lib/domain/` — Pure TypeScript domain helpers (transitions, permissions, validation, record numbering, retention, analytics). Keep UI/framework code out of `src/lib/domain/`.
* `src/lib/api/` — HTTP client layer targeting Go API (`API_BASE_URL` server-side; never hardcode host ports or leak private credentials to client bundles).
* `src/types/domain.ts` — Canonical frontend domain types aligned with `docs/data-model.md` and `contracts/api-v1.md`.

## Current Prototype Migration Guardrails

* `apps/web` currently runs against an in-browser prototype store (`src/lib/store/PrototypeStore.tsx`) and mock AI (`src/lib/ai/mockAiService.ts`).
* Do **not** silently mix mock store mutations with live Go API calls in the same flow; follow the phased integration plan in `docs/status.md`.
* Keep every screen faithful to Freeze 1 interactive states: loading skeletons, empty states, non-blocking AI fallback banners, `409 STALE_REPORT_VERSION` reload prompts, Separation of Duties guards, and final-ticket locks (`RESOLVED`).
* Respect `BR-PUB-007` (5 Ticket cards per row on desktop Public Feed) and `BR-PUB-006` (page sizes `25`, `50`, `100`).
* Never render private PII (`realName`, `email`, student ID, department) or Additional Information Thread messages on public routes.

## Verification

Every new feature in `apps/web` MUST include automated test file(s) under `apps/web/tests/`. Before finishing changes in `apps/web`, run:

```sh
cd apps/web && bun run lint && bun run typecheck && bun run test && API_BASE_URL=http://127.0.0.1:8080 bun run build
```
