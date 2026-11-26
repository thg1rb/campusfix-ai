from __future__ import annotations

import math
from collections.abc import Sequence


def l2_normalize(vector: Sequence[float]) -> list[float]:
    if not vector:
        raise ValueError("vector cannot be empty")
    norm = math.sqrt(sum(v * v for v in vector))
    if norm == 0.0:
        raise ValueError("cannot normalize a zero vector")
    return [float(v / norm) for v in vector]


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

    v_ticket = normalize(summary_weight * normalize(v_summary)
                         + reports_weight * centroid(report_vectors))
    """
    if summary_weight < 0 or reports_weight < 0 or (summary_weight + reports_weight) == 0:
        raise ValueError("weights must be non-negative and not both zero")

    norm_summary = l2_normalize(summary_vector)
    if not report_vectors:
        return norm_summary

    centroid = mean_centroid(report_vectors)
    if len(centroid) != len(norm_summary):
        raise ValueError("summary_vector and report_vectors must share the same dimension")

    blended = [
        summary_weight * s + reports_weight * r
        for s, r in zip(norm_summary, centroid, strict=True)
    ]
    return l2_normalize(blended)
