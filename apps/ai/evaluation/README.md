# KU Spot AI Evaluation Suite (`apps/ai/evaluation`)

This directory holds offline datasets, golden test cases, and benchmark scripts for evaluating **KU Spot** AI triage quality (`apps/ai`).

## Placement Rule

* Keep all datasets, fixtures, and benchmark runners here — **never** import `apps/ai/evaluation/` into the installed runtime package `apps/ai/src/ku_spot_ai/`.
* Never commit real student/staff PII or unredacted campus photos containing EXIF metadata into evaluation datasets. Use synthetic or anonymized Bangkhen Campus test cases.

## Evaluated Capabilities (Requirement Freeze 1)

1. **Category Classification (`BR-AI-007`, `BR-AI-008`):** Accuracy, Precision, Recall, and F1-score across active categories (starting with Buildings & Facilities, Electrical & Lighting, Cleanliness, Internet & IT, Safety, Other) plus calibration of `confidence` (`0..100`).
2. **Severity Assessment (`BR-AI-009`, `BR-AI-013`):** 4-class rubric (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) evaluated on physical hazard and impact content — verifying that report volume alone does not inflate severity.
3. **Duplicate / Active Ticket Matching (`BR-AI-001`..`005`):** Multimodal matching (Images + Description + Location + auxiliary Category/Time) distinguishing true `MATCHED` active incidents from distinct `NO_MATCH` incidents requiring a `Ticket Candidate`.
4. **Department Recommendation (`BR-AI-010`):** Multi-label Recall and Precision against Department responsibility scopes.
5. **Title & Summary Generation (`BR-AI-011`, `BR-AI-012`):** Conciseness, factual grounding (no hallucinated locations or hazards), and Thai/English readability.
6. **Latency & Schema Reliability:** p50/p95 latency within the `15s` provider budget and strict conformance to [contracts/ai-gateway.md](../../../contracts/ai-gateway.md).
