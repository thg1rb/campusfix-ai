# KU Spot AI Gateway Rules (`apps/ai`)

Read root `AGENTS.md`, `docs/architecture.md`, `contracts/ai-gateway.md`, and `docs/business-rules.md` (Section 10: `BR-AI-*`) before modifying `apps/ai`.

## Stack & Package Management

* Python 3.14, `uv` 0.13, FastAPI 0.165, Uvicorn 0.54, Hatchling.
* Manage all dependencies exclusively with `uv` (`uv add`, `uv lock`, `uv sync --locked`). Keep `uv.lock` synchronized with `pyproject.toml`.
* Runtime package uses src-layout under `src/ku_spot_ai/`:
  * `api/` — FastAPI routers and Pydantic request/response schemas matching `contracts/ai-gateway.md`.
  * `application/` — Triage and ticket re-evaluation orchestration services.
  * `providers/jev/` — External LLM/vision provider boundary (JEV adapter).
  * `providers/similarity/` — Multimodal/text/spatial similarity scoring boundary.
  * `prompts/` — Versioned prompt templates (Thai + English campus context).
  * `scoring/` — Confidence calibration, weighted duplicate scoring, and severity rubric logic.
* Keep evaluation datasets, golden cases, and benchmark scripts in `apps/ai/evaluation/` — **never** import evaluation data or test fixtures into the installed `ku_spot_ai` runtime package.

## Hard AI Guardrails

* **Stateless Decision Support Only:** `apps/ai` never connects directly to PostgreSQL, never mutates operational records, and never decides final Ticket state (`BR-AI-016`..`019`). The Go API supplies the report payload, active Category/Department definitions, and shortlisted **Active Tickets** (`CONFIRMED`, `IN_PROGRESS`, `WAITING_INFORMATION`).
* **Strict Output Validation:** Validate every model output with Pydantic schemas (valid `category_id` from supplied active categories, `confidence` integer `0..100`, `severity` in `CRITICAL | HIGH | MEDIUM | LOW`, valid `department_ids` from supplied active departments, bounded title/summary lengths).
* **Severity Invariant (`BR-AI-013`):** Never increase suggested Ticket severity solely because linked Report count increased; evaluate hazard/impact content from the reports.
* **Bounded Timeouts & Clean Failure:** Enforce explicit HTTP/provider timeouts on every upstream model call. Return structured error responses when upstream inference fails so the Go API can record `FAILED` and preserve fallback workflows (`BR-AI-020`).
* **Privacy:** Never log raw user PII or sensitive credentials.

## Verification

* Whenever a new Python library is installed via `uv add`, record it in `docs/architecture.md` (Section 8).
* Every new feature or endpoint in `apps/ai` MUST include automated `pytest` test file(s) under `apps/ai/tests/`.

Before finishing changes in `apps/ai`, run:

```sh
cd apps/ai && uv lock --check && uv sync --locked && uv run --locked pytest && uv run --locked python -c 'from ku_spot_ai.main import app_factory; app_factory()'
```
