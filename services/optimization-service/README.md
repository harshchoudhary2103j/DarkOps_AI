# Optimization Service

Stateless Python + FastAPI + OR-Tools optimization engine for replenishment optimization, constrained multi-store order allocation, and picker routing.

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

# Start FastAPI server
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

## Endpoints
- `GET /healthz`: Basic probe returning `200 OK` with service identifier and timestamp.

## Environment Variables
- `PORT`: Service port (default `8000`).
- `HOST`: Bind address (default `0.0.0.0`).
- `LOG_LEVEL`: Logging verbosity (`info`, `debug`, `warning`).
- `SOLVER_TIMEOUT_SECONDS`: Maximum solver runtime per optimization problem (default `5`).
