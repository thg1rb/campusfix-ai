# Go API ↔ Python AI Gateway Integration Guide (`/v1/triage`)

> **Canonical Schema:** Full OpenAPI 3.1.0 request/response schemas live in [contracts/ai-triage.v1.yaml](ai-triage.v1.yaml) (`v1.2.0`). This guide defines the operational integration rules, authentication, timeout budgets, backend matching split, revision freshness, and failure fallback semantics between `apps/api` and `apps/ai` (`ku_spot_ai`).

The AI Gateway is strictly **stateless** and acts solely as a **Decision Support System** (`BR-GEN-007`, `BR-AI-001`..`020`).

---

## 1. Operational Constraints & Authentication

* **Internal Network Only:** Exposed inside Docker Compose at `http://ai:8000` (`AI_BASE_URL`); never exposed directly to browser clients.
* **Authentication (`X-API-Key`):**
  * `GET /healthz` is always public for liveness/readiness checks.
  * All `POST /v1/triage/*` endpoints **fail closed by default** and require a configured `X-API-Key` header (`401 unauthorized_client` on missing/invalid key) unless local anonymous mode is explicitly enabled via `AI_ALLOW_ANONYMOUS=true`.
* **Payload Limits:** Up to 5 PNG/JPEG images per request, `≤ 10 MiB` per image and `≤ 15 MiB` aggregate decoded payload (magic bytes must match declared `mime_type`); exceeding gateway byte limits returns `413`.
* **Bounded Timeouts:**
  * `GET /healthz`: `2s` timeout (readiness check).
  * `POST /v1/triage/*`: bounded client timeout in `apps/api` (default `20s`, upstream provider call timeout `≤ 15s`).
* **Failure Fallback (`BR-GEN-008`, `BR-AI-020`):** Any non-200 response (`401`, `413`, `422`, `503`), malformed JSON, schema mismatch, or timeout is handled per workflow without blocking or rolling back human operations:
  * **Report Triage (`POST /v1/triage/analyze`):** `apps/api` records `ai_analysis_runs(status = 'FAILED', error_message = ...)` and leaves the Report in `PENDING_REVIEW` so Reviewers can triage manually.
  * **Ticket Re-evaluation (`POST /v1/triage/summarize-ticket` / `POST /v1/triage/embed-ticket`):** `apps/api` records `ticket_ai_reevaluations(status = 'FAILED', error_message = ...)` while preserving the already-`CONFIRMED` Report and existing Ticket data untouched (never rolling back confirmation or correction).
  * **Optional Rephrase (`POST /v1/triage/rephrase`):** Non-blocking; UI keeps the user's original text untouched on failure.

---

## 2. Implemented Endpoints (Mirrored from `contracts/ai-triage.v1.yaml`)

| Method & Path | Auth | Purpose & Backend Integration Role |
| --- | --- | --- |
| `GET /healthz` | Public | Liveness probe (`200 {"status": "ok"}`). Establishes process availability only; never calls paid upstream LLM inference. |
| `POST /v1/triage/rephrase` | `X-API-Key` | Optional clarity/tone rephrasing of user-authored report title and description without inventing facts. |
| `POST /v1/triage/analyze` | `X-API-Key` | Core Report Triage (`UC-AI-001`, `UC-AI-002`). Returns advisory category classification + confidence, deterministic severity assessment (`CRITICAL`/`HIGH`/`MEDIUM`/`LOW` from rounded `risk_score`), extracted keywords, and a unit-length semantic **report embedding vector**. |
| `POST /v1/triage/summarize-ticket` | `X-API-Key` | Multi-report Ticket synthesis (`UC-AI-003`). Combines all Confirmed Reports in a Ticket to propose updated `ticket_title`, `ticket_description`, deterministic 4-factor ticket-level `severity` (with optional `safety_override`, `BR-AI-013`), keywords, and weighted-blend **ticket embedding vector** (`0.6 * summary_vector + 0.4 * centroid(report_embeddings)`). |
| `POST /v1/triage/embed-ticket` | `X-API-Key` | Embed-only weighted-blend ticket vector (no LLM call) invoked when a Reviewer manually edits final Ticket text and `apps/api` needs a refreshed vector for Active Ticket matching. |

---

## 3. Division of Responsibility: Duplicate Matching (`BR-AI-001`..`006`)

* **`apps/ai` computes representations & advisory fields:** Multimodal classification, deterministic severity, keywords, and unit-length embedding vectors (keeping the gateway domain-agnostic and stateless).
* **`apps/api` computes duplicate matching strictly against Active Tickets (`BR-AI-002`):**
  1. Queries PostgreSQL for **Active Tickets only** (`status IN ('CONFIRMED', 'IN_PROGRESS', 'WAITING_INFORMATION')`) — Final Tickets (`RESOLVED`) are never eligible as matching candidates.
  2. Combines cosine similarity (between the report embedding vector and Active Ticket weighted-blend vectors) with keyword overlap, geospatial proximity, and recency.
  3. Persists ranked `similar_candidates` and `match_decision` (`MATCHED` vs. `NO_MATCH` → unpublished `ticket_candidates` row) on `ai_analysis_runs` for Reviewer verification.

---

## 4. Ticket Re-evaluation Freshness Invariants (`UC-AI-003`)

* Each re-evaluation triggered by `UC-REV-002` or `UC-REV-005` is pinned to `tickets.reevaluation_revision` (`ticket_ai_reevaluations.ticket_revision`), and prior unreviewed runs are marked `is_outdated = true` under `SELECT ... FOR UPDATE` on `tickets`.
* `apps/api` updates only the triggered `reevalId` row (`status = 'COMPLETED'` or `'FAILED'`), never mutating live Ticket fields without Reviewer approval (`BR-AI-015`) and never allowing slower earlier runs to supersede newer revisions (`409 STALE_REEVALUATION` on stale apply).
* Severity suggestions MUST be grounded in physical hazard/impact rubric signals — never upgraded solely because linked Report count increased (`BR-AI-013`).

---

## 5. Error Response Format (`401` / `413` / `422` / `503`)

As defined by `ErrorResponse` in [contracts/ai-triage.v1.yaml](ai-triage.v1.yaml):

```json
{
  "error": {
    "code": "provider_timeout",
    "message": "AI provider request timed out",
    "details": []
  }
}
```
