# Phase 05 — Discrete-Event Simulation Engine and Synthetic Demand

## 1. Objective

Implement the Discrete-Event Simulation (DES) Engine, time-varying demand generator, and simulation job lifecycle in `services/simulation-worker`.

The engine must execute simulated operations using virtual time and deterministic event scheduling. It must use the synthetic world generated in Phase 04 and integrate with the existing domain interfaces established in Phases 01–03.

The outcome should be a reproducible simulation runtime capable of running a 24-hour simulated day in seconds or minutes of wall-clock time.

This phase establishes the simulation execution foundation. It does not implement picker route optimization, advanced replenishment optimization, a complete operations dashboard, or an AI copilot.

## 2. Mandatory Repository Reconnaissance

Before implementing anything, inspect:

- `AGENTS.md`, applicable `.agents/rules/`, and relevant `.agents/skills/`
- `docs/ARCHITECTURE.md` and `docs/IMPLEMENTATION_PLAN.md`
- `docs/simulation/world-generator.md`
- Existing Phase 03 order lifecycle and Inventory Core implementation
- `services/simulation-worker/src/seeder/` and scenario configurations
- Existing operational API endpoints, schemas, error handling, and idempotency behavior
- PostgreSQL schema, migration conventions, and Docker Compose configuration
- Existing worker entry point, dependencies, logging, and tests

Use actual repository paths if they differ.

Identify which components already exist and reuse them. Do not recreate the seeder, order lifecycle, inventory ledger, or domain models.

Before implementation, document a concise integration plan identifying:
1. Simulation-owned state.
2. Existing operational interfaces that simulation events will invoke.
3. Persistence required for run metadata and event history.
4. How run isolation will be enforced.
5. How pause, resume, cancellation, and reset will work.

If the existing architecture cannot safely isolate operational state between runs, document the gap and implement the smallest compatible solution before proceeding.

## 3. Core Architecture

Keep the implementation modular but pragmatic.

Suggested responsibilities:

- `clock.py`: virtual clock and time advancement
- `events.py`: event schemas, event types, and serialization
- `event_queue.py`: deterministic priority queue
- `scheduler.py`: event scheduling and validation
- `engine.py`: event processing loop
- `demand.py`: synthetic order-arrival and basket generation
- `handlers/`: event-specific handlers
- `jobs.py`: simulation job lifecycle and orchestration
- `event_store.py`: run-scoped event persistence
- `run_state.py`: isolated state and run configuration
- `cli.py` or the existing worker entry point: start and control simulation runs

This is a suggested organization, not a mandate to create every file. Follow established repository conventions and avoid unnecessary abstractions.

Separate the pure simulation kernel from database access, HTTP clients, and operational service adapters. The core engine should be straightforward to test without starting Docker.

## 4. Simulation Clock

Implement a `SimulationClock` that represents the current virtual timestamp for a simulation run.

Requirements:

- Initialize from an explicit scenario start time.
- Advance only to the timestamp of the next valid scheduled event.
- Never move backwards.
- Never advance by sleeping or waiting for simulated duration in real time.
- Reject or explicitly handle invalid scheduling of events earlier than the current virtual time.
- Support a configured simulation end time.
- Stop cleanly when the end time is reached and no eligible events remain.
- Process events at the configured end timestamp according to one documented inclusive/exclusive boundary rule.
- Use a consistent timezone convention, preferably UTC, for persisted timestamps.

The clock must be independent of the host system clock.

Wall-clock time may be used for operational metadata such as when a job was created or how long execution took. It must not determine simulated business timestamps or affect deterministic event ordering.

## 5. Deterministic Event Queue

Implement an `EventQueue` ordered by:

`(virtual_timestamp, event_priority, sequence_id)`

Requirements:

- Lower numeric priority values execute first, with the convention documented.
- Sequence IDs are assigned monotonically within each run.
- Events with identical timestamps and priorities execute in insertion order.
- Events scheduled by a handler at the current virtual timestamp are inserted using the same deterministic ordering rules.
- Event payloads cannot mutate queue ordering after insertion.
- Invalid timestamps and malformed event payloads are rejected.
- Sequence IDs must not depend on database-generated IDs, thread scheduling, or unordered collection iteration.
- Queue behavior must be reproducible across identical runs.

Document event priorities and their rationale. Do not use arbitrary priorities that create hidden business behavior.

Define an explicit same-timestamp policy. For example, supplier receipt processing may precede demand allocation at the same virtual time if the domain contract says stock is available at that instant. Apply the chosen rule consistently and test it.

## 6. Event Model

Implement typed, validated event schemas for the following event types:

- `CustomerOrderArrived`
- `AllocationRequested`
- `StockReserved`
- `PickingStarted`
- `ItemPicked`
- `ItemMissing`
- `PickingCompleted`
- `OrderCancelled`
- `SupplierDeliveryDue`
- `StockReceived`

Each event must include, at minimum:

- Immutable `run_id`
- Event type
- Virtual timestamp
- Stable event identifier or deterministic event sequence
- Schema version
- Validated payload

Include causation or correlation references where needed to trace related events, such as the event that created an order or requested an allocation.

Use explicit identifiers for run, store, SKU, order, supplier, and other referenced entities as appropriate.

Validate event payloads before processing. Persist a clear failure record if an event cannot be processed; do not silently discard invalid events.

### Event lifecycle

Use the following conceptual flow where applicable:

1. Customer order arrival.
2. Allocation request.
3. Stock reservation result.
4. Picking task start.
5. Item picked or item missing.
6. Picking completion.
7. Optional cancellation or exception handling.
8. Supplier delivery becoming due.
9. Stock receipt after successful delivery processing.

This is a conceptual event flow, not permission to bypass the existing order state machine. Use existing domain rules to determine valid transitions and terminal states.

Do not schedule all event types unconditionally. Events should be scheduled only when justified by the current run state and preceding event outcomes.

## 7. Synthetic Demand Generator

Implement a reproducible, time-varying Poisson process for customer-order arrivals.

Configuration should include:

- Scenario start and end times
- Seed
- Base arrival rate or equivalent documented parameter
- Hour-of-day demand multipliers
- Optional weekday or day-type multipliers
- Basket-size distribution parameters
- SKU popularity weights
- Optional demand profiles by store

### Arrival generation

Use a mathematically valid non-homogeneous Poisson-process approach.

Choose and document one approach, such as piecewise-constant arrival rates with exponential inter-arrival sampling within each interval, correctly handling rate changes at interval boundaries.

Do not sample from one constant rate and simply label it time-varying.

Requirements:

- No negative arrival rates.
- Zero-rate intervals generate no arrivals.
- Arrivals remain within the configured simulation horizon.
- Every generated order has stable, run-scoped identifiers.
- Generated demand is deterministic for identical configuration and seed.
- Avoid depending on global random state.
- Keep randomness isolated per run.

Use separate deterministic random streams for demand arrivals, basket sizes, SKU selection, and other stochastic subsystems where practical. Derive their seeds deterministically from the run seed and subsystem identity so that adding an unrelated random draw in one subsystem does not unnecessarily change the others.

### Basket generation

Support a configurable basket-size distribution, such as Poisson or negative binomial, with validation and sensible bounds.

Ensure:

- Basket size is positive for generated customer orders.
- Maximum basket size is configurable.
- Selected SKUs come from the generated catalog.
- SKU popularity weights are valid and normalized.
- Duplicate SKUs within a basket are either explicitly allowed and aggregated or prohibited by the chosen basket model.
- Requested quantities respect configured bounds.
- The demand generator does not invent available stock or force successful allocation.

If demand exceeds inventory, the existing allocation workflow should handle the outcome.

## 8. Run-Scoped State and Isolation

Every simulation run must have an immutable `run_id` generated at run creation.

All simulation-owned state, events, event sequence counters, clock state, random-stream state, and job metadata must be scoped to that run.

Requirements:

- Events must not be processed under another run's identity.
- A run's event handlers must not mutate another run's state.
- Run-specific initial conditions must be isolated from concurrent runs.
- Resetting a run must not reset global application data or another run.
- Concurrent runs must not accidentally share mutable inventory or order state.
- Run-specific generated orders, reservations, picking tasks, stock receipts, and event history must be attributable to the correct run.

### Critical operational-state constraint

The existing Operational API and PostgreSQL database may contain shared operational data. Do not assume that attaching a `run_id` to an event automatically isolates the database mutations triggered by that event.

Inspect the actual repository architecture and choose a concrete isolation strategy compatible with the existing system.

If run-specific orders and inventory movements are already supported, use the established interfaces.

If they are not, do not silently mutate shared baseline inventory or production-like operational records. Introduce the smallest explicit, testable run-scoped state boundary required by the architecture, documenting any necessary schema or interface extensions.

Simulation events that invoke operational actions must use validated domain interfaces. Do not bypass business rules with direct SQL mutations to operational tables.

## 9. Simulation Job Lifecycle

Implement the state machine:

`QUEUED -> RUNNING -> SUCCEEDED | FAILED | CANCELLED`

Support start, pause, resume, cancellation, and deterministic reset.

Persist job state and enough metadata to inspect each run, including:

- `run_id`
- Status
- Scenario/configuration reference or immutable configuration snapshot
- Random seed
- Simulation start and end times
- Current virtual time
- Created and updated wall-clock timestamps
- Processed event count
- Failure information, when applicable

Use existing migration and persistence conventions.

### Valid transitions

- `QUEUED -> RUNNING`
- `RUNNING -> SUCCEEDED`
- `RUNNING -> FAILED`
- `RUNNING -> CANCELLED`
- `RUNNING -> PAUSED`
- `PAUSED -> RUNNING`
- `PAUSED -> CANCELLED`

Represent `PAUSED` explicitly because pause/resume is required, even though it is not included in the original terminal-state list.

Define how reset is represented. Prefer creating a new run from the original scenario and seed, or resetting a run only when its existing state can be safely and completely reinitialized. Never partially clear a run and leave stale events, reservations, or orders behind.

Reject invalid transitions and make concurrent control requests safe.

### Worker behavior

- A run must not be processed by multiple workers simultaneously unless the architecture explicitly supports coordinated parallel execution.
- Use an appropriate database transaction, lease, lock, or other established mechanism to prevent duplicate execution.
- Handle worker failure without incorrectly reporting success.
- Persist failure information for diagnosis.
- Make cancellation graceful at a documented safe event boundary.
- Never claim a job is cancelled before its execution loop has stopped and its final state has been persisted.

Do not introduce a message broker or a new orchestration platform unless an existing architectural requirement justifies it.

## 10. Pause, Resume, and Cancellation Semantics

Define control behavior precisely.

**Pause:** Stop dequeuing new events after reaching a safe event boundary. Preserve the current virtual time, pending queue, sequence counter, event history, and random-stream state.

**Resume:** Continue from the preserved state without regenerating arrivals or replaying completed events.

**Cancel:** Stop processing at a safe event boundary, persist the final cancellation state, and retain enough history to explain what happened.

**Reset:** Recreate the same initial conditions from the same scenario, seed, and engine version. The resulting deterministic event stream must match a fresh run under the same inputs.

If the current implementation cannot persist the full queue and random-stream state across process restarts, explicitly document whether pause/resume survives process restarts or only applies to a running worker. Do not claim durable resume unless it is implemented and tested.

Do not use `time.sleep()` to simulate time or implement pause delays.

## 11. Event Persistence and Replayability

Implement a run-scoped event store using the existing persistence conventions.

Persist structured event records containing at least:

- `run_id`
- Event sequence
- Event ID
- Event type and schema version
- Scheduled virtual timestamp
- Processing result or status
- Relevant correlation/causation references
- Error details for failed processing, where applicable

Choose a clear persistence strategy:

- Persist scheduled and processed events separately, or
- Persist a structured lifecycle record that makes scheduled, processed, and failed events distinguishable.

Do not make pending events indistinguishable from completed events.

Ensure event writes and job-state updates are consistent enough that a crash does not cause a completed business action to be silently executed twice on retry.

Use database transactions and existing idempotency mechanisms where appropriate. If atomicity across the event store and operational API cannot be guaranteed, document the failure and recovery semantics explicitly.

Define a deterministic event-stream export that excludes nondeterministic operational metadata such as real execution duration and wall-clock timestamps.

Hash the canonical ordered event stream using SHA-256 for determinism verification.

Do not persist fabricated performance KPIs. Operational metrics must be derived later from recorded events.

## 12. Supplier Delivery Events

Support supplier delivery events using the supplier and planned purchase-order schedules generated in Phase 04.

For a delivery scheduled four simulated hours after the start time:

- Schedule the delivery at the exact intended virtual timestamp.
- Advance virtual time through the queue.
- Trigger receipt processing only when virtual time reaches the delivery event.
- Validate the relevant supplier, order, SKU, and quantity.
- Apply stock receipt through the existing Inventory Core/domain interface.
- Persist the event and resulting outcome.
- Ensure retrying the event cannot receive the same delivery twice.

A planned purchase order is not a receipt. Stock increases only after the scheduled delivery is successfully processed.

Test the exact delivery timestamp and the resulting inventory change.

## 13. Error Handling and Observability

Use structured logging with `run_id`, event ID, event type, and correlation ID where applicable.

Distinguish between:

- Invalid configuration
- Invalid event payload
- Invalid business-state transition
- Domain operation failure
- Persistence failure
- Worker failure
- Cancellation
- Successful completion

Avoid swallowing exceptions or marking failed events as successful.

Keep error messages useful without logging credentials or sensitive configuration.

## 14. Required Tests

Use the repository's established Python testing conventions.

### A. Virtual clock tests

- Clock starts at the configured virtual timestamp.
- Clock advances to the next scheduled event.
- Clock never moves backwards.
- Invalid past events are rejected or handled by the documented rule.
- End-time boundary behavior is correct.
- A full simulated day completes without waiting 24 real hours.

### B. Event queue tests

- Timestamp ordering.
- Priority ordering.
- Stable sequence ordering for equal timestamps and priorities.
- Deterministic scheduling of events created by handlers.
- Rejection of invalid event timestamps and payloads.
- Stable event sequence across identical runs.

### C. Demand tests

- Zero-rate intervals generate no arrivals.
- Arrivals remain inside the configured horizon.
- Same seed/configuration produces identical arrivals and baskets.
- Different seeds can produce different results.
- Basket sizes and SKU selections respect configuration.
- Hourly rates exhibit the intended configured time variation.
- Statistical tests verify reasonable distribution behavior over a sufficiently large sample without relying on fragile exact counts.

### D. Determinism tests

Run the same scenario twice with identical initial world, configuration, seed, and engine version.

Verify:

- Identical ordered event sequences.
- Identical virtual timestamps.
- Identical event payloads.
- Identical canonical event-stream bytes and SHA-256 hashes.

Also verify that changing the seed can change the event stream.

### E. Job lifecycle integration tests

- Run creation and initial `QUEUED` state.
- Start and successful completion.
- Pause and resume without duplicate processing.
- Graceful cancellation.
- Invalid state transitions.
- Failure persistence.
- Reset behavior.
- Concurrent start/control requests do not produce duplicate execution.
- Run state and event history remain isolated between two concurrent runs.

### F. Supplier receipt tests

- Delivery is scheduled at the correct virtual timestamp.
- Inventory does not increase before the event is due.
- Inventory increases by the expected amount when receipt succeeds.
- Duplicate event delivery does not duplicate stock receipts.
- Ledger reconciliation passes after receipt.

### G. Regression tests

- Run the existing seeder tests.
- Run relevant Operational API and Inventory Core tests.
- Verify existing domain invariants still hold.
- Verify Docker Compose integration and worker startup.

Do not substitute mocked success responses for integration tests that claim to verify database or operational behavior.

## 15. Documentation

Create or update:

`docs/simulation/discrete-event-engine.md`

Document:

- Engine architecture and module responsibilities
- Event schemas and payload examples
- Event priorities and same-timestamp scheduling rules
- Virtual clock semantics
- Timezone conventions
- Demand generation mathematics and configuration
- Random-stream management and determinism guarantees
- Run-scoped state and isolation strategy
- Job lifecycle and valid transitions
- Pause, resume, cancellation, and reset behavior
- Persistence, replay, failure recovery, and event hashing
- Supplier delivery and inventory receipt semantics
- CLI commands for creating and running simulations
- How to execute unit, integration, and determinism tests
- Known limitations and deferred capabilities

Include concrete commands supported by the actual implementation. Do not document nonexistent commands.

## 16. Engineering Constraints

- Follow `AGENTS.md`, workspace rules, and applicable skills.
- Reuse Phase 03 order lifecycle, Phase 02 inventory, and Phase 04 world generation.
- Keep the simulation kernel independent of network and database details.
- Keep event processing deterministic and explicitly typed.
- Avoid unnecessary dependencies, abstractions, and services.
- Do not use real-time sleeps to advance virtual time.
- Do not bypass existing domain validation.
- Do not mutate shared baseline state from isolated simulation runs.
- Do not fabricate KPIs or success results.
- Do not start Phase 06.
- Do not stage or commit automatically.
- Do not report a test as passing unless it actually ran.

## 17. Implementation Workflow

Implement in this order:

1. Inspect existing code and document integration contracts.
2. Define run-scoped state and persistence requirements.
3. Implement typed events and deterministic serialization.
4. Implement the virtual clock and event queue.
5. Implement the deterministic demand generator.
6. Implement event handlers using existing domain interfaces.
7. Implement the event store and job lifecycle.
8. Implement start, pause, resume, cancel, and reset controls.
9. Implement supplier delivery and receipt processing.
10. Add unit, determinism, and integration tests.
11. Run all relevant existing regression tests.
12. Verify Docker startup and execute a short simulation.
13. Run two identical simulations and compare event-stream hashes.
14. Update documentation and inspect the full diff.

Do not start all modules in parallel. Stabilize event contracts and run isolation before implementing event handlers.

## 18. Acceptance Criteria

Phase 05 is complete only when:

1. A 24-hour simulated day executes without 24 hours of real-time waiting.
2. Identical scenario, initial state, configuration, seed, and engine version produce identical event streams and virtual timestamps.
3. Same-time event ordering follows timestamp, priority, and sequence rules.
4. A supplier delivery scheduled four simulated hours ahead is processed at the exact intended virtual timestamp.
5. Inventory changes only after a valid, successful receipt.
6. Run metadata and event history persist correctly.
7. Job lifecycle transitions and graceful cancellation are verified.
8. Pause/resume preserves pending work and does not replay completed events.
9. Run isolation is verified, including concurrent-run behavior.
10. Existing domain invariants and regression tests pass.
11. Documentation and runnable commands are present.
12. The completion report distinguishes verified results from unverified assumptions.

## 19. Completion Report

### Phase 05 Completion Report

- **Simulation Engine Features:** Virtual clock, event queue, event handlers, and demand generator.
- **Job Orchestration:** Lifecycle transitions, persistence, pause/resume, cancellation, and reset behavior.
- **Run Isolation:** Strategy implemented and integration-test results.
- **Determinism Check:** Scenario, seed, engine version, event counts, and SHA-256 comparisons.
- **Supplier Delivery:** Scheduled virtual timestamp, stock receipt, and idempotency results.
- **Test Results:** Exact commands, passed/failed counts, and skipped tests with reasons.
- **Regression Results:** Seeder, Operational API, Inventory Core, and Docker verification.
- **Files Changed:** Important modules, migrations, tests, and documentation.
- **Known Limitations:** Explicitly list anything deferred or not verified.
- **Git Status:** Modified, staged, and untracked files; no automatic commit.
- **Next Steps:** Whether Phase 06 is ready to begin and any remaining blockers.