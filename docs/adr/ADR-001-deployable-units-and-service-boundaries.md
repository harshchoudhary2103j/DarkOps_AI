# ADR-001: Deployable Units and Service Boundaries

- **Status**: Accepted
- **Date**: 2026-10-16
- **Context**: DarkOps AI requires modular capabilities spanning operational workflow management, optimization solving, discrete-event simulation, and web visualization. We need to decide how to decompose the system into deployable units without introducing excessive distributed complexity (e.g., premature microservices, service meshes, or distributed brokers).

## Decision
We establish four primary deployable application services and one durable database cluster:
1. **`apps/dashboard`**: Single-page web application using React, TypeScript, and Tailwind CSS.
2. **`services/operational-api`**: Operational backend using Node.js, TypeScript, and Express. Owns the authoritative catalog, orders, inventory reservations, picking workflows, and audit persistence.
3. **`services/optimization-service`**: Stateless optimization engine using Python, FastAPI, and OR-Tools.
4. **`services/simulation-worker`**: Background simulation worker using Python for synthetic world generation, discrete-event execution, and KPI evaluation.
5. **PostgreSQL**: Durable storage for operational state, simulation run records, and audit events.

## Alternatives Considered
- *Monolithic single-process app*: Would complicate using Python for OR-Tools / scientific simulation alongside Node.js/TypeScript backend workflows.
- *Fine-grained microservices (10+ services)*: Extreme operational overhead, distributed transaction failures, network latency, and unnecessary dev complexity.

## Consequences
- **Positive**: Clean separation of language strengths (TypeScript for web/APIs, Python for OR/optimization/simulation); simple local execution via Docker Compose; independent scaling of compute-intensive optimization workers.
- **Negative**: Requires maintaining two language toolchains (Node.js and Python) and strict API contract discipline.
