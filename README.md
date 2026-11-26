# KU Spot

KU Spot is an AI-assisted campus physical-issue reporting, triage, multi-department resolution tracking, and public transparency platform for Kasetsart University (Bangkhen Campus). The repository runs a Next.js Web application, a Go API (modular monolith), a Python FastAPI AI Gateway, and PostgreSQL.

## Quick start

Install Git, Docker Engine with Compose v2.32+ or v5, Make, `curl`, and `jq`. For standalone development and `make check`, install the toolchains documented in [docs/decisions/0001-bootstrap.md](docs/decisions/0001-bootstrap.md).

```sh
git clone https://github.com/thg1rb/ku-spot.git
cd ku-spot
make env
make up
make smoke
```

| Service | Local address | Verification |
| --- | --- | --- |
| Web | http://localhost:3000 | `/` renders KU Spot. `/api/health` calls API readiness. |
| Go API | http://localhost:8080 | `/healthz` checks liveness. `/readyz` checks PostgreSQL and AI. |
| AI Gateway | http://localhost:8000 | `/healthz` checks gateway availability. |
| PostgreSQL | localhost:5432 | Compose uses `pg_isready`. API readiness runs `SELECT 1`. |

Readiness returns HTTP `200` when both dependencies respond successfully and `503` when either fails. An AI health response establishes gateway availability only.

## Daily commands

| Command | Purpose |
| --- | --- |
| `make env` | Copy missing `.env.example` files to local `.env` files. |
| `make up` | Build and start the base stack with bounded health polling. |
| `make dev` | Start Compose Watch in the foreground. Web and AI reload source changes, and Go changes rebuild the API. |
| `make ps` / `make logs` | Inspect container state and recent logs. Use `docker compose logs -f api` to follow a single service. |
| `make check` | Validate both Compose files and run lint, typecheck, test, and build checks across all three applications. |
| `make smoke` | Check HTTP responses and the full dependency path on the running stack. |
| `make smoke-outage` | Temporarily stop this project's AI container and verify degraded readiness and recovery. |
| `make down` | Stop the project stack while preserving its PostgreSQL volume. |

The development override starts services independently so a Watch rebuild can replace one service without recreating its dependencies. Run `make smoke` in another terminal to wait for readiness. The smoke script discovers the running Compose project's published ports.

Stop the base stack before starting standalone services on the same ports. Start just the database with `docker compose up -d --wait db`. Run these commands in separate terminals from the repository root after `make env`:

```sh
cd apps/ai && uv sync --locked && uv run --locked --env-file .env python -m ku_spot_ai.main --reload
```

```sh
cd apps/api && set -a && . ./.env && set +a && go run ./cmd/server
```

```sh
cd apps/web && bun install --frozen-lockfile && bun run dev
```

## Environment and migrations

Root `.env` supplies Compose's published ports and PostgreSQL user, password, and database. Compose passes database settings to PostgreSQL and generates the API's `DATABASE_URL` targeting `db:5432`. If credentials contain URL-reserved characters, set the root `DATABASE_URL` explicitly with URL-encoded credentials. PostgreSQL initializes its role and database on the first boot of an empty volume.

Compose sets internal URLs to `http://api:8080` and `http://ai:8000`. Host port overrides affect only host access. Each app's `.env` is for standalone runs. Adjust the standalone API's `DATABASE_URL`, `API_PORT`, and `AI_BASE_URL`, the gateway's `AI_PORT`, and the Web server's private `API_BASE_URL` if you change ports. Quote shell metacharacters in standalone API settings. Keep private secrets in git-ignored `.env` files only.

Use Goose for all PostgreSQL schema changes:

```sh
make migration-create NAME=describe_change
make migrate
```

Migrations are an explicit operation separate from application startup. Never use `gorm.AutoMigrate`.

## Repository layout

- `apps/web/` — Next.js App Router frontend (currently contains the migrated UI prototype backed by an in-browser prototype store; see [docs/status.md](docs/status.md) for API integration progress).
- `apps/api/` — Go modular monolith API. `cmd/server` owns lifecycle, `internal/bootstrap` wires constructors, `internal/platform` holds HTTP/DB infrastructure, `internal/adapters` holds external integration boundaries, and `internal/modules` hosts domain modules.
- `apps/ai/` — Python FastAPI AI Gateway (`src/ku_spot_ai/`). Provider, application, scoring, and prompt packages live inside `ku_spot_ai`; evaluation datasets and benchmarks live in `apps/ai/evaluation/`.
- `contracts/` — Cross-service API and AI Gateway contracts (`Web ↔ API` and `API ↔ AI`).
- `docs/` — Authoritative specifications, architecture, data model, design system, ADRs, status, and testing standards.
- `scripts/` — Operational and smoke verification scripts.

## Documentation index

Start with [AGENTS.md](AGENTS.md) if you are an AI coding agent or contributor looking for repository rules and invariants.

| Document | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Repository-wide rules, domain invariants, and Definition of Done for AI agents. |
| [docs/brd.md](docs/brd.md) | Business Requirements Document (Requirement Freeze 1). |
| [docs/business-rules.md](docs/business-rules.md) | Canonical `BR-*` Business Rules, Role Authorization Matrix, and Field Visibility Matrix. |
| [docs/use-cases.md](docs/use-cases.md) | Complete Use Case Specification (`UC-*`) with flows and traceability. |
| [docs/architecture.md](docs/architecture.md) | System architecture, module boundaries, auth, storage, AI pipeline, and error conventions. |
| [docs/data-model.md](docs/data-model.md) | Canonical enums, record numbering, database schema, state machines, and metric formulas. |
| [docs/design-system.md](docs/design-system.md) | Visual direction, Tailwind v4 tokens, typography, role-based layouts, and anti-slop rules. |
| [contracts/README.md](contracts/README.md) | Cross-service contracts ([API v1](contracts/api-v1.md) and [AI Gateway](contracts/ai-gateway.md)). |
| [docs/status.md](docs/status.md) | Current implementation status, known prototype gaps, and vertical-slice roadmap. |
| [docs/testing.md](docs/testing.md) | Testing strategy, mandatory domain test matrix, and AI evaluation criteria. |
| [docs/decisions/README.md](docs/decisions/README.md) | Architecture Decision Records (starting with [0001-bootstrap.md](docs/decisions/0001-bootstrap.md)). |
| [docs/verification.md](docs/verification.md) | Bootstrap verification baseline and release review findings. |

## Git workflow

1. Always create a new branch from `develop` (e.g., `feature/<name>`, `fix/<name>`, `docs/<name>`). Never commit or push directly to `develop` or `main`.
2. Complete testing and verification (`make check`, tests, and `make smoke` when applicable) on the feature branch.
3. Open a Pull Request from the feature branch into `develop` for review and integration.
4. Release tested features to end users by opening a Pull Request from `develop` → `main`.

## Troubleshooting

Use `docker info` to check the engine and `make ps` / `make logs` to locate startup failures. If a host port is busy, change the corresponding root port in `.env` and rerun Compose. If readiness reports `db` unavailable, check the API DSN and whether its credentials match the existing PostgreSQL volume. If it reports `ai` unavailable, inspect the AI container and call its `/healthz` route directly.
