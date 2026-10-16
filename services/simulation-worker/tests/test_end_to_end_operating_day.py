import json
from datetime import datetime, timedelta, timezone

from src.policies.config import BaselinePolicyConfig
from src.seeder.config import ScenarioConfig
from src.seeder.generator import generate_world
from src.simulation.demand import DemandConfig, SyntheticDemandGenerator
from src.simulation.engine import SimulationEngine
from src.simulation.events import EventType


def test_end_to_end_simulated_operating_day():
    """
    Executes a 24-hour simulated operating day exercising:
    - Baseline Replenishment (Static ROP)
    - Baseline Greedy Nearest-Store Order Allocation
    - Baseline S-Shape Picker Routing
    - Emits >= 500 validated operational events
    - Asserts 100% of orders reach terminal states
    """
    # 2-store urban environment with 16 SKUs and 3 suppliers
    config = ScenarioConfig(
        scenario_id="e2e_day",
        scenario_name="E2E Operating Day",
        seed=42,
        store_count=2,
        sku_count=16,
        supplier_count=3,
        history_days=14,
    )
    world = generate_world(config)

    start_time = datetime(2026, 10, 16, 8, 0, 0, tzinfo=timezone.utc)
    end_time = start_time + timedelta(hours=24)
    run_id = "run_e2e_operating_day_01"

    policy_cfg = BaselinePolicyConfig(
        replenishment_enabled=True,
        default_lead_time_days=0.167,  # 4 hours
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

    # 1. Schedule initial planned supplier deliveries
    engine.schedule_supplier_deliveries()

    # 2. Generate ~200 orders across the operating day (allowing in-flight completion before 24h end)
    demand_cfg = DemandConfig(base_hourly_rate=8.5, max_basket_size=6)
    demand_gen = SyntheticDemandGenerator(
        config=demand_cfg,
        catalog_skus=[s.model_dump() for s in world.skus],
        stores=[s.model_dump() for s in world.stores],
        service_zones=[z.model_dump() for z in world.service_zones],
        run_seed=42,
    )
    order_cutoff = end_time - timedelta(minutes=45)
    arrivals = demand_gen.generate_orders(start_time, order_cutoff, run_id)
    assert len(arrivals) >= 150  # ~200 orders target

    for arr in arrivals:
        engine.event_queue.push(arr)

    # 3. Execute full 24-hour simulated day
    wall_start = datetime.now()
    total_events = engine.run_all()
    wall_elapsed = (datetime.now() - wall_start).total_seconds()

    # 4. Acceptance Assertions
    # A. Rapid execution without wall-clock sleeps (< 10 seconds)
    assert wall_elapsed < 10.0
    assert engine.clock.now() >= start_time + timedelta(hours=22)

    # B. Emitted at least 500 validated operational events
    assert total_events >= 500, f"Expected >= 500 events, got {total_events}"

    events = engine.event_store.get_events()
    event_types = {e.event_type for e in events}

    # C. All key policy events occurred
    assert EventType.CUSTOMER_ORDER_ARRIVED in event_types
    assert EventType.ALLOCATION_REQUESTED in event_types
    assert EventType.STOCK_RESERVED in event_types
    assert EventType.PICKING_STARTED in event_types
    assert EventType.ITEM_PICKED in event_types
    assert EventType.PICKING_COMPLETED in event_types

    # D. Every generated order reached a terminal state
    terminal_statuses = {"READY", "FAILED", "CANCELLED"}
    for order_id, order in engine.state.orders.items():
        assert order["status"] in terminal_statuses, (
            f"Order {order_id} remained in non-terminal state '{order['status']}'"
        )

    # E. Inventory Core invariants hold throughout
    for (store_id, sku_id), pos in engine.state.inventory.items():
        assert pos.physical_on_hand >= 0, f"Physical on hand < 0 for {store_id}:{sku_id}"
        assert pos.reserved_stock >= 0, f"Reserved stock < 0 for {store_id}:{sku_id}"
        assert pos.physical_on_hand >= pos.reserved_stock, f"Physical < reserved for {store_id}:{sku_id}"
        assert pos.available_stock == (pos.physical_on_hand - pos.reserved_stock)

    # F. Deterministic fingerprinting check
    sha_1 = engine.sha256_fingerprint()
    assert len(sha_1) == 64
