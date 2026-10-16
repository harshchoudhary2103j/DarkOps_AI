from datetime import datetime, timedelta, timezone

from src.evaluation.comparison import FairComparisonEngine
from src.evaluation.config import CostConfig, EvaluatorConfig
from src.evaluation.evaluator import EventDerivedEvaluator
from src.evaluation.models import MetricObjective, MetricStatus
from src.simulation.events import (
    EventType,
    PRIORITY_CUSTOMER_ORDER_ARRIVED,
    PRIORITY_ITEM_PICK,
    PRIORITY_PICKING_COMPLETED,
    PRIORITY_PICKING_STARTED,
    PRIORITY_STOCK_RESERVED,
    SimulationEvent,
)


def _make_events(num_orders: int, route_distance: float):
    t0 = datetime(2026, 10, 16, 10, 0, 0, tzinfo=timezone.utc)
    evts = []
    seq = 0
    for i in range(num_orders):
        oid = f"ord_{i:02d}"
        tid = f"task_{i:02d}"
        seq += 1
        evts.append(
            SimulationEvent(
                run_id="run_sim",
                event_id=f"e_{seq}",
                sequence_number=seq,
                event_type=EventType.CUSTOMER_ORDER_ARRIVED,
                virtual_timestamp=t0 + timedelta(minutes=i),
                priority=PRIORITY_CUSTOMER_ORDER_ARRIVED,
                payload={"order_id": oid, "lines": [{"sku_id": "SKU_1", "quantity": 2}]},
            )
        )
        seq += 1
        evts.append(
            SimulationEvent(
                run_id="run_sim",
                event_id=f"e_{seq}",
                sequence_number=seq,
                event_type=EventType.STOCK_RESERVED,
                virtual_timestamp=t0 + timedelta(minutes=i, seconds=30),
                priority=PRIORITY_STOCK_RESERVED,
                payload={"order_id": oid},
            )
        )
        seq += 1
        evts.append(
            SimulationEvent(
                run_id="run_sim",
                event_id=f"e_{seq}",
                sequence_number=seq,
                event_type=EventType.PICKING_STARTED,
                virtual_timestamp=t0 + timedelta(minutes=i, seconds=45),
                priority=PRIORITY_PICKING_STARTED,
                payload={"task_id": tid, "order_id": oid, "route": {"total_distance_meters": route_distance}},
            )
        )
        seq += 1
        evts.append(
            SimulationEvent(
                run_id="run_sim",
                event_id=f"e_{seq}",
                sequence_number=seq,
                event_type=EventType.ITEM_PICKED,
                virtual_timestamp=t0 + timedelta(minutes=i, seconds=60),
                priority=PRIORITY_ITEM_PICK,
                payload={"task_id": tid, "picked_quantity": 2},
            )
        )
        seq += 1
        evts.append(
            SimulationEvent(
                run_id="run_sim",
                event_id=f"e_{seq}",
                sequence_number=seq,
                event_type=EventType.PICKING_COMPLETED,
                virtual_timestamp=t0 + timedelta(minutes=i, seconds=90),
                priority=PRIORITY_PICKING_COMPLETED,
                payload={"task_id": tid, "order_id": oid},
            )
        )
    return evts


def test_zero_variance_on_identical_run_comparison():
    """
    Comparing two identical runs must yield exactly zero absolute difference
    and zero percentage change across all available KPIs.
    """
    evts = _make_events(num_orders=5, route_distance=100.0)
    evaluator = EventDerivedEvaluator()

    summary_a = evaluator.evaluate(
        run_id="run_A",
        scenario_id="scenario_urban_01",
        seed=42,
        events=evts,
        simulated_start_time=datetime(2026, 10, 16, 10, 0, 0, tzinfo=timezone.utc),
        simulated_end_time=datetime(2026, 10, 16, 11, 0, 0, tzinfo=timezone.utc),
    )
    summary_b = evaluator.evaluate(
        run_id="run_B",
        scenario_id="scenario_urban_01",
        seed=42,
        events=evts,
        simulated_start_time=datetime(2026, 10, 16, 10, 0, 0, tzinfo=timezone.utc),
        simulated_end_time=datetime(2026, 10, 16, 11, 0, 0, tzinfo=timezone.utc),
    )

    report = FairComparisonEngine.compare(baseline=summary_a, candidate=summary_b)

    assert report.scenario_compatible is True
    assert report.duration_compatible is True
    assert len(report.compatibility_warnings) == 0

    for m_name, comp in report.comparisons.items():
        if comp.improvement_status != "INCOMPARABLE" and comp.baseline_value is not None and comp.candidate_value is not None:
            assert comp.absolute_difference == 0.0, f"Nonzero delta on {m_name}"
            assert comp.improvement_status == "UNCHANGED"
            if comp.baseline_value != 0.0:
                assert comp.percentage_change == 0.0


def test_fair_comparison_improvement_direction_and_zero_baseline():
    """
    Tests that:
    1. Reducing route distance from 150m to 100m is detected as an improvement (LOWER_IS_BETTER).
    2. Zero baseline values gracefully emit percentage_change = None with explanation.
    """
    evts_baseline = _make_events(num_orders=4, route_distance=150.0)
    evts_candidate = _make_events(num_orders=4, route_distance=100.0)

    evaluator = EventDerivedEvaluator()
    t_start = datetime(2026, 10, 16, 10, 0, 0, tzinfo=timezone.utc)
    t_end = datetime(2026, 10, 16, 11, 0, 0, tzinfo=timezone.utc)

    summary_base = evaluator.evaluate("run_base", "scen_1", 42, evts_baseline, simulated_start_time=t_start, simulated_end_time=t_end)
    summary_cand = evaluator.evaluate("run_cand", "scen_1", 42, evts_candidate, simulated_start_time=t_start, simulated_end_time=t_end)

    report = FairComparisonEngine.compare(baseline=summary_base, candidate=summary_cand)

    # Total distance was 4 * 150 = 600m in baseline, and 4 * 100 = 400m in candidate
    dist_comp = report.comparisons["total_picker_travel_distance_meters"]
    assert dist_comp.baseline_value == 600.0
    assert dist_comp.candidate_value == 400.0
    assert dist_comp.absolute_difference == -200.0
    assert dist_comp.percentage_change == -33.33
    assert dist_comp.is_improvement is True
    assert dist_comp.improvement_status == "IMPROVED"

    # Stockout rate was 0 in both -> baseline is zero
    stockout_comp = report.comparisons["stockout_rate"]
    assert stockout_comp.baseline_value == 0.0
    assert stockout_comp.candidate_value == 0.0
    assert stockout_comp.percentage_change is None
    assert stockout_comp.percentage_change_explanation == "Baseline value is zero; percentage change undefined."


def test_incompatible_scenario_warning():
    """
    Verifies that comparing two runs with different scenario IDs emits a clear compatibility warning.
    """
    evts = _make_events(num_orders=2, route_distance=50.0)
    evaluator = EventDerivedEvaluator()
    t_start = datetime(2026, 10, 16, 10, 0, 0, tzinfo=timezone.utc)
    t_end = datetime(2026, 10, 16, 11, 0, 0, tzinfo=timezone.utc)

    s1 = evaluator.evaluate("run_1", "scen_urban", 42, evts, simulated_start_time=t_start, simulated_end_time=t_end)
    s2 = evaluator.evaluate("run_2", "scen_suburban", 42, evts, simulated_start_time=t_start, simulated_end_time=t_end)

    report = FairComparisonEngine.compare(baseline=s1, candidate=s2)
    assert report.scenario_compatible is False
    assert any("Scenario ID mismatch" in w for w in report.compatibility_warnings)
