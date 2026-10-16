# Operational API Service

Node.js, TypeScript, and Express service owning the operational workflows, catalog, inventory ledger, order lifecycle, and audit persistence for DarkOps AI.

## Quick Start (Local Development)

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0

### Installation & Run
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start the service
npm start
```

## Endpoints
- `GET /healthz`: Basic liveness/readiness probe. Returns `200 OK` with service identifier and timestamp.

## Environment Variables
- `PORT`: Port to listen on (default `3000`).
- `NODE_ENV`: Runtime environment (`development` / `production`).
- `DATABASE_URL`: PostgreSQL connection string.
- `OPTIMIZATION_SERVICE_URL`: URL to Optimization Service.
- `CORS_ORIGIN`: Allowed origins for CORS.
