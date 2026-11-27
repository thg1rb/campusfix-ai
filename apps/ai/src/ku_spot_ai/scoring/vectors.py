from __future__ import annotations

import math
from collections.abc import Sequence


def _validated_floats(vector: Sequence[float]) -> list[float]:
    if not vector:
        raise ValueError("vector cannot be empty")
    floats: list[float] = []
    for raw in vector:
        value = float(raw)
        if not math.isfinite(value):
            raise ValueError("vector values must be finite")
        floats.append(value)
    return floats


def l2_normalize(vector: Sequence[float]) -> list[float]:
    """Scale before squaring so very large or tiny finite vectors never overflow/underflow."""
    floats = _validated_floats(vector)
    max_abs = max(abs(v) for v in floats)
    if max_abs == 0.0:
        raise ValueError("cannot normalize a zero vector")

    scaled = [v / max_abs for v in floats]
    scaled_norm = math.sqrt(sum(x * x for x in scaled))
    if not math.isfinite(scaled_norm) or scaled_norm == 0.0:
        raise ValueError("cannot normalize vector")
    return [float(x / scaled_norm) for x in scaled]


def mean_centroid(vectors: Sequence[Sequence[float]]) -> list[float]:
    if not vectors:
        raise ValueError("vectors cannot be empty")
    dim = len(vectors[0])
    if dim == 0:
        raise ValueError("vectors cannot have zero dimension")
    for vec in vectors:
        if len(vec) != dim:
            raise ValueError("all vectors must share the same dimension")
    accum = [0.0] * dim
    for vec in vectors:
        normed = l2_normalize(vec)
        for idx, value in enumerate(normed):
            accum[idx] += value
    return l2_normalize(accum)


def weighted_blend(
    summary_vector: Sequence[float],
    report_vectors: Sequence[Sequence[float]],
    *,
    summary_weight: float = 0.6,
    reports_weight: float = 0.4,
) -> list[float]:
    """Compute a unit-length Ticket vector blending summary and report centroid vectors.

    v_ticket = normalize(w_s * normalize(v_summary) + w_r * centroid(report_vectors))
    """
    if not (math.isfinite(summary_weight) and math.isfinite(reports_weight)):
        raise ValueError("weights must be finite")
    if summary_weight < 0 or reports_weight < 0:
        raise ValueError("weights must be non-negative and not both zero")
    max_weight = max(summary_weight, reports_weight)
    if max_weight == 0.0:
        raise ValueError("weights must be non-negative and not both zero")

    sw = summary_weight / max_weight
    rw = reports_weight / max_weight
    total = sw + rw
    norm_sw = sw / total
    norm_rw = rw / total

    norm_summary = l2_normalize(summary_vector)
    if not report_vectors:
        return norm_summary

    centroid = mean_centroid(report_vectors)
    if len(centroid) != len(norm_summary):
        raise ValueError("summary_vector and report_vectors must share the same dimension")

    blended = [norm_sw * s + norm_rw * r for s, r in zip(norm_summary, centroid, strict=True)]
    return l2_normalize(blended)
