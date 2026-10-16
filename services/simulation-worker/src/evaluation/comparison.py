from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field

from src.evaluation.models import EvaluationSummary, MetricObjective, MetricStatus


class MetricComparison(BaseModel):
    """
    Comparison result for a single KPI between baseline and candidate runs.
    """
    model_config = ConfigDict(frozen=True)

    metric_name: str
    unit: str
    baseline_value: Optional[float] = None
    candidate_value: Optional[float] = None
    baseline_status: MetricStatus
    candidate_status: MetricStatus
    absolute_difference: Optional[float] = None
    percentage_change: Optional[float] = None
    percentage_change_explanation: Optional[str] = None
    objective: MetricObjective
    is_improvement: Optional[bool] = None
    improvement_status: str  # IMPROVED, DEGRADED, UNCHANGED, INCOMPARABLE


class ComparisonReport(BaseModel):
    """
    Comprehensive, auditable fair comparison report between two simulation runs.
    """
    model_config = ConfigDict(frozen=True)

    baseline_run_id: str
    candidate_run_id: str
    scenario_compatible: bool
    duration_compatible: bool
    cost_config_compatible: bool
    policy_variation_detected: bool
    comparisons: Dict[str, MetricComparison] = Field(default_factory=dict)
    compatibility_warnings: List[str] = Field(default_factory=list)
    disclaimer: str = "Simulated outcomes derived from synthetic scenarios — not verified real-world results."


class FairComparisonEngine:
    """
    Engine for fair, standardized comparison between simulation runs.
    Enforces scenario compatibility, formula parity, and division-by-zero safety.
    """

    @classmethod
    def compare(
        cls,
        baseline: EvaluationSummary,
        candidate: EvaluationSummary,
    ) -> ComparisonReport:
        warnings: List[str] = []

        # 1. Compatibility Validations
        scenario_compatible = (baseline.scenario_id == candidate.scenario_id)
        if not scenario_compatible:
            warnings.append(
                f"Scenario ID mismatch: baseline='{baseline.scenario_id}' vs candidate='{candidate.scenario_id}'."
            )

        # Duration compatibility (within 5% tolerance)
        b_dur = baseline.simulated_duration_seconds
        c_dur = candidate.simulated_duration_seconds
        duration_compatible = abs(b_dur - c_dur) <= (0.05 * max(1.0, b_dur))
        if not duration_compatible:
            warnings.append(
                f"Simulated duration mismatch: baseline={b_dur}s vs candidate={c_dur}s."
            )

        # Cost config compatibility
        cost_compatible = (
            baseline.cost_config.get("currency") == candidate.cost_config.get("currency")
            and baseline.cost_config.get("carrying_cost_per_unit_hour") == candidate.cost_config.get("carrying_cost_per_unit_hour")
            and baseline.cost_config.get("stockout_penalty_per_unit") == candidate.cost_config.get("stockout_penalty_per_unit")
        )
        if not cost_compatible:
            warnings.append(
                "Economic cost configuration or currency differs between baseline and candidate."
            )

        # Policy variation detection
        policy_variation = (
            baseline.policy_identifiers != candidate.policy_identifiers
            or baseline.policy_config != candidate.policy_config
        )

        # 2. Metric Comparisons
        comparisons: Dict[str, MetricComparison] = {}
        all_metrics = set(baseline.kpis.keys()).union(candidate.kpis.keys())

        for m_name in sorted(all_metrics):
            b_metric = baseline.kpis.get(m_name)
            c_metric = candidate.kpis.get(m_name)

            if not b_metric or not c_metric:
                comparisons[m_name] = MetricComparison(
                    metric_name=m_name,
                    unit=b_metric.unit if b_metric else (c_metric.unit if c_metric else ""),
                    baseline_value=b_metric.value if b_metric else None,
                    candidate_value=c_metric.value if c_metric else None,
                    baseline_status=b_metric.status if b_metric else MetricStatus.NOT_APPLICABLE,
                    candidate_status=c_metric.status if c_metric else MetricStatus.NOT_APPLICABLE,
                    objective=b_metric.objective if b_metric else (c_metric.objective if c_metric else MetricObjective.NEUTRAL),
                    improvement_status="INCOMPARABLE",
                )
                continue

            b_val = b_metric.value
            c_val = c_metric.value
            unit = b_metric.unit
            objective = b_metric.objective

            # Both metrics must be numeric and available to compute delta
            if (
                b_val is None
                or c_val is None
                or b_metric.status in (MetricStatus.NOT_APPLICABLE, MetricStatus.INSUFFICIENT_DATA, MetricStatus.INVALID_EVENT_STREAM)
                or c_metric.status in (MetricStatus.NOT_APPLICABLE, MetricStatus.INSUFFICIENT_DATA, MetricStatus.INVALID_EVENT_STREAM)
            ):
                comparisons[m_name] = MetricComparison(
                    metric_name=m_name,
                    unit=unit,
                    baseline_value=b_val,
                    candidate_value=c_val,
                    baseline_status=b_metric.status,
                    candidate_status=c_metric.status,
                    objective=objective,
                    improvement_status="INCOMPARABLE",
                )
                continue

            abs_diff = round(c_val - b_val, 4)

            # Division-by-zero protection on percentage change
            pct_change: Optional[float] = None
            pct_explanation: Optional[str] = None

            if b_val != 0.0:
                pct_change = round(((c_val - b_val) / abs(b_val)) * 100.0, 2)
            else:
                pct_explanation = "Baseline value is zero; percentage change undefined."

            # Determine improvement based on objective
            is_improvement: Optional[bool] = None
            improvement_status = "UNCHANGED"

            if abs_diff != 0.0:
                if objective == MetricObjective.HIGHER_IS_BETTER:
                    is_improvement = (abs_diff > 0)
                elif objective == MetricObjective.LOWER_IS_BETTER:
                    is_improvement = (abs_diff < 0)
                else:  # NEUTRAL
                    is_improvement = None

                if is_improvement is True:
                    improvement_status = "IMPROVED"
                elif is_improvement is False:
                    improvement_status = "DEGRADED"
                else:
                    improvement_status = "CHANGED"

            comparisons[m_name] = MetricComparison(
                metric_name=m_name,
                unit=unit,
                baseline_value=b_val,
                candidate_value=c_val,
                baseline_status=b_metric.status,
                candidate_status=c_metric.status,
                absolute_difference=abs_diff,
                percentage_change=pct_change,
                percentage_change_explanation=pct_explanation,
                objective=objective,
                is_improvement=is_improvement,
                improvement_status=improvement_status,
            )

        return ComparisonReport(
            baseline_run_id=baseline.run_id,
            candidate_run_id=candidate.run_id,
            scenario_compatible=scenario_compatible,
            duration_compatible=duration_compatible,
            cost_config_compatible=cost_compatible,
            policy_variation_detected=policy_variation,
            comparisons=comparisons,
            compatibility_warnings=warnings,
        )
