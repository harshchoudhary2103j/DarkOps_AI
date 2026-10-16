# Simulation Worker Service

Python background worker responsible for synthetic world seeding, discrete-event simulation (DES) scheduling, demand generation, and KPI evaluation for DarkOps AI.

## Quick Start (Local Development)

### Prerequisites
- Python >= 3.11

### Installation & Run
```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run worker
python -m src.main
```

## Observability & Health Check
- The worker updates a heartbeat file at `/tmp/worker_heartbeat` every 5 seconds.
- The Docker container validates this file's modification timestamp as its health probe.

## Environment Variables
- `DATABASE_URL`: PostgreSQL connection string.
- `OPERATIONAL_API_URL`: HTTP URL of the Operational API.
- `LOG_LEVEL`: Logging verbosity.
- `DEFAULT_RANDOM_SEED`: Default seed for reproducibility (default `42`).
