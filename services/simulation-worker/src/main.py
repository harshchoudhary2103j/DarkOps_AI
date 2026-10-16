import os
import signal
import sys
import time
from datetime import datetime, timezone

from src.seeder.config import ScenarioConfig
from src.seeder.generator import generate_world
from src.simulation.demand import DemandConfig, SyntheticDemandGenerator
from src.simulation.engine import SimulationEngine

HEARTBEAT_FILE = os.environ.get("HEARTBEAT_FILE", "/tmp/worker_heartbeat")
running = True


def signal_handler(signum, frame):
    global running
    print(f"[simulation-worker] Received signal {signum}, initiating graceful shutdown...")
    running = False


def update_heartbeat():
    try:
        with open(HEARTBEAT_FILE, "w", encoding="utf-8") as f:
            f.write(datetime.now(timezone.utc).isoformat())
    except Exception as e:
        print(f"[simulation-worker] Failed to update heartbeat: {e}", file=sys.stderr)


def poll_and_execute_job(database_url: str) -> bool:
    """
    Polls simulation_runs for queued jobs and executes them.
    Uses SELECT ... FOR UPDATE SKIP LOCKED to prevent duplicate execution across workers.
    """
    try:
        import psycopg2
    except ImportError:
        return False

    try:
        conn = psycopg2.connect(database_url)
    except Exception:
        return False

    job_to_run = None
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, scenario_id, seed, start_time, end_time, config_snapshot
                FROM simulation_runs
                WHERE status = 'QUEUED'
                ORDER BY created_at ASC
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            """)
            row = cur.fetchone()
            if row:
                run_id, scenario_id, seed, start_time, end_time, config_snapshot = row
                cur.execute(
                    "UPDATE simulation_runs SET status = 'RUNNING', updated_at = NOW() WHERE id = %s",
                    (run_id,),
                )
                conn.commit()
                job_to_run = (run_id, scenario_id, seed, start_time, end_time, config_snapshot)
    finally:
        conn.close()

    if not job_to_run:
        return False

    run_id, scenario_id, seed, start_time, end_time, config_snapshot = job_to_run
    print(f"[simulation-worker] Claimed QUEUED job: run_id={run_id}, scenario={scenario_id}, seed={seed}")

    try:
        config = ScenarioConfig(**config_snapshot)
        world = generate_world(config)
        engine = SimulationEngine(
            run_id=run_id,
            world=world,
            start_time=start_time,
            end_time=end_time,
            seed=seed,
            config_snapshot=config_snapshot,
        )
        engine.schedule_supplier_deliveries()

        demand_gen = SyntheticDemandGenerator(
            config=DemandConfig(),
            catalog_skus=[s.model_dump() for s in world.skus],
            stores=[s.model_dump() for s in world.stores],
            service_zones=[z.model_dump() for z in world.service_zones],
            run_seed=seed,
        )
        for arrival in demand_gen.generate_orders(start_time, end_time, run_id):
            engine.event_queue.push(arrival)

        engine.run_all()
        engine.job.persist_to_postgres(database_url)
        engine.event_store.persist_to_postgres(database_url)
        print(f"[simulation-worker] Completed job {run_id}: {engine.event_store.count()} events recorded.")
        return True
    except Exception as e:
        print(f"[simulation-worker] Error executing job {run_id}: {e}", file=sys.stderr)
        try:
            conn = psycopg2.connect(database_url)
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE simulation_runs SET status = 'FAILED', failure_reason = %s, updated_at = NOW() WHERE id = %s",
                    (str(e), run_id),
                )
                conn.commit()
            conn.close()
        except Exception:
            pass
        return False


def main():
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    print("[simulation-worker] Initializing DarkOps AI Simulation Worker...")
    database_url = os.environ.get("DATABASE_URL", "postgresql://darkops_user:darkops_password@db:5432/darkops_db")
    print(f"[simulation-worker] Configured target DB: {database_url.split('@')[-1] if '@' in database_url else 'local'}")
    print("[simulation-worker] Worker is active and awaiting simulation jobs.")

    update_heartbeat()

    while running:
        update_heartbeat()
        did_work = poll_and_execute_job(database_url)
        if not did_work:
            time.sleep(3)

    print("[simulation-worker] Graceful shutdown complete. Exiting cleanly.")
    if os.path.exists(HEARTBEAT_FILE):
        try:
            os.remove(HEARTBEAT_FILE)
        except OSError:
            pass


if __name__ == "__main__":
    main()
