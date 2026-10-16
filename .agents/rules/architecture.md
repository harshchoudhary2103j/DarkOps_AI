---
trigger: model_decision
description: "Architectural boundaries, module ownership, simulation vs operational state separation, and ADR enforcement."
---

# DarkOps AI Architecture Rules

## 1. Module Ownership & Boundaries
- **Operational API (`services/operational-api`)** is the sole authority for operational state (catalog, orders, inventory reservations, picking tasks).
- **Optimization Service (`services/optimization-service`)** is a pure compute service. It must remain stateless and have zero knowledge of database connections or HTTP caller sessions.
- **Simulation Worker (`services/simulation-worker`)** must maintain strict isolation between virtual simulation state and operational state.
- **Operations Dashboard (`apps/dashboard`)** is presentation-only. It must never compute authoritative inventory quantities or invent metric aggregations.

## 2. Operational vs. Simulation State Separation
- Simulation time is driven by a virtual discrete-event clock. Never use real wall-clock sleeps (`setTimeout`, `time.sleep`) to model operational lead times.
- Simulation runs must be tagged with an immutable `run_id`. Simulation events may only mutate state inside that run's isolated namespace.
- Resetting a simulation must be atomic and non-destructive to other simulation runs or shared demonstration catalogs.

## 3. Communication Patterns
- Synchronous HTTP requests are reserved for bounded, low-latency requests (< 500ms).
- Long-running simulations, batch forecasting, and large evaluations must execute as asynchronous background jobs with job ID tracking.
- Do not introduce message brokers (Kafka/RabbitMQ) or service meshes unless proven necessary by load benchmarks and documented in an ADR.

## 4. Architecture Decision Records (ADRs)
- Any modification to service topology, persistence strategy, inter-service contracts, or concurrency isolation must be documented in `docs/adr/` before implementation.
