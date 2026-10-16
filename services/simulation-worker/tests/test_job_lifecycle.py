import pytest
from datetime import datetime, timedelta, timezone

from src.seeder.config import ScenarioConfig
from src.seeder.generator import generate_world
from src.simulation.demand import DemandConfig, SyntheticDemandGenerator
from src.simulation.engine import SimulationEngine
from src.simulation.jobs import InvalidJobStateTransitionError, JobStatus, SimulationJob


def test_job_state_transitions():
    start = datetime(2026, 10, 16, 8, 0, 0, tzinfo=timezone.utc)
    job = SimulationJob(
        run_id="run_lifecycle_test",
        scenario_id="fast-01",
        seed=42,
        start_time=start,
        end_time=start + timedelta(hours=24),
        current_virtual_time=start,
    )

    assert job.status == JobStatus.QUEUED

    job.start()
    assert job.status == JobStatus.RUNNING

    job.pause()
    assert job.status == JobStatus.PAUSED

    job.resume()
    assert job.status == JobStatus.RUNNING

    job.complete()
    assert job.status == JobStatus.SUCCEEDED

    # Cannot transition from terminal state
    with pytest.raises(InvalidJobStateTransitionError):
        job.start()


def test_engine_pause_and_resume():
    config = ScenarioConfig(scenario_id="pause_test", scenario_name="Pause Test", seed=42, store_count=1, sku_count=4)
    world = generate_world(config)
    start_time = datetime(2026, 10, 16, 8, 0, 0, tzinfo=timezone.utc)
    end_time = start_time + timedelta(hours=6)

    engine = SimulationEngine(
        run_id="run_pause_test",
        world=world,
        start_time=start_time,
        end_time=end_time,
        seed=42,
    )

    demand_gen = SyntheticDemandGenerator(
        config=DemandConfig(base_hourly_rate=10.0),
        catalog_skus=[s.model_dump() for s in world.skus],
        stores=[s.model_dump() for s in world.stores],
        service_zones=[z.model_dump() for z in world.service_zones],
        run_seed=42,
    )
    for arr in demand_gen.generate_orders(start_time, end_time, "run_pause_test"):
        engine.event_queue.push(arr)

    # Step through 5 events
    engine.job.start()
    for _ in range(5):
        engine.step()

    assert engine.event_store.count() == 5
    v_time_paused = engine.clock.now()

    # Pause
    engine.pause()
    assert engine.is_paused
    assert engine.job.status == JobStatus.PAUSED

    # Calling step while paused returns None
    assert engine.step() is None
    assert engine.event_store.count() == 5
    assert engine.clock.now() == v_time_paused

    # Resume and run to completion
    total = engine.resume()
    assert not engine.is_paused
    assert engine.job.status == JobStatus.SUCCEEDED
    assert total > 5


def test_engine_graceful_cancellation():
    config = ScenarioConfig(scenario_id="cancel_test", scenario_name="Cancel Test", seed=42, store_count=1, sku_count=4)
    world = generate_world(config)
    start = datetime(2026, 10, 16, 8, 0, 0, tzinfo=timezone.utc)

    engine = SimulationEngine(
        run_id="run_cancel_test",
        world=world,
        start_time=start,
        end_time=start + timedelta(hours=12),
        seed=42,
    )

    demand_gen = SyntheticDemandGenerator(
        config=DemandConfig(base_hourly_rate=15.0),
        catalog_skus=[s.model_dump() for s in world.skus],
        stores=[s.model_dump() for s in world.stores],
        service_zones=[z.model_dump() for z in world.service_zones],
        run_seed=42,
    )
    for arr in demand_gen.generate_orders(start, start + timedelta(hours=12), "run_cancel_test"):
        engine.event_queue.push(arr)

    engine.job.start()
    for _ in range(3):
        engine.step()

    assert engine.event_store.count() == 3

    # Cancel
    engine.cancel(reason="Emergency operator cancellation")
    assert engine.is_cancelled
    assert engine.job.status == JobStatus.CANCELLED
    assert engine.job.failure_reason == "Emergency operator cancellation"

    # Execution halts immediately
    assert engine.step() is None
    assert engine.event_store.count() == 3
