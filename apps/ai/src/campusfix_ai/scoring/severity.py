from __future__ import annotations

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
        risk_score = w_safety * safety_risk
                   + w_impact * operational_impact
                   + w_scope  * affected_scope
                   + w_urgency * urgency
    Weights are normalized to sum to 1.0 so risk_score always lies in [0.0, 3.0].
    If safety_override is enabled and safety_risk == 3, level is forced to CRITICAL.
    """
    w = weights or SeverityWeights()
    t = thresholds or SeverityThresholds()
    t.validate()

    if (
        w.safety_risk < 0
        or w.operational_impact < 0
        or w.affected_scope < 0
        or w.urgency < 0
    ):
        raise ValueError("severity weights must be non-negative")

    total_weight = (
        w.safety_risk + w.operational_impact + w.affected_scope + w.urgency
    )
    if total_weight <= 0:
        raise ValueError("severity weights sum must be positive")

    clamped = SeverityFactors(
        safety_risk=_clamp_factor(factors.safety_risk),
        operational_impact=_clamp_factor(factors.operational_impact),
        affected_scope=_clamp_factor(factors.affected_scope),
        urgency=_clamp_factor(factors.urgency),
    )

    risk_score = round(
        (
            w.safety_risk * clamped.safety_risk
            + w.operational_impact * clamped.operational_impact
            + w.affected_scope * clamped.affected_scope
            + w.urgency * clamped.urgency
        )
        / total_weight,
        4,
    )

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
