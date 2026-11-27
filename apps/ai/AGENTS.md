# KU Spot AI Gateway Rules (`apps/ai`)

Read root `AGENTS.md`, `docs/architecture.md`, `contracts/ai-triage.v1.yaml`, `contracts/ai-gateway.md`, and `docs/business-rules.md` (Section 10: `BR-AI-*`) before modifying `apps/ai`.

## Stack & Package Management

* Python 3.14, `uv` 0.13, FastAPI 0.165, Uvicorn 0.54, `google-genai`, Hatchling, `pytest`, `httpx`.
* Manage all dependencies exclusively with `uv` (`uv add`, `uv lock`, `uv sync --locked`). Keep `uv.lock` synchronized with `pyproject.toml` and record every newly installed library in `docs/architecture.md` (Section 8).
* Runtime package uses src-layout under `src/ku_spot_ai/`:
  * `api/` — FastAPI routers (`routes.py`) and Pydantic schemas (`schemas.py`) matching `contracts/ai-triage.v1.yaml`.
  * `application/` — Triage, rephrase, synthesis, and embedding orchestration (`triage_service.py`).
  * `providers/` — Pluggable AI provider interface (`base.py`) and concrete implementations (`gemini/provider.py`).
  * `prompts/` — Versioned prompt templates (`triage.py`).
  * `scoring/` — Deterministic severity rubric (`severity.py`) and unit-normalized vector blending (`vectors.py`).
* Keep evaluation datasets, golden cases, and benchmark scripts in `apps/ai/evaluation/` — **never** import evaluation scripts or fixtures into the installed `ku_spot_ai` runtime package.

## Hard AI Guardrails

* **Stateless Decision Support Only:** `apps/ai` never connects directly to PostgreSQL, never mutates operational records, and never decides final Ticket state (`BR-AI-016`..`019`). Duplicate matching (cosine similarity + keyword matching against Active Tickets) is computed by `apps/api` using the vectors and keywords returned here.
* **Fail-Closed Auth & Limits:** Keep `X-API-Key` enforcement fail-closed on `/v1/triage/*` unless `AI_ALLOW_ANONYMOUS=true`, preserve magic-byte MIME validation and the `≤ 10 MiB` per-image / `≤ 15 MiB` aggregate decoded payload limits, and keep `/healthz` public without calling upstream LLM inference.
* **Strict Output Validation & Severity Invariant (`BR-AI-013`):** Validate all model outputs via Pydantic schemas and deterministic severity scoring; never escalate severity solely from Report count.
* **Bounded Timeouts & Clean Failure:** Enforce explicit provider timeouts and surface structured `ErrorResponse` (`503`) on upstream failure so `apps/api` can persist `FAILED` and preserve fallback workflows (`BR-AI-020`).
* **Privacy:** Never log raw user PII or API keys.

## Verification

* Every new feature or endpoint in `apps/ai` MUST include automated `pytest` test file(s) under `apps/ai/tests/`.

Before finishing changes in `apps/ai`, run:

```sh
cd apps/ai && uv lock --check && uv sync --locked && uv run --locked pytest && uv run --locked python -c 'from ku_spot_ai.main import app_factory; app_factory()'
```
