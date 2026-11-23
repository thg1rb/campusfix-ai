# CampusFix AI

CampusFix AI is a university physical-issue reporting, AI-assisted triage, human review, and public publishing platform. This bootstrap runs a Web application, a Go API, a Python AI Gateway, and PostgreSQL.

## Quick start

Install Git, Docker Engine with Compose v2.32+ or v5, Make, curl, and jq. For standalone development and `make check`, install the toolchains listed below.

```sh
git clone https://github.com/thg1rb/campusfix-ai.git
cd campusfix-ai
# Use feature/project-bootstrap when reviewing the bootstrap branch.
make env
make up
make smoke
```

| Service | Local address | Verification |
| --- | --- | --- |
| Web | http://localhost:3000 | `/` displays CampusFix AI. `/api/health` calls API readiness. |
| Go API | http://localhost:8080 | `/healthz` checks liveness. `/readyz` checks PostgreSQL and AI. |
| AI Gateway | http://localhost:8000 | `/healthz` checks gateway availability. |
| PostgreSQL | localhost:5432 | Compose uses `pg_isready`. API readiness runs `SELECT 1`. |

Readiness returns HTTP 200 when both dependencies respond successfully and 503 when either fails. An AI health response establishes gateway availability only.

## Daily commands

| Command | Purpose |
| --- | --- |
| `make env` | Copy missing examples to local environment files. |
| `make up` | Build and start the base stack with bounded health polling. |
| `make dev` | Start Compose Watch in the foreground. Web and AI reload source changes, and Go changes rebuild the API. |
| `make ps` / `make logs` | Inspect container state and recent logs. Use `docker compose logs -f api` to follow a single service. |
| `make check` | Validate both Compose files and check all three applications. |
| `make smoke` | Check HTTP responses and the full dependency path on the running stack. |
| `make smoke-outage` | Temporarily stop this project's AI container and check failure and recovery. |
| `make down` | Take down the project while preserving its PostgreSQL volume. |

The development override starts services independently so a Watch rebuild can replace one service without recreating its dependencies. Run `make smoke` in another terminal to wait for readiness. The smoke script uses the running Compose project's published ports.

Stop the base stack before starting standalone services on the same ports. Start just the database with `docker compose up -d --wait db`. Run these commands in separate terminals from the repository root, after `make env`.

```sh
cd apps/ai && uv sync --locked && uv run --locked --env-file .env python -m campusfix_ai.main --reload
```

```sh
cd apps/api && set -a && . ./.env && set +a && go run ./cmd/server
```

```sh
cd apps/web && bun install --frozen-lockfile && bun run dev
```

## Environment and migrations

Root `.env` supplies Compose's published ports and PostgreSQL user, password, and database. Compose passes the database settings to PostgreSQL and generates the API's `DATABASE_URL` targeting `db:5432`. If the credentials contain URL-reserved characters, set the root `DATABASE_URL` explicitly with URL-encoded credentials. PostgreSQL initializes its role and database on the first boot of an empty volume.

Compose sets internal URLs to `http://api:8080` and `http://ai:8000`. Host port overrides affect only host access. Each app's `.env` is for standalone runs. Adjust the standalone API's `DATABASE_URL`, `API_PORT` and `AI_BASE_URL`, the gateway's `AI_PORT`, and the Web server's private `API_BASE_URL` if you change ports. Quote shell metacharacters in standalone API settings. The examples contain local development defaults. Keep private values in ignored environment files.

The migrations directory starts empty. Use `make migration-create NAME=describe_change` to generate the first SQL file, fill its Goose Up and Down sections, and review it. With PostgreSQL available and `apps/api/.env` pointing to it, run `make migrate`. Migrations are an explicit operation separate from application startup.

## Layout and workflow

- `apps/web/src/app` holds the App Router and technical route. `features/` and `components/ui/` are reserved.
- `apps/api/cmd/server` owns lifecycle. `internal/bootstrap` wires constructors, `internal/platform` holds the server and database infrastructure, and `internal/adapters` holds external integration boundaries.
- `apps/ai/src/campusfix_ai` is the installed gateway package. Provider, application, scoring and prompt directories are reserved. Evaluation cases live outside the installed package.
- `contracts/` is reserved for shared service contracts. `scripts/` holds smoke checks, and `docs/` holds the BRD, design system, decisions, and verification.

Start feature branches from `develop` and return changes to `develop` through review. Promote reviewed integration work to `main` in a separate release step.

The scaffold defers authentication, Tickets, dashboards, file uploads, business migrations, UI component libraries, object storage, and external AI integration. See [architecture and versions](docs/decisions/0001-bootstrap.md) and [verification](docs/verification.md).

## Troubleshooting

Use `docker info` to check the engine and `make ps` and `make logs` to locate startup failures. If a host port is busy, change the corresponding root port and rerun Compose. If readiness reports `db` unavailable, check the API DSN and whether its credentials match the existing volume. If it reports `ai` unavailable, inspect the AI container and call its health route directly.
