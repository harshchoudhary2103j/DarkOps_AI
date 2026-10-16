import json
from datetime import datetime, timedelta, timezone

from src.seeder.config import ScenarioConfig
from src.seeder.generator import generate_world
from src.simulation.demand import DemandConfig, SyntheticDemandGenerator
from src.simulation.engine import SimulationEngine


def _run_scenario_simulation(seed: int, run_id: str) -> tuple[str, int, list]:
    config = ScenarioConfig(
        scenario_id="det_test",
        scenario_name="Determinism Test",
        seed=seed,
        store_count=1,
        sku_count=4,
        supplier_count=2,
        history_days=14,
    )
    world = generate_world(config)
    start_time = datetime(2026, 10, 16, 8, 0, 0, tzinfo=timezone.utc)
    end_time = start_time + timedelta(hours=12)

    engine = SimulationEngine(
        run_id=run_id,
        world=world,
        start_time=start_time,
        end_time=end_time,
        seed=seed,
    )
    engine.schedule_supplier_deliveries()

    demand_gen = SyntheticDemandGenerator(
        config=DemandConfig(base_hourly_rate=8.0),
        catalog_skus=[s.model_dump() for s in world.skus],
        stores=[s.model_dump() for s in world.stores],
        service_zones=[z.model_dump() for z in world.service_zones],
        run_seed=seed,
    )
    arrivals = demand_gen.generate_orders(start_time, end_time, run_id)
    for arr in arrivals:
        engine.event_queue.push(arr)

    engine.run_all()
    events = engine.event_store.get_events()
    return engine.sha256_fingerprint(), len(events), events


def test_simulation_exact_determinism():
    seed = 42
    run_id = "run_det_eval"

    sha_1, count_1, events_1 = _run_scenario_simulation(seed, run_id)
    sha_2, count_2, events_2 = _run_scenario_simulation(seed, run_id)

    # 1. Total event count must be identical
    assert count_1 == count_2
    assert count_1 > 0

    # 2. SHA-256 fingerprint must be 100% identical
    assert sha_1 == sha_2

    # 3. Every single event payload and timestamp must match
    for e1, e2 in zip(events_1, events_2):
        assert e1.sequence_number == e2.sequence_number
        assert e1.event_type == e2.event_type
        assert e1.virtual_timestamp == e2.virtual_timestamp
        assert e1.payload == e2.payload


def test_simulation_seed_sensitivity():
    run_id = "run_det_eval"
    sha_1, count_1, _ = _run_scenario_simulation(42, run_id)
    sha_2, count_2, _ = _run_scenario_simulation(999, run_id)

    # Different seeds must produce different SHA-256 fingerprints
    assert sha_1 != sha_2
