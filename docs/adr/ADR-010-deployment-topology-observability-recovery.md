# ADR-010: Deployment Topology, Observability, and Recovery

- **Status**: Accepted
- **Date**: 2026-10-16
- **Context**: The platform needs a predictable, maintainable, containerized deployment path that supports local development with Docker Compose and production environments without premature infrastructure overhead (e.g., Kubernetes).

## Decision
1. **Container Foundation**: Docker Compose for local development and single-node evaluation; multi-stage Dockerfiles with non-root security (`USER appuser`) and minimal base images (`node:20-alpine`, `python:3.11-slim`).
2. **Observability Standards**:
   - Structured JSON logging (Pino for Node.js, structlog for Python) injecting correlation IDs.
   - Standard `/healthz` (liveness) and `/readyz` (readiness) endpoints across all backend services.
   - Prometheus metrics exporter endpoints (`/metrics`) instrumenting HTTP latencies, simulation runs, and queue depths.
3. **Recovery & Fault Tolerance**:
   - Simulation workers handle `SIGTERM` gracefully, checkpointing or terminating runs cleanly.
   - Database connection pools implement exponential backoff retry for transient network disconnects.
   - Automated disaster recovery runbooks and database backup procedures.
4. **One-Click Seeding**: Provide automated setup and seeding scripts (`scripts/seed-demo.sh` / `scripts/seed-demo.ps1`) to spin up containers, apply migrations, seed 5 virtual dark stores, and run an initial baseline scenario.

## Alternatives Considered
- *Kubernetes / Helm / Service Mesh on day one*: Massively excessive operational complexity for an early-stage development and demonstration platform.

## Consequences
- **Positive**: Rapid local onboarding; minimal operational footprint; complete container parity between development and production.
- **Negative**: Multi-node horizontal scaling requires migrating from Docker Compose to ECS/Nomad/K8s when real-world scale demands it.
