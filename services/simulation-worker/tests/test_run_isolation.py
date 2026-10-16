from datetime import datetime, timedelta, timezone

from src.seeder.config import ScenarioConfig
from src.seeder.generator import generate_world
from src.simulation.demand import DemandConfig, SyntheticDemandGenerator
from src.simulation.engine import SimulationEngine


def test_concurrent_run_state_isolation():
    config = ScenarioConfig(scenario_id="iso_test", scenario_name="Isolation Test", seed=42, store_count=1, sku_count=4)
    world = generate_world(config)
    start_time = datetime(2026, 10, 16, 8, 0, 0, tzinfo=timezone.utc)
    end_time = start_time + timedelta(hours=6)

    # Initialize Run 1
    engine_1 = SimulationEngine(
        run_id="run_iso_001",
        world=world,
        start_time=start_time,
        end_time=end_time,
        seed=42,
    )

    # Initialize Run 2
    engine_2 = SimulationEngine(
        run_id="run_iso_002",
        world=world,
        start_time=start_time,
        end_time=end_time,
        seed=42,
    )

    store_id = world.stores[0].id
    sku_id = world.skus[0].id

    # Initial positions are equal
    pos_1_start = engine_1.state.get_position(store_id, sku_id).physical_on_hand
    pos_2_start = engine_2.state.get_position(store_id, sku_id).physical_on_hand
    assert pos_1_start == pos_2_start

    # Run heavy demand only on engine_1
    demand_gen = SyntheticDemandGenerator(
        config=DemandConfig(base_hourly_rate=50.0),
        catalog_skus=[s.model_dump() for s in world.skus],
        stores=[s.model_dump() for s in world.stores],
        service_zones=[z.model_dump() for z in world.service_zones],
        run_seed=42,
    )
    for arr in demand_gen.generate_orders(start_time, end_time, "run_iso_001"):
        engine_1.event_queue.push(arr)

    # Execute engine_1
    engine_1.run_all()

    # Assert engine_1 consumed inventory
    pos_1_end = engine_1.state.get_position(store_id, sku_id).physical_on_hand
    assert pos_1_end < pos_1_start

    # Engine 2 inventory MUST remain pristine and untouched
    pos_2_current = engine_2.state.get_position(store_id, sku_id).physical_on_hand
    assert pos_2_current == pos_2_start
    assert engine_2.event_store.count() == 0

    # Events in engine_1 must all be scoped to run_iso_001
    for event in engine_1.event_store.get_events():
        assert event.run_id == "run_iso_001"
