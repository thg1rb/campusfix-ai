from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

SeverityLevel = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]

THRESHOLD_CRITICAL = 2.35
THRESHOLD_HIGH = 1.60
THRESHOLD_MEDIUM = 0.80


@dataclass(frozen=True)
class SeverityFactors:
    safety_risk: int
    operational_impact: int
    affected_scope: int
    urgency: int


@dataclass(frozen=True)
class SeverityWeights:
    safety_risk: float = 0.40
    operational_impact: float = 0.25
    affected_scope: float = 0.20
    urgency: float = 0.15


@dataclass(frozen=True)
class SeverityThresholds:
    medium: float = THRESHOLD_MEDIUM
    high: float = THRESHOLD_HIGH
    critical: float = THRESHOLD_CRITICAL

    def validate(self) -> None:
        if not (
            math.isfinite(self.medium)
            and math.isfinite(self.high)
            and math.isfinite(self.critical)
        ):
            raise ValueError("severity thresholds must be finite numbers")
        if not (0.0 < self.medium < self.high < self.critical <= 3.0):
            raise ValueError(
                "severity thresholds must satisfy 0 < medium < high < critical <= 3.0"
            )


@dataclass(frozen=True)
class ComputedSeverity:
    level: SeverityLevel
    risk_score: float
    factors: SeverityFactors
    safety_override_triggered: bool


def _clamp_factor(value: int) -> int:
    return max(0, min(3, int(value)))


def compute_severity(
    factors: SeverityFactors,
    *,
    weights: SeverityWeights | None = None,
    thresholds: SeverityThresholds | None = None,
    safety_override: bool = True,
) -> ComputedSeverity:
    """Deterministically compute SeverityLevel from 4 scored risk factors (0-3).

    Formula:
        risk_score = round(
            w_safety * safety_risk
            + w_impact * operational_impact
            + w_scope  * affected_scope
            + w_urgency * urgency,
            4,
        )
    Weights are scaled by their maximum value before summing so arbitrarily large
    finite weights never overflow, then normalized to sum to 1.0 so risk_score
    always lies in [0.0, 3.0]. Threshold comparisons are evaluated against the
    4-decimal rounded risk_score so the returned level always matches the returned
    risk_score. If safety_override is enabled and safety_risk == 3, level is
    forced to CRITICAL.
    """
    w = weights or SeverityWeights()
    t = thresholds or SeverityThresholds()
    t.validate()

    raw_weights = (
        w.safety_risk,
        w.operational_impact,
        w.affected_scope,
        w.urgency,
    )
    if not all(math.isfinite(val) for val in raw_weights):
        raise ValueError("severity weights must be finite numbers")
    if any(val < 0 for val in raw_weights):
        raise ValueError("severity weights must be non-negative")

    max_weight = max(raw_weights)
    if max_weight <= 0:
        raise ValueError("severity weights sum must be positive")

    s_safety = w.safety_risk / max_weight
    s_impact = w.operational_impact / max_weight
    s_scope = w.affected_scope / max_weight
    s_urgency = w.urgency / max_weight
    total_scaled = s_safety + s_impact + s_scope + s_urgency

    clamped = SeverityFactors(
        safety_risk=_clamp_factor(factors.safety_risk),
        operational_impact=_clamp_factor(factors.operational_impact),
        affected_scope=_clamp_factor(factors.affected_scope),
        urgency=_clamp_factor(factors.urgency),
    )

    raw_score = (
        s_safety * clamped.safety_risk
        + s_impact * clamped.operational_impact
        + s_scope * clamped.affected_scope
        + s_urgency * clamped.urgency
    ) / total_scaled
    risk_score = round(raw_score, 4)

    override_triggered = bool(safety_override and clamped.safety_risk == 3)

    if override_triggered or risk_score >= t.critical:
        level: SeverityLevel = "CRITICAL"
    elif risk_score >= t.high:
        level = "HIGH"
    elif risk_score >= t.medium:
        level = "MEDIUM"
    else:
        level = "LOW"

    return ComputedSeverity(
        level=level,
        risk_score=risk_score,
        factors=clamped,
        safety_override_triggered=override_triggered,
    )
