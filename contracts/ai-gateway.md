# Go API ↔ Python AI Gateway Contract (`/v1`)

This document defines the internal HTTP contract between `apps/api` and `apps/ai` (`ku_spot_ai`). The AI Gateway is strictly **stateless** and acts solely as a **Decision Support System** (`BR-GEN-007`, `BR-AI-001`..`020`).

---

## 1. Operational Constraints

* **Internal Network Only:** Exposed inside Docker Compose at `http://ai:8000` (`AI_BASE_URL`); never exposed directly to browser clients.
* **Bounded Timeouts:**
  * `GET /healthz`: `2s` timeout (readiness check).
  * `POST /v1/triage/analyze`: `20s` client timeout in Go API (provider call timeout `≤ 15s`).
  * `POST /v1/tickets/reevaluate`: `20s` client timeout in Go API.
* **Failure Fallback (`BR-GEN-008`, `BR-AI-020`):** Any non-200 response, malformed JSON, schema validation error, or timeout is handled per workflow without blocking or rolling back human operations:
  * **Report Triage (`POST /v1/triage/analyze`):** `apps/api` records `ai_analysis_runs(status = 'FAILED', error_message = ...)` and leaves the Report in `PENDING_REVIEW` so Reviewers can triage manually.
  * **Ticket Re-evaluation (`POST /v1/tickets/reevaluate`):** `apps/api` records `ticket_ai_reevaluations(status = 'FAILED', error_message = ...)` while preserving the already-`CONFIRMED` Report and existing Ticket data untouched (never rolling back confirmation or correction).
* **Canonical Enums:** `severity` MUST be one of `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`. Confidence and similarity scores MUST be integers `0..100`.

---

## 2. Health Check (Implemented in Bootstrap)

### `GET /healthz`
Returns `200 OK`:
```json
{ "status": "ok" }
```
Establishes gateway process availability only (does not invoke paid external LLM inference on every readiness poll).

---

## 3. Analyze & Match Report (`UC-AI-001`, `UC-AI-002`)

### `POST /v1/triage/analyze`

Invoked when a Report is submitted (`PENDING_REVIEW`, `version = 1`) or edited while `PENDING_REVIEW` (`version > 1`).

#### Request Body
```json
{
  "requestId": "req_01J...",
  "report": {
    "id": "uuid",
    "version": 1,
    "description": "Streetlights along the walkway in front of Male Dorm 5 are out and very dark at night.",
    "location": {
      "locationId": "uuid-or-null",
      "locationName": "Male Dormitory 5 Walkway",
      "detailNote": "West entrance near bicycle rack",
      "lat": 13.8476,
      "lng": 100.5697
    },
    "images": [
      {
        "id": "img-uuid",
        "mimeType": "image/jpeg",
        "url": "http://api:8080/internal/media/..."
      }
    ],
    "submittedAt": "2026-11-26T11:30:00Z"
  },
  "activeCategories": [
    { "id": "cat-uuid", "name": "Electrical & Lighting", "description": "Streetlights, wiring, power outlets" }
  ],
  "activeDepartments": [
    { "id": "dept-uuid", "name": "Buildings & Grounds", "responsibilityScope": "Campus lighting, structural repairs" }
  ],
  "activeTicketShortlist": [
    {
      "ticketId": "tkt-uuid",
      "ticketNumber": "TKT-2026-00014",
      "status": "CONFIRMED",
      "title": "Walkway lights out near Male Dorm 5",
      "summary": "Multiple walkway lights not functioning after 19:00.",
      "categoryId": "cat-uuid",
      "severity": "HIGH",
      "locationName": "Male Dormitory 5",
      "lat": 13.8475,
      "lng": 100.5698,
      "confirmedAt": "2026-11-26T09:10:00Z",
      "recentReportExcerpts": [
        "Walkway is pitch dark near the dorm entrance."
      ]
    }
  ]
}
```

> **Invariant (`BR-AI-002`):** `apps/api` MUST ONLY include Active Tickets (`CONFIRMED`, `IN_PROGRESS`, `WAITING_INFORMATION`) in `activeTicketShortlist`. Final Tickets (`RESOLVED`) must never be sent as candidates.

#### Success Response (`200 OK`)
```json
{
  "modelVersion": "jev-multimodal-2026-11",
  "generatedReportTitle": "Dark walkway lights outside Male Dorm 5",
  "classification": {
    "suggestedCategoryId": "cat-uuid",
    "confidence": 92,
    "alternativeCategoryId": "cat-safety-uuid"
  },
  "severity": {
    "suggestedSeverity": "HIGH",
    "rationale": "Unlit walkway outside a dormitory creates a nighttime pedestrian safety risk."
  },
  "recommendedDepartmentIds": ["dept-uuid"],
  "matching": {
    "decision": "MATCHED",
    "topCandidateTicketId": "tkt-uuid",
    "topSimilarity": 89,
    "candidates": [
      { "ticketId": "tkt-uuid", "similarity": 89 }
    ],
    "ticketCandidateDraft": null
  }
}
```

When `matching.decision == "NO_MATCH"`, `topCandidateTicketId` and `topSimilarity` are `null`, `candidates` is `[]` (or below-threshold references), and `ticketCandidateDraft` MUST be populated (`BR-AI-005`):

```json
"ticketCandidateDraft": {
  "suggestedTitle": "Walkway streetlights out at Male Dorm 5",
  "suggestedSummary": "Report indicates multiple exterior walkway lights near the west entrance of Male Dorm 5 are not working at night.",
  "suggestedCategoryId": "cat-uuid",
  "suggestedSeverity": "HIGH",
  "recommendedDepartmentIds": ["dept-uuid"]
}
```

#### Response Validation Rules
* `suggestedCategoryId` and `alternativeCategoryId` (if non-null) MUST exist in the request's `activeCategories`.
* Every ID in `recommendedDepartmentIds` MUST exist in the request's `activeDepartments`.
* Every `ticketId` in `matching.candidates` / `topCandidateTicketId` MUST exist in `activeTicketShortlist`.
* `confidence` and `similarity` MUST be integers in `0..100`.

---

## 4. Re-evaluate Ticket (`UC-AI-003`)

### `POST /v1/tickets/reevaluate`

Invoked when a new Confirmed Report is attached to an Active Ticket (`UC-REV-002`) or when a Reviewer corrects a Confirmed Report (`UC-REV-005`).

#### Request Body
```json
{
  "requestId": "req_01J...",
  "ticket": {
    "id": "tkt-uuid",
    "currentTitle": "Walkway lights out near Male Dorm 5",
    "currentSummary": "Multiple walkway lights not functioning after 19:00.",
    "currentCategoryId": "cat-uuid",
    "currentSeverity": "HIGH",
    "currentDepartmentIds": ["dept-uuid"]
  },
  "confirmedReports": [
    {
      "id": "rpt-1",
      "description": "Walkway is pitch dark near the dorm entrance.",
      "locationName": "Male Dormitory 5",
      "submittedAt": "2026-11-26T09:00:00Z"
    },
    {
      "id": "rpt-2",
      "description": "Exposed sparking wire seen at base of broken lamp post.",
      "locationName": "Male Dormitory 5 Walkway",
      "submittedAt": "2026-11-26T11:30:00Z"
    }
  ],
  "activeDepartments": [
    { "id": "dept-uuid", "name": "Buildings & Grounds", "responsibilityScope": "Campus lighting, electrical repairs" }
  ]
}
```

#### Success Response (`200 OK`)
```json
{
  "modelVersion": "jev-multimodal-2026-11",
  "suggestedTitle": "Broken walkway lights with exposed sparking wire at Male Dorm 5",
  "suggestedSummary": "Two confirmed reports indicate unlit walkway lamps outside Male Dorm 5, with the latest report noting an exposed sparking wire at the lamp post base.",
  "suggestedSeverity": "CRITICAL",
  "recommendedDepartmentIds": ["dept-uuid"],
  "rationale": "Upgraded from HIGH to CRITICAL due to direct electrical shock/fire hazard from exposed sparking wire (not report volume)."
}
```

> **Invariants (`BR-AI-013`, `BR-AI-015`):** Severity recommendations MUST be justified by physical hazard/impact content — never by report count alone. Each re-evaluation run is pinned to a specific `tickets.reevaluation_revision` (`ticket_ai_reevaluations.ticket_revision`), and `apps/api` updates only that `reevalId` row (`status = 'COMPLETED'`, `is_reviewed = false`) without mutating live Ticket fields or letting slower earlier runs supersede newer revisions. If this call fails or times out, `apps/api` records `ticket_ai_reevaluations(status = 'FAILED', error_message = ...)` and keeps the confirmed Report and existing Ticket data intact.

---

## 5. Error Response Format (`4xx` / `5xx`)

```json
{
  "error": {
    "code": "UPSTREAM_PROVIDER_TIMEOUT",
    "message": "JEV multimodal inference exceeded 15s timeout.",
    "retryable": true,
    "requestId": "req_01J..."
  }
}
```
