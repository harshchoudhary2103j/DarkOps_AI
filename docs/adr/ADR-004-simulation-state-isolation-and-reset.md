# ADR-004: Simulation State Isolation and Reset Semantics

- **Status**: Accepted
- **Date**: 2026-10-16
- **Context**: The simulation engine generates large volumes of synthetic orders, movements, and picking tasks. These simulated actions must not pollute live operational catalogs, corrupt baseline demonstration data, or interfere with concurrently running scenarios.

## Decision
1. **Run-Scoped Isolation**: All simulation runs are identified by an immutable `run_id`. Simulated orders, inventory reservations, picking tasks, and event logs are strictly tagged with `run_id`.
2. **Snapshot / Seed References**: Simulations initialize from a named world snapshot or deterministic seed configuration.
3. **Reset Semantics**: A simulation reset creates a fresh `run_id` or wipes only the records tied to the designated `run_id`. Shared demonstration catalogs (master stores and SKUs) are immutable during simulation execution.
4. **No Metric Direct-Writing**: Simulation engines never insert or update dashboard operational KPI tables directly. Metrics must be aggregated from the run's event log.

## Alternatives Considered
- *Separate physical database per run*: Resource-heavy and slow to provision in Docker Compose.
- *Running in-memory only without database persistence*: Precludes auditing, post-run inspection, and persistent A/B policy comparison.

## Consequences
- **Positive**: Clean isolation between runs; instantaneous resets; reproducible historical comparisons; zero risk of corrupting demonstration environments.
- **Negative**: Queries must consistently filter by `run_id` or namespace, requiring strict repository test coverage.
