COMPOSE = docker compose
DEV = $(COMPOSE) -f compose.yaml -f compose.dev.yaml
GOOSE = go run github.com/pressly/goose/v3/cmd/goose@v3.30.1

.PHONY: env up dev logs ps down check check-compose check-web check-api check-ai format smoke smoke-outage migration-create migrate

env:
	@for dir in . apps/web apps/api apps/ai; do if [ ! -f "$$dir/.env" ]; then cp "$$dir/.env.example" "$$dir/.env" || exit; fi; done

up:
	$(COMPOSE) up --build -d --wait --wait-timeout 150

dev:
	$(DEV) up --build --watch

logs:
	$(COMPOSE) logs --tail=100

ps:
	$(COMPOSE) ps

down:
	$(COMPOSE) down

check-compose:
	$(COMPOSE) config --quiet
	$(DEV) config --quiet

check-web:
	cd apps/web && bun install --frozen-lockfile && bun run format:check && bun run lint && bun run typecheck && bun run test && API_BASE_URL=http://127.0.0.1:8080 bun run build

check-api:
	cd apps/api && test -z "$$(gofmt -l cmd docs internal)" && go mod verify && go vet ./... && (if command -v golangci-lint >/dev/null 2>&1; then golangci-lint run; fi) && go test -race ./... && go build ./...

check-ai:
	cd apps/ai && uv lock --check && uv sync --locked && uv run --locked ruff format --check . && uv run --locked ruff check . && uv run --locked pytest && uv run --locked python -c 'from ku_spot_ai.main import app_factory; app_factory()'

check: check-compose check-web check-api check-ai

format:
	cd apps/web && bun run format
	cd apps/api && gofmt -w cmd docs internal
	cd apps/ai && uv run --locked ruff format .

smoke:
	@scripts/smoke.sh

smoke-outage:
	@scripts/smoke.sh --ai-outage

migration-create:
	@test -n "$(NAME)" || { echo "Usage: make migration-create NAME=describe_change"; exit 1; }
	cd apps/api && $(GOOSE) -dir migrations create "$(NAME)" sql

migrate:
	cd apps/api && if ! find migrations -name '*.sql' | grep -q .; then echo "No migrations to apply."; exit 0; fi; \
		override="$${MIGRATION_DATABASE_URL:-}"; \
		set -a; if [ -f .env ]; then . ./.env; fi; \
		GOOSE_DRIVER=postgres GOOSE_DBSTRING="$${override:-$${MIGRATION_DATABASE_URL:-$$DATABASE_URL}}" $(GOOSE) -dir migrations up
