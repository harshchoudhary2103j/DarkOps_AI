from datetime import datetime, timedelta, timezone

from src.evaluation.evaluator import EventDerivedEvaluator
from src.evaluation.models import MetricStatus
from src.policies.config import BaselinePolicyConfig
from src.seeder.config import ScenarioConfig
from src.seeder.generator import generate_world
from src.simulation.demand import DemandConfig, SyntheticDemandGenerator
from src.simulation.engine import SimulationEngine


def test_evaluate_e2e_simulated_operating_day():
    """
    Executes a 24-hour simulation run emitting >2,000 events,
    evaluates all KPIs strictly from the recorded event stream,
    and asserts metric data quality and integrity.
    """
    config = ScenarioConfig(
        scenario_id="e2e_eval_scenario",
        scenario_name="E2E Evaluation Scenario",
        seed=42,
        store_count=2,
        sku_count=16,
        supplier_count=3,
        history_days=14,
    )
    world = generate_world(config)

    start_time = datetime(2026, 10, 16, 8, 0, 0, tzinfo=timezone.utc)
    end_time = start_time + timedelta(hours=24)
    run_id = "run_eval_e2e_01"

    policy_cfg = BaselinePolicyConfig(
        replenishment_enabled=True,
        default_lead_time_days=0.167,
        dispatch_delay_seconds=30.0,
    )

    engine = SimulationEngine(
        run_id=run_id,
        world=world,
        start_time=start_time,
        end_time=end_time,
        seed=42,
        policy_config=policy_cfg,
        enable_baseline_policies=True,
    )
    engine.schedule_supplier_deliveries()

    demand_cfg = DemandConfig(base_hourly_rate=8.5, max_basket_size=6)
    demand_gen = SyntheticDemandGenerator(
        config=demand_cfg,
        catalog_skus=[s.model_dump() for s in world.skus],
        stores=[s.model_dump() for s in world.stores],
        service_zones=[z.model_dump() for z in world.service_zones],
        run_seed=42,
    )
    order_cutoff = end_time - timedelta(minutes=45)
    for arr in demand_gen.generate_orders(start_time, order_cutoff, run_id):
        engine.event_queue.push(arr)

    # Run simulation
    total_events = engine.run_all()
    assert total_events >= 500

    events = engine.event_store.get_events()
    assert len(events) >= 1000  # Expected ~2,100 events

    # Evaluate KPIs strictly from the recorded event stream
    evaluator = EventDerivedEvaluator()
    summary = evaluator.evaluate(
        run_id=run_id,
        scenario_id=config.scenario_id,
        seed=42,
        events=events,
        simulated_start_time=start_time,
        simulated_end_time=end_time,
        policy_identifiers=["baseline_policies_v1"],
        policy_config=policy_cfg.model_dump(),
        initial_physical_stock=1000,
    )

    # Assert evaluation structure
    assert summary.run_id == run_id
    assert summary.event_count == len(events)
    assert summary.simulated_duration_seconds == 86400.0
    assert summary.evaluator_version == "1.0.0"
    assert "Simulated outcomes derived from synthetic scenarios" in summary.disclaimer

    kpis = summary.kpis

    # 1. Fulfillment KPIs
    assert kpis["order_fill_rate"].status == MetricStatus.AVAILABLE
    assert 85.0 <= kpis["order_fill_rate"].value <= 98.0
    assert kpis["line_fill_rate"].status == MetricStatus.AVAILABLE
    assert kpis["unit_fill_rate"].status == MetricStatus.AVAILABLE
    assert kpis["stockout_rate"].status == MetricStatus.AVAILABLE
    assert kpis["stockout_incidents_count"].value > 0

    # 2. Operational Efficiency KPIs
    assert kpis["picking_duration_seconds"].status == MetricStatus.AVAILABLE
    assert kpis["picking_duration_seconds"].value > 0
    assert kpis["total_picker_travel_distance_meters"].status == MetricStatus.AVAILABLE
    assert kpis["total_picker_travel_distance_meters"].value > 500.0
    assert kpis["order_turnaround_time_seconds"].status == MetricStatus.AVAILABLE
    assert kpis["order_turnaround_time_seconds"].value > 0
    assert kpis["allocation_latency_seconds"].status == MetricStatus.AVAILABLE

    # 3. Economic KPIs
    assert kpis["inventory_holding_cost"].status == MetricStatus.AVAILABLE
    assert kpis["inventory_holding_cost"].value > 0
    assert kpis["purchase_order_transaction_cost"].status == MetricStatus.AVAILABLE
    assert kpis["purchase_order_transaction_cost"].value > 0
    assert kpis["estimated_stockout_penalty"].status == MetricStatus.AVAILABLE
    assert kpis["expiry_waste_cost"].status == MetricStatus.NOT_APPLICABLE

    # 4. Workload KPIs
    assert kpis["peak_queue_depth"].status == MetricStatus.AVAILABLE
    assert kpis["peak_queue_depth"].value >= 1
    assert kpis["backlog_order_hours"].status == MetricStatus.AVAILABLE
    assert kpis["backlog_order_hours"].value > 0
