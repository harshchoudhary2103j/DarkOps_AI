# Phase 05 — Simulation Engine

## Objective
Implement the Discrete-Event Simulation (DES) Engine and time-varying Demand Generator in Python (`services/simulation-worker`) with a virtual clock, deterministic event priority queue, run-scoped event persistence, and job lifecycle management.

## Scope
- Implement the Simulation Core:
  - `SimulationClock`: Virtual time tracker advancing strictly from scheduled event to scheduled event.
  - `EventQueue`: Deterministic priority queue ordered by `(timestamp, event_priority, sequence_id)`.
  - Core Event types: `CustomerOrderArrived`, `AllocationRequested`, `StockReserved`, `PickingStarted`, `ItemPicked`, `ItemMissing`, `PickingCompleted`, `OrderCancelled`, `SupplierDeliveryDue`, `StockReceived`.
- Implement the Synthetic Demand Generator:
  - Time-varying Poisson process for order arrival rates across hours of day.
  - Basket-size distribution sampling (e.g., negative binomial or Poisson).
  - Categorical SKU popularity sampling with seeded pseudo-random number generator.
- Implement the Simulation Job Orchestrator:
  - Job state machine: `QUEUED` -> `RUNNING` -> `SUCCEEDED` | `FAILED` | `CANCELLED`.
  - Run-scoped event logger persisting structured event streams to PostgreSQL or run event storage.
- Implement simulation controls: Start, Pause, Resume, and deterministic Reset.

## Dependencies
- Phase 03: Order Lifecycle.
- Phase 04: Synthetic World (Seeded catalogs and stores).

## Business & Engineering Invariants
- Time Progression Invariant: Simulation time must advance via scheduled virtual events only. Real wall-clock sleeps (`time.sleep`) are strictly prohibited.
- Run Isolation Invariant: Every simulation run must carry an immutable `run_id`. Simulation events must only affect the state within that run's isolated scope.
- Deterministic Ordering: Events scheduled for the identical virtual timestamp must be ordered deterministically using a monotonic sequence counter.
- Simulation events that trigger operational actions must invoke standard domain interfaces and must never bypass validation.

## Acceptance Criteria
1. Running a 24-hour simulated day executes in seconds/minutes of wall-clock time rather than 24 real hours.
2. Two simulation runs initialized with identical configuration and seed yield the exact same event sequence and timestamps.
3. Supplier delivery events scheduled 4 simulated hours in the future trigger stock receipt exactly when virtual time reaches that milestone.
4. Simulation job status updates correctly in the database and terminates cleanly on completion or cancellation.

## Required Tests
- Unit tests: Virtual clock advancement, priority queue ordering, Poisson arrival distributions.
- Determinism tests: Event stream hashing across identical seed executions.
- Job lifecycle integration tests: Run creation, execution, status transitions, and graceful cancellation.

## Documentation Updates
- Update `docs/simulation/discrete-event-engine.md` detailing event schemas, scheduling semantics, and virtual time rules.
- Document simulation job worker execution commands.

## Completion Report Format
```markdown
### Phase 05 Completion Report
- **Simulation Engine Features**: [virtual clock, event queue, demand generator]
- **Job Orchestration**: [state transitions, cancellation handling]
- **Determinism Check**: [event stream hash comparison]
- **Next Steps**: [Phase 06 readiness]
```
