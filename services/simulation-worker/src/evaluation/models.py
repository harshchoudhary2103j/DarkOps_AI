from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class MetricStatus(str, Enum):
    AVAILABLE = "AVAILABLE"
    ZERO = "ZERO"
    NOT_APPLICABLE = "NOT_APPLICABLE"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"
    INVALID_EVENT_STREAM = "INVALID_EVENT_STREAM"


class MetricObjective(str, Enum):
    HIGHER_IS_BETTER = "HIGHER_IS_BETTER"
    LOWER_IS_BETTER = "LOWER_IS_BETTER"
    NEUTRAL = "NEUTRAL"


class MetricValue(BaseModel):
    """
    Standardized, verifiable metric container with full audit lineage.
    """
    model_config = ConfigDict(frozen=True)

    metric_name: str
    value: Optional[float] = None
    unit: str
    formula_ref: str
    status: MetricStatus
    objective: MetricObjective = MetricObjective.NEUTRAL
    numerator: Optional[float] = None
    denominator: Optional[float] = None
    sample_count: Optional[int] = None
    mean: Optional[float] = None
    median: Optional[float] = None
    warnings: List[str] = Field(default_factory=list)


class EvaluationSummary(BaseModel):
    """
    Reproducible, standardized evaluation summary of a simulation run.
    """
    model_config = ConfigDict(frozen=True)

    evaluation_id: str
    run_id: str
    scenario_id: str
    seed: int
    status: str
    simulated_duration_seconds: float
    evaluator_version: str
    formula_version: str
    evaluated_at: str
    event_count: int
    policy_identifiers: List[str] = Field(default_factory=list)
    policy_config: Dict[str, Any] = Field(default_factory=dict)
    cost_config: Dict[str, Any] = Field(default_factory=dict)
    kpis: Dict[str, MetricValue] = Field(default_factory=dict)
    data_quality_warnings: List[str] = Field(default_factory=list)
    disclaimer: str = "Simulated outcomes derived from synthetic scenarios — not verified real-world results."
