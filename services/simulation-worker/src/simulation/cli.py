import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

from src.seeder.config import ScenarioConfig
from src.seeder.generator import generate_world
from src.simulation.demand import DemandConfig, SyntheticDemandGenerator
from src.simulation.engine import SimulationEngine


def run_simulation_command(args: argparse.Namespace) -> int:
    scenario_path = args.scenario
    if not os.path.exists(scenario_path):
        print(f"Error: Scenario config file not found: {scenario_path}", file=sys.stderr)
        return 1

    with open(scenario_path, "r", encoding="utf-8") as f:
        scenario_data = json.load(f)

    if args.seed is not None:
        scenario_data["seed"] = args.seed
    config = ScenarioConfig(**scenario_data)
    seed = config.seed
    run_id = args.run_id or f"run_{config.scenario_id}_{seed}"
    duration_hours = args.duration_hours or 24.0

    print(f"[simulation] Initializing world for scenario '{config.scenario_id}', seed={seed}...")
    world = generate_world(config)

    start_time = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    end_time = start_time + timedelta(hours=duration_hours)

    print(f"[simulation] Initializing SimulationEngine: run_id={run_id}")
    print(f"[simulation] Virtual Horizon: {start_time.isoformat()} -> {end_time.isoformat()} ({duration_hours}h)")

    engine = SimulationEngine(
        run_id=run_id,
        world=world,
        start_time=start_time,
        end_time=end_time,
        seed=seed,
        config_snapshot=scenario_data,
    )

    # 1. Schedule supplier deliveries
    po_count = engine.schedule_supplier_deliveries()
    print(f"[simulation] Scheduled {po_count} planned supplier deliveries into virtual queue.")

    # 2. Generate and enqueue synthetic customer demand
    demand_cfg = DemandConfig()
    demand_gen = SyntheticDemandGenerator(
        config=demand_cfg,
        catalog_skus=[s.model_dump() for s in world.skus],
        stores=[s.model_dump() for s in world.stores],
        service_zones=[z.model_dump() for z in world.service_zones],
        run_seed=seed,
    )
    arrivals = demand_gen.generate_orders(start_time, end_time, run_id)
    print(f"[simulation] Generated {len(arrivals)} customer order arrivals via Poisson process.")

    for arrival in arrivals:
        engine.event_queue.push(arrival)

    # 3. Execute simulation
    print(f"[simulation] Executing discrete-event simulation run...")
    start_wall = datetime.now(timezone.utc)
    processed_count = engine.run_all()
    wall_duration = (datetime.now(timezone.utc) - start_wall).total_seconds()

    print(f"[simulation] Run {run_id} completed: {processed_count} events processed in {wall_duration:.2f}s wall-clock time.")
    print(f"[simulation] Virtual clock advanced to: {engine.clock.format_iso()}")

    # 4. Fingerprint & Export
    sha = engine.sha256_fingerprint()
    print(f"[simulation] Canonical Event-Stream SHA-256: {sha}")

    if args.output:
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(engine.event_store.canonical_event_stream())
        print(f"[simulation] Canonical event log saved to: {args.output}")

    if args.db_url:
        print(f"[simulation] Persisting run and events to PostgreSQL...")
        engine.job.persist_to_postgres(args.db_url)
        engine.event_store.persist_to_postgres(args.db_url)
        print(f"[simulation] Persistence complete.")

    return 0


def verify_determinism_command(args: argparse.Namespace) -> int:
    scenario_path = args.scenario
    seed = args.seed or 42
    print(f"[simulation:test] Verifying determinism for {scenario_path} with seed {seed}...")

    with open(scenario_path, "r", encoding="utf-8") as f:
        scenario_data = json.load(f)

    config = ScenarioConfig(**scenario_data)

    def run_once(run_seed: int, r_id: str) -> tuple[str, int]:
        run_data = dict(scenario_data)
        run_data["seed"] = run_seed
        run_config = ScenarioConfig(**run_data)
        world = generate_world(run_config)
        start_time = datetime(2026, 10, 16, 8, 0, 0, tzinfo=timezone.utc)
        end_time = start_time + timedelta(hours=24)

        engine = SimulationEngine(run_id=r_id, world=world, start_time=start_time, end_time=end_time, seed=run_seed)
        engine.schedule_supplier_deliveries()

        demand_gen = SyntheticDemandGenerator(
            config=DemandConfig(),
            catalog_skus=[s.model_dump() for s in world.skus],
            stores=[s.model_dump() for s in world.stores],
            service_zones=[z.model_dump() for z in world.service_zones],
            run_seed=run_seed,
        )
        for arrival in demand_gen.generate_orders(start_time, end_time, r_id):
            engine.event_queue.push(arrival)

        engine.run_all()
        return engine.sha256_fingerprint(), engine.event_store.count()

    # Run A
    sha_a, count_a = run_once(seed, f"run_det_{seed}")
    # Run B
    sha_b, count_b = run_once(seed, f"run_det_{seed}")

    print(f"Run A: Events={count_a}, SHA={sha_a}")
    print(f"Run B: Events={count_b}, SHA={sha_b}")

    if sha_a != sha_b or count_a != count_b:
        print(f"[simulation:test] FAILED: Repeated runs with seed {seed} produced different event streams!", file=sys.stderr)
        return 1

    print(f"[simulation:test] PASSED: Identical seed produced 100% byte-for-byte identical canonical event streams.")

    # Run C with different seed
    alt_seed = seed + 999
    sha_c, count_c = run_once(alt_seed, f"run_det_c_{alt_seed}")
    print(f"Run C (seed={alt_seed}): Events={count_c}, SHA={sha_c}")

    if sha_c == sha_a:
        print(f"[simulation:test] FAILED: Different seed produced identical event streams!", file=sys.stderr)
        return 1

    print(f"[simulation:test] PASSED: Changing seed produced distinct event streams.")
    return 0


def main():
    parser = argparse.ArgumentParser(description="DarkOps AI Discrete-Event Simulation Engine CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # run command
    run_parser = subparsers.add_parser("run", help="Run a simulation scenario")
    run_parser.add_argument("--scenario", required=True, help="Path to scenario JSON configuration")
    run_parser.add_argument("--seed", type=int, default=42, help="Deterministic random seed")
    run_parser.add_argument("--run-id", help="Explicit run ID (default generated from scenario and seed)")
    run_parser.add_argument("--duration-hours", type=float, default=24.0, help="Simulated duration in hours")
    run_parser.add_argument("--output", help="Path to save canonical event log JSON")
    run_parser.add_argument("--db-url", help="PostgreSQL connection string for persistence")

    # verify-determinism command
    det_parser = subparsers.add_parser("verify-determinism", help="Verify seed determinism across runs")
    det_parser.add_argument("--scenario", required=True, help="Path to scenario JSON configuration")
    det_parser.add_argument("--seed", type=int, default=42, help="Base seed to verify")

    args = parser.parse_args()
    if args.command == "run":
        sys.exit(run_simulation_command(args))
    elif args.command == "verify-determinism":
        sys.exit(verify_determinism_command(args))


if __name__ == "__main__":
    main()
