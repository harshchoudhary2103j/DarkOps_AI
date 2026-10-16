# Discrete-Event Simulation Engine & Synthetic Demand

## 1. Executive Summary & Purpose

The **Discrete-Event Simulation (DES) Engine** (located in `services/simulation-worker/src/simulation/`) provides a reproducible, high-throughput simulation runtime for DarkOps AI quick-commerce operations. It simulates warehouse operations, customer order generation, inventory reservations, picking traversal, and supplier receipts across virtual time.

Key capabilities:
- **Instantaneous Virtual Time Advancement**: Runs a full 24-hour operational cycle in milliseconds or seconds of wall-clock time without any `time.sleep()` delays.
- **Strict Invariant Isolation**: All state mutations are scoped to an immutable `run_id`, preventing cross-run contamination and avoiding pollution of operational database tables.
- **Deterministic Priority Queue**: Guarantees bit-for-bit identical event streams across runs given identical configuration and seed.
- **Non-Homogeneous Poisson Demand**: Realistic, time-varying hourly order arrivals with configurable basket sizes and category-weighted SKU selection.
- **Durable Job Lifecycle & Worker Daemon**: Background worker daemon automatically claims `QUEUED` jobs from PostgreSQL (`SELECT ... FOR UPDATE SKIP LOCKED`), advances virtual clock, and persists structured audit events.

---

## 2. Module Architecture & Responsibilities

```
services/simulation-worker/src/simulation/
├── __init__.py           # Package exports
├── clock.py              # SimulationClock: virtual time tracking & strictly monotonic advancement
├── events.py             # Event schemas, EventType enum, priorities, and canonical dictionary serialization
├── event_queue.py        # EventQueue: heap-based priority queue with monotonic tie-breaking
├── demand.py             # SyntheticDemandGenerator: non-homogeneous Poisson arrivals & basket sampling
├── run_state.py          # RunState: isolated in-memory world state, inventory ledger, and picking tracking
├── handlers.py           # EventHandlerRegistry: domain event handlers enforcing order & inventory invariants
├── engine.py             # SimulationEngine: event loop orchestrator, step/pause/resume/cancel controls
├── event_store.py        # EventStore: in-memory & PostgreSQL event persistence with SHA-256 fingerprinting
├── jobs.py               # SimulationJob: job lifecycle state machine and PostgreSQL persistence
└── cli.py                # Command-line interface for running and verifying simulations
```

---

## 3. Virtual Clock Semantics

The `SimulationClock` represents virtual operational time:
- **Strict Monotonicity**: Clock time advances directly from the current timestamp to the timestamp of the next earliest event in the priority queue. Calling `advance_to(t)` with $t < t_{\text{current}}$ raises a `ValueError`.
- **Zero Real-Time Delays**: Virtual lead times (e.g. 4-hour supplier delivery, 60-second dispatch delay, 120-second picking traversal) elapse instantaneously in real time.
- **Timezone Invariant**: All timestamps are UTC-aware ISO-8601 strings.
- **Horizon Boundary**: Stops cleanly when the next event timestamp exceeds `end_time`.

---

## 4. Deterministic Event Priority Queue & Ordering Rules

Events are stored in a min-heap ordered by the tuple:
$$\left(t_{\text{virtual}}, \text{priority}, \text{sequence\_number}\right)$$

### Priority Conventions (Lower Numbers Execute First)
| Priority | Event Type | Rationale |
| :---: | :--- | :--- |
| **1** | `SupplierDeliveryDue` / `StockReceived` | Newly arrived supplier stock becomes available before customer demand at the same instant. |
| **2** | `CustomerOrderArrived` | Customer submits order into the system. |
| **3** | `AllocationRequested` | Candidate stores evaluated and basket inventory checked. |
| **4** | `StockReserved` | Inventory hold recorded; picking task created. |
| **5** | `PickingStarted` | Picker begins navigation from dispatch station. |
| **6** | `ItemPicked` / `ItemMissing` | Picker confirms or reports shortage at shelf location. |
| **7** | `PickingCompleted` | Task finishes; reserved stock consumed; order marked `READY`. |
| **8** | `OrderCancelled` | Unconsumed reserved stock released; order marked `CANCELLED`. |

Ties with identical timestamp and priority are broken deterministically by a monotonic integer `sequence_number` assigned at event creation.

---

## 5. Non-Homogeneous Poisson Demand Generation

Order arrivals follow a piecewise-constant non-homogeneous Poisson process:
$$\lambda(t) = \lambda_{\text{base}} \times \text{multiplier}_{\text{hour}}(\text{hour}(t)) \times \text{multiplier}_{\text{day}}(\text{day}(t))$$

### Inter-Arrival Sampling
- Within each hourly interval, inter-arrival time is sampled via inverse transform:
  $$\Delta t = -\frac{\ln(U)}{\lambda(t)} \quad (U \sim \text{Uniform}(0, 1))$$
- When $\Delta t$ crosses an hour boundary $[H, H+1)$ where rate changes from $\lambda_1$ to $\lambda_2$, the unused exponential interval fraction is rescaled by $\lambda_2 / \lambda_1$.
- Zero-rate intervals produce zero arrivals.

### Basket Size & SKU Sampling
- Basket sizes follow a truncated Poisson distribution ($1 \le N \le \text{max\_basket}$).
- SKUs are sampled without duplicates in the basket, weighted by category demand popularity.
- Quantities per line are sampled uniformly between 1 and $\text{max\_units\_per\_sku}$.

### Independent Seeded Subsystem Streams
To prevent cross-subsystem coupling, random numbers are generated using independent PRNG instances derived from the master seed:
- `seed:arrivals`: Order arrival intervals
- `seed:baskets`: Basket sizes and quantities
- `seed:skus`: SKU selection
- `seed:geo`: Customer delivery coordinates

---

## 6. Run-Scoped State Isolation (ADR-004)

Each simulation run operates on an isolated `RunState`:
- **Inventory Ledger Invariants**:
  - Double-entry balance: $\text{available} = \text{physical} - \text{reserved}$.
  - Reservations are atomic holds; out-of-stock orders fail cleanly with `INSUFFICIENT_STOCK`.
  - Stock receipt increases physical stock: $\text{physical} \leftarrow \text{physical} + Q$.
- **Database Boundary**:
  - Live operational tables (`orders`, `inventory_positions`) remain pristine and unpolluted.
  - Run metadata and events are persisted into dedicated simulation tables: `simulation_runs` and `simulation_events`.

---

## 7. Job Lifecycle & Controls

### State Machine Transitions
```mermaid
stateDiagram-v2
    [*] --> QUEUED
    QUEUED --> RUNNING : Worker Claim / Start
    QUEUED --> CANCELLED : Operator Cancel
    RUNNING --> PAUSED : Pause
    PAUSED --> RUNNING : Resume
    PAUSED --> CANCELLED : Cancel
    RUNNING --> SUCCEEDED : All Events Complete
    RUNNING --> FAILED : Execution Error
    RUNNING --> CANCELLED : Operator Cancel
    SUCCEEDED --> [*]
    FAILED --> [*]
    CANCELLED --> [*]
```

- **Pause**: Halts event processing at the next event boundary; pending queue, virtual clock, and sequence numbers remain preserved.
- **Resume**: Re-activates the event loop from exact preserved virtual state without replaying completed events.
- **Cancel**: Gracefully stops processing, records cancellation reason, and marks run `CANCELLED`.
- **Reset**: Re-instantiates initial world from scenario configuration and seed, reproducing the identical event sequence.

---

## 8. CLI Usage & Practical Examples

The simulation CLI is executed from `services/simulation-worker`:

```bash
# 1. Run a 24-hour simulation headless and save canonical event stream
python -m src.simulation.cli run \
  --scenario scenarios/small_fast.json \
  --seed 42 \
  --duration-hours 24 \
  --output artifacts/sim_small_fast.json

# 2. Run with PostgreSQL persistence (records to simulation_runs and simulation_events)
python -m src.simulation.cli run \
  --scenario scenarios/small_fast.json \
  --seed 42 \
  --duration-hours 24 \
  --db-url postgresql://darkops_user:darkops_password@localhost:5432/darkops_db

# 3. Verify determinism (runs twice with identical seed and checks matching SHA-256)
python -m src.simulation.cli verify-determinism \
  --scenario scenarios/small_fast.json \
  --seed 42
```

---

## 9. Verification & Test Execution

Run the complete simulation test suite:
```bash
cd services/simulation-worker
python -m pytest tests/
```

Test coverage includes:
- `test_clock_and_queue.py`: Monotonic advancement, bounds, 24-hour rapid execution, priority queue ordering.
- `test_demand_generator.py`: Poisson intervals, zero-rate handling, basket bounds, seed reproducibility.
- `test_simulation_determinism.py`: Byte-for-byte identical canonical event logs and SHA-256 equality.
- `test_job_lifecycle.py`: State machine transitions, pause/resume, and graceful cancellation.
- `test_supplier_delivery.py`: Supplier receipt scheduled 4 hours ahead triggering exactly at milestone.
- `test_run_isolation.py`: Concurrent runs executing without state cross-contamination.

---

## 10. Known Limitations & Deferred Features

- **Picker Route Optimization**: Detailed A* / TSP graph routing solver is deferred to Phase 06/08.
- **Multi-Store Workload Optimization**: Advanced MILP order assignment is deferred to Phase 08.
- **Dynamic Replenishment Decisions**: Automated reorder point generation and approval gates are integrated in Phase 06.
