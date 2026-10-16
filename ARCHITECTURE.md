# DarkOps AI --- System Architecture

This document defines the proposed architecture for DarkOps AI: a
modular, deployment-oriented platform for dark-store inventory
intelligence, multi-store order allocation, picker path optimization,
synthetic demand generation, discrete-event simulation, evaluation, and
an AI operations copilot.

The system must be demonstrable without private retailer data. The
simulator is a first-class capability, not a frontend mock or a script
that writes made-up KPI values.

## 1. Architecture Goals

-   Separate cohesive business capabilities behind explicit contracts.
-   Apply SOLID within modules and keep domain logic independent from
    framework details.
-   Generate synthetic orders and operational events that exercise
    normal application workflows.
-   Keep simulation time and scenario state isolated from live
    operational state.
-   Make inventory reservation and order lifecycle transitions safe
    under concurrency.
-   Keep optimization engines independently testable and explainable.
-   Compare baseline and optimized policies using reproducible,
    event-derived metrics.
-   Let the AI copilot use approved application capabilities without
    becoming the source of truth.
-   Support local containerized development, automated testing,
    observability, and a credible deployment path.

## 2. System Context

``` mermaid
flowchart TB
    Operator[Operations Manager]
    Web[Operations Dashboard and Simulation Lab]
    Copilot[AI Operations Copilot]
    API[Operational API / Application Facade]

    subgraph Operations[Operational Capabilities]
      Catalog[Store, Product and Layout Catalog]
      Inventory[Inventory and Replenishment]
      Orders[Order Management]
      Allocation[Order Allocation]
      Picking[Picking Tasks]
      Audit[Audit and Decision History]
    end

    subgraph Intelligence[Decision Services]
      Forecast[Demand Forecasting]
      Optimizer[Optimization Service]
    end

    subgraph Simulation[Simulation Environment]
      Seed[World Seeder]
      Demand[Demand and Order Generator]
      DES[Discrete-Event Engine]
      Eval[Experiment and KPI Evaluator]
    end

    Copilot --> API
    Operator --> Web
    Web --> API
    API --> Operations
    Inventory --> Forecast
    Inventory --> Optimizer
    Allocation --> Optimizer
    Picking --> Optimizer
    Seed --> Simulation
    Demand --> DES
    DES --> API
    DES --> Eval
    Operations --> Audit
    Eval --> Web
    Operations --> DB[(PostgreSQL)]
    Intelligence --> DB
    Simulation --> DB
```

The diagram is logical. Not every box must be a separate process on day
one. Deployable boundaries should reflect independent release, scaling,
security, and failure-isolation needs.

## 3. Recommended Deployable Units

Start with a small number of independently buildable units:

1.  **Web application:** React/TypeScript dashboard and Simulation Lab.
2.  **Operational API:** Node.js/TypeScript application workflows,
    validation, authorization, and operational contracts.
3.  **Optimization service:** Python/FastAPI deterministic optimization
    operations.
4.  **Simulation worker:** Python demand generation, discrete-event
    execution, and evaluation jobs.
5.  **PostgreSQL:** durable operational data, simulation metadata, and
    audit history.

The AI copilot can initially be a module behind a defined API boundary
or a separate service if its security, scaling, or release lifecycle
warrants it. Keep prompts, tool definitions, and provider-specific
integration isolated.

Do not introduce Kubernetes, a service mesh, or a broker by default. Add
infrastructure when measured requirements justify it.

## 4. Separation Between Operational State and Simulation State

This is a critical design boundary.

### Operational state

Contains the authoritative state for an operational workflow: stores,
SKUs, inventory, reservations, orders, picking tasks, recommendations,
and audit events.

All changes must pass through the owning application service and its
validation rules.

### Simulation state

Contains the configuration and progress of a virtual run: - Scenario ID
and run ID. - Random seed and simulation clock. - Virtual-world snapshot
or reference. - Scheduled events and pending event queue. - Selected
baseline/optimized policy versions. - Run status and attempt metadata. -
Event log and calculated results.

A simulation run must not mutate shared demonstration state accidentally
or write KPI values directly into dashboard tables. Use a run-scoped
state/snapshot or a clearly isolated simulation namespace. The exact
storage implementation is an ADR decision.

The simulation engine advances virtual time and emits commands/events
through defined application interfaces. If the system needs simulated
operational state to be durable, it should be stored under the run's
isolation boundary. A simulation reset must restore the same initial
state without damaging other runs.

## 5. Module Responsibilities and Ownership

### 5.1 Catalog

Owns store metadata, service areas, operating configuration, SKU
metadata, supplier associations, warehouse graphs, and shelf locations.

Does not own live inventory quantities or order lifecycle state.

### 5.2 Inventory and Replenishment

Owns stock positions, stock movements, reservations, replenishment
recommendations, and relevant inventory policy configuration.

Responsibilities: - Record stock receipt, adjustment, reservation,
release, and consumption. - Distinguish physical/usable stock, reserved
stock, available stock, and inbound stock. - Calculate inventory
position and projected stock over time. - Request forecasts through a
defined interface. - Recommend replenishment subject to lead time,
safety stock, pack size, budget, storage, and expiry constraints. -
Revalidate recommendations before execution.

**Invariant:** Allocation and picking must not directly write inventory
tables. All stock changes pass through inventory-owned commands or a
formally defined transaction boundary.

Concurrency must be handled with transactions, locking or optimistic
concurrency, and idempotency. Two simultaneous orders must not reserve
the same units.

### 5.3 Order Management

Owns order records, order lines, lifecycle transitions, cancellation
state, and the relationship between an order, its store allocation, and
picking task.

Example lifecycle:
`CREATED -> ALLOCATION_PENDING -> ALLOCATED -> PICKING -> PICKED -> READY`

Explicit failure and cancellation transitions must also exist. State
changes are validated; callers cannot freely set arbitrary statuses.

### 5.4 Order Allocation

Owns allocation requests, candidate evaluation, decision results, policy
version, and decision explanation.

Depends on catalog, order management, inventory
availability/reservation, and the optimization service.

Workflow: 1. Retrieve the order and candidate stores. 2. Filter by
service area, opening state, basket availability, and hard constraints.
3. Evaluate workload and estimated travel/fulfillment time. 4. Request
an allocation decision. 5. Reserve stock at the chosen store using the
inventory interface. 6. Confirm allocation only after reservation
succeeds. 7. If reservation fails due to a race, refresh candidate state
and retry or return an explicit failure. 8. Release reservations or
compensate when a workflow fails.

Avoid pretending that a multi-service workflow is one atomic database
transaction. Define idempotent steps, timeouts, and recovery behavior.

### 5.5 Picker Tasks and Routing

Owns picking tasks, task status, route plan references, pick
confirmations, and exceptions.

Depends on order management, catalog layouts, and the optimization
service.

The optimizer calculates a valid route; the task service tracks
execution. Missing items, substitutions, or damaged products are
recorded as events and resolved through explicit business rules.

### 5.6 Demand Forecasting

Produces demand estimates by store, SKU, and horizon. The first baseline
can use moving averages or time-of-day/time-of-week averages. More
advanced models are introduced only after held-out evaluation.

Forecast output should include: - Store and SKU identifiers. - Forecast
horizon and time buckets. - Estimated demand and units. - Model/rule
version and generation timestamp. - Uncertainty metadata when
supported. - Data-quality or fallback warnings.

Synthetic order history can seed training/evaluation data. Forecasts
must be evaluated against held-out synthetic observations; synthetic
data alone cannot establish real-world predictive validity.

### 5.7 Optimization Service

Provides narrow operations such as: - `recommendReplenishment` -
`allocateOrder` - `optimizePickingRoute`

Keep algorithms independent from HTTP handlers, persistence, and the
LLM. The service validates input, calls an application use case, and
returns structured output.

Results should include: - Input references and relevant configuration
versions. - Feasibility/constraint status. - Objective value and
estimated metrics. - Explanation or contributing decision factors. -
Warnings, fallback use, and unmet constraints. - Algorithm version and
execution duration.

An infeasible problem must return an explicit infeasible result. The
service must not silently violate constraints to produce an answer.

### 5.8 Synthetic World Seeder

Creates initial, reproducible virtual worlds. It generates: - Virtual
stores and service zones. - Products, pack sizes, prices, shelf lives,
and supplier parameters. - Warehouse layouts and SKU-to-shelf
mappings. - Starting stock and inbound delivery schedules. - Historical
order-line and sales records. - Customer zones and configurable demand
profiles.

The seeder should support versioned templates and random seeds. It
should produce valid inputs for the same catalog and operational
interfaces used elsewhere, not a parallel set of dashboard-only fake
records.

### 5.9 Demand and Order Generator

Generates customer arrival events based on scenario configuration.

Initial approach: - Time-varying order arrival rate per store/zone. -
Poisson arrivals as a configurable baseline. - Weighted product
selection based on SKU popularity/category. - Configurable basket-size
distribution. - Delivery zone selection. - Time-of-day/week patterns and
optional demand spikes. - Seeded random number generation for
repeatability.

The generator produces an order-arrival event/command. It does not
allocate stores, reserve stock, mark orders completed, or invent
performance metrics; those are handled by the normal workflows and
simulation engine.

The configuration should distinguish assumptions from learned patterns.
Synthetic demand parameters are not claims about real customer behavior.

### 5.10 Discrete-Event Simulation Engine

Advances virtual time from event to event rather than requiring
real-time waits for every simulated action.

Possible events: - `CustomerOrderArrived` - `AllocationRequested` -
`StockReserved` - `PickingStarted` - `ItemPicked` - `ItemMissing` -
`PickingCompleted` - `OrderCancelled` - `SupplierDeliveryDue` -
`StockReceived` - `ForecastUpdated`

Each event should carry a run ID, event ID, schema version, simulated
timestamp, correlation ID, and relevant entity references.

The engine: 1. Loads a run's initial state and configuration. 2.
Schedules initial demand and supplier events. 3. Pops the next event
from the queue and advances the simulation clock. 4. Invokes the
appropriate application command/use case. 5. Schedules resulting events,
such as picking completion or delivery arrival. 6. Persists the
run-scoped event record and state changes. 7. Continues until the
horizon, stop condition, or failure. 8. Produces a final run status and
result reference.

Use explicit simulation time separate from wall-clock time. A simulated
six-hour supplier lead time should be represented as a virtual scheduled
event, not as a six-hour real sleep.

### 5.11 Simulation Orchestrator and Job Worker

Owns run lifecycle and job scheduling:
`QUEUED -> RUNNING -> SUCCEEDED | FAILED | CANCELLED`.

It validates the scenario, creates the isolated run context, starts a
worker, records progress, and exposes status/result queries. Retries
must be idempotent. Long runs should not block ordinary API requests.

The initial version can use a database-backed job table and worker
polling. A broker can be added later if throughput or fan-out requires
it.

### 5.12 Experiment Evaluator and KPI Reporting

Runs baseline and optimized policies against equivalent scenario
conditions.

A fair comparison should use: - The same scenario template and starting
inventory. - Equivalent generated demand, preferably common random
seeds/event streams. - Equivalent supplier schedules and disruption
settings. - Explicit policy/algorithm versions. - Consistent metric
definitions and horizons.

Metrics are calculated from run events, not hardcoded: - Stockout
duration/rate and unfulfilled demand estimate. - Inventory, ordering,
holding, and expiry-cost estimates when assumptions are defined. -
Allocation decision latency and estimated order completion time. -
Picker route distance and estimated picking duration. - Constraint
violations, failures, throughput, and job runtime.

Store the metric formula/version, units, assumptions, scenario, seed,
and run ID. If the baseline and optimized runs use different random
demand, observed differences may be caused by randomness rather than the
policy.

### 5.13 Operations Dashboard

Reads application APIs and displays operational state, recommendations,
event timelines, simulation progress, and computed evaluation results.

The frontend must not calculate authoritative inventory positions or
create fabricated KPIs. It may perform presentation-only calculations,
such as formatting and chart rendering.

Simulation Lab controls submit scenario configuration to the backend and
poll or subscribe to run progress. A reset starts a new isolated run or
restores a saved snapshot through an explicit workflow.

### 5.14 AI Operations Copilot

Owns tool schemas, prompt versions, session metadata, and tool-call
logs.

It may: - Query stockout risks and operational summaries. - Explain a
replenishment recommendation. - Request a simulation with specified
assumptions. - Compare completed scenario results. - Prepare supported
actions for approval.

It must not own inventory truth, implement the optimization algorithm in
prompt text, execute arbitrary SQL/shell commands, or bypass application
interfaces.

Permission model: 1. Authorized read-only queries can run immediately.
2. Simulations are non-mutating with clearly labeled estimates. 3.
Mutating actions are prepared for review and require configured
approval. 4. Execution revalidates state and authorization. 5. Results
are checked and audited before the copilot reports success.

### 5.15 Audit and Decision History

Records actor/system identity, correlation ID, entity references,
action, policy/algorithm version, decision status, timestamps, and safe
references to input/result snapshots.

Avoid logging secrets or unnecessary personal information. Keep decision
records sufficiently detailed to reproduce or explain a result.

## 6. SOLID and Code Organization

SOLID applies inside modules; it does not require one microservice per
class.

-   **Single Responsibility:** keep HTTP controllers, use cases, domain
    rules, repositories, and external adapters separate.
-   **Open/Closed:** make forecast and allocation policies replaceable
    through small interfaces where variation is real.
-   **Liskov Substitution:** interchangeable implementations preserve
    the same contracts, invariants, and error semantics.
-   **Interface Segregation:** use narrow ports such as
    `InventoryReader`, `StockReservation`, `DemandForecaster`, and
    `RouteOptimizer`.
-   **Dependency Inversion:** domain/application logic depends on
    abstractions; database, HTTP, OR-Tools, LLM, and simulation storage
    implementations are adapters.

Example TypeScript module layout:

``` text
inventory/
  domain/
  application/
  ports/
  adapters/
    http/
    postgres/
  tests/
    unit/
    integration/
    contract/
```

Example Python simulation layout:

``` text
simulation/
  domain/
    scenario/
    event/
    clock/
    world/
  application/
    seed_world/
    generate_demand/
    run_simulation/
    evaluate_run/
  ports/
    operational_api/
    run_repository/
    event_store/
  adapters/
    http/
    postgres/
    random_generator/
  tests/
    unit/
    integration/
    reproducibility/
```

These are conceptual layouts. Do not create empty abstractions without a
real boundary. Domain rules should be testable without starting a web
server or database.

## 7. Communication Patterns

### Synchronous APIs

Use for bounded operations: - Read catalog and inventory. - Request a
replenishment calculation. - Request an allocation decision. - Calculate
a picker route. - Query simulation status and results.

Use timeouts, schema validation, structured errors, and correlation IDs.

### Asynchronous jobs

Use for: - Full simulation runs. - Bulk demand/forecast generation. -
Batch experiments and KPI evaluation. - Expensive optimization jobs.

Return a run/job ID; expose status and result endpoints. The worker must
be safe to retry.

### Events

Events communicate meaningful state transitions, but should not create
uncontrolled cycles. Every event has a schema version and unique ID;
consumers tolerate duplicates.

If reliable publication is required across a database transaction, use a
transactional outbox. Do not publish an event as an unrelated operation
after committing state and assume delivery is guaranteed.

The simulation event queue is not necessarily the same thing as a
production messaging broker. The simulator schedules virtual-time events
within a run; application domain events represent validated state
transitions. Keep these concepts separate.

## 8. Data Ownership and Persistence

A single PostgreSQL cluster is acceptable initially, provided table
ownership is enforced.

-   Each capability owns its tables and migrations.
-   Other capabilities do not write directly to another module's tables.
-   Cross-module reads use explicit query interfaces or documented read
    models.
-   Inventory writes go through inventory-owned application services.
-   Simulation records are run-scoped and isolated from shared
    operational/demo state.
-   Use versioned migrations and test from an empty database.
-   Persist run configuration, seed, event history, policy versions, and
    metrics.

Potential logical data groups: - Catalog: stores, SKUs, suppliers,
layouts, shelf locations. - Inventory: stock positions, movements,
reservations, replenishment recommendations. - Orders: orders, order
items, allocations, picking tasks. - Simulation: scenarios, run
metadata, scheduled events, run events, results. - Audit: decisions,
approvals, tool calls, action outcomes.

These are logical ownership groups; final table and schema choices
should be documented in ADRs.

## 9. Inventory and Workflow Consistency

Inventory correctness is essential because allocation and simulation
depend on it.

-   Available stock must account for reservations and configured
    deductions.
-   Reservations must be atomic or concurrency-safe.
-   Retried commands use idempotency keys.
-   Order state transitions are validated.
-   A simulated pick changes inventory only through a confirmed pick
    workflow.
-   Supplier stock becomes available only when the receipt event is
    processed.
-   A recommendation is revalidated before execution.
-   Failed workflows release reservations or run documented
    compensation/recovery steps.
-   Simulation reset must not erase other runs or shared data.

Use explicit failure states instead of silently forcing an impossible
order to completion.

## 10. Simulation Reproducibility

Every simulation run should capture: - Scenario template and version. -
Random seed and generator version. - Initial world snapshot or
deterministic seed inputs. - Demand profile and disruption
configuration. - Simulated time horizon. - Baseline/optimized policy
versions. - Forecast/optimization algorithm versions. - Event log and
final run status. - KPI formula versions and assumptions.

Use deterministic scheduling for equal-time events (for example, a
stable event sequence number) so replay is predictable. External calls
should be stubbed or recorded for reproducible experiments. A simulation
that depends on live external API responses is not fully reproducible.

## 11. Failure Handling

-   **Reservation conflict:** refresh state and retry safely or return
    an explicit conflict.
-   **No eligible store:** record an unfulfillable order/exception; do
    not invent a successful allocation.
-   **Optimization timeout/infeasible result:** return a structured
    failure or documented safe fallback.
-   **Forecast unavailable:** use an explicitly marked baseline fallback
    if configured.
-   **Worker crash:** resume/retry from a safe checkpoint or restart the
    isolated run deterministically.
-   **Duplicate event:** deduplicate using event ID and idempotent
    command handling.
-   **Copilot provider failure:** keep normal operations and dashboard
    usable.
-   **Simulation reset:** create/restore run-scoped state without
    altering other runs.
-   **Partial workflow failure:** use explicit compensation and recovery
    steps.

Bound retries and use backoff where appropriate. Never retry a
non-idempotent mutation without protection.

## 12. API Contract Guidelines

-   Version public APIs, e.g. `/api/v1`.
-   Validate request and response schemas at boundaries.
-   Use structured errors for validation failures, business conflicts,
    infeasible optimization, and infrastructure failures.
-   Use idempotency keys for retryable state-changing commands.
-   Include correlation IDs in logs and responses.
-   Document APIs using OpenAPI.
-   Do not expose stack traces or secrets to clients.

Possible logical API groups: - `/stores`, `/products`, `/suppliers`,
`/warehouse-layouts` - `/inventory`, `/stock-movements`,
`/replenishment-recommendations` - `/orders`, `/allocations`,
`/picking-tasks` - `/simulation/scenarios`, `/simulation/runs`,
`/simulation/runs/{id}/events`, `/simulation/runs/{id}/results` -
`/evaluation/experiments` - `/copilot/sessions`, `/copilot/tool-calls` -
`/audit-events`

These paths are examples, not final contracts. Decide which deployable
unit owns each route before implementation.

## 13. Deployment Topology

### Local development

``` mermaid
flowchart LR
    Browser[Browser] --> Web[Web Container]
    Web --> API[Operational API Container]
    API --> Opt[Optimization Service Container]
    API --> DB[(PostgreSQL)]
    Sim[Simulation Worker Container] --> API
    Sim --> DB
    Opt --> DB
```

The simulation worker should invoke application workflows through
explicit interfaces rather than writing directly to operational tables.
If internal application use cases are imported in-process for a
particular deployment, preserve the same validation and transaction
boundaries and document the decision.

Use Docker Compose for the first complete environment. Health checks
must not be treated as a substitute for retrying transient startup
failures.

### Production-oriented deployment

-   Build immutable, versioned container images.
-   Externalize environment configuration and use a secret manager.
-   Use managed PostgreSQL or a documented database operations plan.
-   Scale API and simulation workers independently.
-   Configure TLS and appropriate ingress.
-   Add structured logs, metrics, traces, alerts, and health/readiness
    endpoints.
-   Run migrations and tests in CI/CD.
-   Document backup restoration, rollback, and worker recovery.
-   Deploy with seeded data and a reproducible demo scenario.

Kubernetes is optional, not a prerequisite for deployment readiness.

## 14. Testing Strategy

### Unit tests

-   Inventory arithmetic and reservation rules.
-   Order lifecycle transitions.
-   Replenishment constraints.
-   Allocation eligibility and objective calculations.
-   Route validity and distance.
-   Demand generation distributions and bounds.
-   Event ordering, virtual clock, and deterministic scheduling.
-   KPI formulas.

### Integration tests

-   Database migrations and repositories.
-   Concurrent stock reservations.
-   Allocation-to-reservation recovery.
-   Simulation worker and job persistence.
-   Simulator-to-operational workflow integration.
-   Run isolation and reset behavior.

### Contract tests

-   API request/response schemas.
-   Optimization service results and errors.
-   Versioned event payloads.
-   Timeout and infeasibility behavior.

### End-to-end tests

-   Generate an order, allocate it, reserve stock, pick items, complete
    the order, and verify state.
-   Run a supplier-delivery scenario and verify inventory changes only
    at receipt.
-   Run the same seeded scenario twice and compare event sequence and
    results.
-   Run baseline and optimized policies against equivalent demand.
-   Verify KPI values are derived from events.
-   Verify unauthorized copilot mutations are rejected.

### Evaluation tests

-   Test edge cases, infeasible constraints, and demand spikes.
-   Validate the optimizer against simple baselines.
-   Record scenario assumptions and random seeds.
-   Never assume optimization is better without measured evidence.

## 15. Agentic Development Workflow

Use the coding agent for small vertical slices, with repository rules
and acceptance criteria.

Create `AGENTS.md` containing: - Product context and approved stack. -
Module boundaries and data ownership. - Dependency and code-style
rules. - Required test commands. - Security and no-hardcoded-metrics
rules. - Contract and ADR update requirements. - Definition of done.

Recommended implementation order: 1. Repository skeleton, CI,
configuration, containers, and ADRs. 2. Domain contracts, error model,
migrations, and catalog. 3. Inventory accounting, reservations, order
lifecycle, and audit. 4. Synthetic world seeding and deterministic
historical data. 5. Demand generation and discrete-event engine. 6.
Baseline order lifecycle through simulation. 7. Baseline inventory,
allocation, and routing policies. 8. Event-derived KPIs and reproducible
evaluation. 9. Optimized replenishment, allocation, and routing. 10.
Dashboard and Simulation Lab. 11. Read-only copilot tools. 12.
Approval-gated actions. 13. Deployment hardening and failure-mode
testing.

For every task: 1. Ask the agent to inspect the existing repository. 2.
Request a plan, affected files, and acceptance criteria. 3. Review the
plan before implementation. 4. Implement one narrow capability. 5. Run
formatter, linter, type checks, and tests. 6. Review the diff for
coupling, bypassed invariants, and hardcoded results. 7. Update
docs/contracts and commit only after checks pass.

Avoid asking an agent to implement the whole platform in one prompt or
allowing multiple agents to edit the same files without ownership rules.

## 16. Architecture Decision Records to Create

-   ADR-001: Deployable units and service boundaries.
-   ADR-002: Inventory ownership, reservations, and concurrency.
-   ADR-003: Operational API and internal command contracts.
-   ADR-004: Simulation state isolation and reset semantics.
-   ADR-005: Demand generation model and reproducibility.
-   ADR-006: Discrete-event scheduling and simulated time.
-   ADR-007: Baseline policies, optimization objectives, and
    constraints.
-   ADR-008: KPI definitions and fair experiment comparison.
-   ADR-009: AI tool authorization and approval workflow.
-   ADR-010: Deployment target, observability, and recovery.

Each ADR should record context, options, decision, consequences, and
status.

## 17. Definition of Done

-   Generated orders pass through normal validation and business
    workflows.
-   The simulator cannot bypass inventory reservation or order state
    rules.
-   Simulation state is isolated and resettable.
-   Seeded runs are reproducible.
-   Supplier arrivals, picking completion, and other timed actions use
    virtual time.
-   Baseline and optimized policies receive equivalent scenarios.
-   KPIs are calculated from recorded events using documented formulas.
-   Constraints and infeasible outcomes are tested.
-   AI tool calls are authorized, auditable, and approval-gated where
    required.
-   Tests, migrations, health checks, logging, and recovery instructions
    exist.
-   The deployment can be recreated from documented steps.
-   Simulated results are clearly distinguished from real-world
    outcomes.
