import os
import signal
import sys
import time
from datetime import datetime, timezone

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


def main():
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    print("[simulation-worker] Initializing DarkOps AI Simulation Worker...")
    database_url = os.environ.get("DATABASE_URL", "postgresql://localhost:5432/darkops_db")
    print(f"[simulation-worker] Configured target DB: {database_url.split('@')[-1] if '@' in database_url else 'local'}")
    print("[simulation-worker] Worker is active and awaiting simulation jobs.")

    update_heartbeat()

    while running:
        time.sleep(5)
        update_heartbeat()

    print("[simulation-worker] Graceful shutdown complete. Exiting cleanly.")
    if os.path.exists(HEARTBEAT_FILE):
        try:
            os.remove(HEARTBEAT_FILE)
        except OSError:
            pass


if __name__ == "__main__":
    main()
