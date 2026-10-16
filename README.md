# DarkOps AI

> A modular dark-store operations and optimization platform with a
> synthetic quick-commerce environment, deterministic optimization
> engines, and an AI operations copilot.

**Project status:** Planned / in development\
**Primary use case:** Demonstrate end-to-end operational decision-making
for quick-commerce dark stores without requiring access to a retailer's
private systems.\
**Data integrity principle:** The initial product uses synthetic
operational data. All simulated outcomes and estimated savings are
explicitly labeled as simulated---not as verified real-world results.

------------------------------------------------------------------------

## 1. What is DarkOps AI?

DarkOps AI is a decision-support and simulation platform for
quick-commerce operations. It helps operators coordinate inventory,
order fulfillment, and in-store picking across multiple dark stores.

It is designed to answer practical questions:

-   Which products are likely to run out, and how much should a store
    replenish?
-   Which eligible store should fulfill a new customer order?
-   How should a picker sequence shelf visits to reduce travel?
-   What happens if evening demand increases, a supplier delivery is
    delayed, or one store becomes overloaded?
-   Does an optimized policy outperform a transparent baseline under the
    same conditions?

The system includes a virtual operating environment so the application
can be demonstrated and evaluated without real retailer data. It
generates synthetic demand and orders, advances simulated time, runs
operational workflows, and calculates metrics from actual simulation
events.

## 2. The Business Problem

A quick-commerce operator coordinates stores with different demand
patterns, stock positions, supplier lead times, warehouse layouts, and
order backlogs. Poor coordination can cause stockouts, excess inventory,
unfulfilled orders, inefficient picking routes, and delayed fulfillment.

DarkOps AI connects three optimization capabilities:

1.  **Inventory intelligence:** estimate demand, detect inventory risks,
    and recommend replenishment.
2.  **Multi-store order allocation:** select an eligible store using
    inventory, workload, distance, and service constraints.
3.  **Picker path optimization:** generate an efficient picking sequence
    from the store's warehouse graph.

These capabilities are supported by an operations dashboard, a
simulation and evaluation environment, and an AI copilot.

## 3. Core Product Modules

### 3.1 Operational Data and Event Management

Maintains validated operational state for stores, products, inventory,
orders, supplier data, warehouse layouts, and picking tasks.

Key responsibilities: - Validate commands and events. - Distinguish
physical, reserved, available, and incoming stock. - Maintain order and
picking lifecycle transitions. - Record stock movements and decision
history. - Expose stable contracts to other modules.

### 3.2 Synthetic World and Demand Generator

Creates a configurable virtual quick-commerce environment.

The generator can seed: - Virtual stores and service zones. - Products,
SKUs, prices, pack sizes, shelf lives, and supplier settings. - Initial
inventory and warehouse layouts. - Synthetic historical sales and
order-line records. - Customer delivery zones and time-varying demand
profiles.

During a simulation, it generates orders using configurable demand
rates, time-of-day patterns, basket-size distributions, product
popularity, and seeded randomness. The initial implementation can use a
time-varying Poisson process for order arrivals and weighted sampling
for basket composition, with configurable assumptions.

It must not generate dashboard metrics directly. Generated orders and
operational events enter the same validated application workflows used
by other callers. The seed and scenario configuration should make runs
reproducible.

### 3.3 Inventory Intelligence and Replenishment

Calculates inventory positions, forecasts demand, detects stockout and
excess-stock risks, and recommends replenishment.

It considers: - Usable on-hand stock and reservations. - Confirmed
incoming stock and expected arrival times. - SKU/store-specific demand
forecasts. - Supplier lead time and review cadence. - Safety stock,
supplier minimums, and pack sizes. - Storage, budget, and shelf-life
constraints where modeled.

The initial forecasting baseline can use moving averages or time-of-day
averages. More advanced models should be introduced only after
evaluation. Recommendations include their inputs, timestamps,
policy/model version, rationale, and status.

### 3.4 Multi-Store Order Allocation

Selects an eligible store for each order using: - Basket availability. -
Store service area and operating status. - Current workload and picking
backlog. - Estimated store-to-customer travel time. - Service promises
and configured capacity constraints.

The selected store must reserve inventory safely. If no store is
eligible, the system records an explicit failure or configured
exception; it must not pretend the order can be fulfilled.

**Initial scope:** single-store fulfillment. Multi-store split baskets
are a future extension.

### 3.5 Picker Path Optimization

Models each store's aisles and shelf locations as a navigable graph. It
generates a valid route through all required shelf locations and
estimates travel distance and picking time.

The first version supports one picker and one order. Later versions may
add multi-order batching, picker scheduling, and congestion-aware
routing.

A route is a plan, not proof of execution. The picking workflow records
actual simulated outcomes, including picked, missing, damaged, or
substituted items.

### 3.6 Operations Control Center

The dashboard lets a manager: - Inspect inventory risks and
replenishment recommendations. - Monitor orders, allocations, picking
tasks, and store workloads. - View store locations and warehouse
routes. - Approve, reject, or modify supported recommendations. -
Investigate exceptions and inspect audit history. - Configure and run
simulation scenarios. - Compare baseline and optimized policies using
calculated results.

The dashboard displays data returned by application services; it does
not fabricate operational values in the frontend.

### 3.7 Simulation Lab and Discrete-Event Engine

Provides a virtual operating environment for demonstrations and
repeatable experiments.

A simulation run defines: - Initial world state and inventory. - Store
and supplier configuration. - Demand profiles and a random seed. -
Simulation duration and clock settings. - Baseline or optimized
policies. - Optional disruptions such as demand surges, SKU shortages,
supplier delays, or store overload.

The discrete-event engine advances simulated time between events such as
order arrival, reservation, picking start/completion, cancellation,
stock receipt, and supplier delivery. It schedules events rather than
requiring every simulated minute to wait in real time.

Simulation controls should include start, pause, resume, reset, and
speed selection where supported. Long-running runs execute as background
jobs.

### 3.8 Simulation Evaluation and KPI Reporting

Runs comparable policies against equivalent initial conditions and
demand scenarios.

Baseline examples: - Fixed inventory thresholds or simple reorder
points. - Nearest eligible store. - Basic valid picking route.

Optimized examples: - Demand-aware replenishment. - Workload-aware
constrained allocation. - Shorter valid picker route.

Metrics are calculated from recorded simulation events, not hardcoded: -
Stockout rate and unfulfilled demand estimates. - Inventory and
expiry-cost estimates. - Allocation decision latency and estimated
fulfillment time. - Picker distance and estimated picking duration. -
Constraint violations, job failures, and throughput.

Each report records scenario configuration, random seed, initial state
reference, policy and algorithm versions, metric definitions,
assumptions, and run status. Synthetic results are not proof of
real-world savings.

### 3.9 AI Operations Copilot

Allows authorized operators to investigate and act on system information
through natural language.

Example questions: - "Why is Store 3 experiencing stockouts?" -
"Simulate a 30% evening demand increase." - "Show replenishment
recommendations that need approval." - "Compare the baseline and
optimized allocation policies."

The copilot calls typed application tools. It may retrieve operational
facts, request simulations, explain recommendations, and prepare actions
for review. It is not the source of truth for stock, orders, cost, or
optimization results.

All state-changing actions must pass normal application validation,
authorization, concurrency, idempotency, and configured approval checks.
The copilot must verify the result before reporting success.

## 4. End-to-End Workflow

### During normal simulated operation

1.  The synthetic world generator creates stores, SKUs, starting
    inventory, suppliers, layouts, and historical sales.
2.  Demand profiles generate synthetic customer orders at simulated
    times.
3.  Each order enters the normal order-management workflow.
4.  Allocation evaluates eligible stores and requests stock reservation.
5.  The selected store receives a picking task.
6.  Picker routing calculates the collection sequence.
7.  The discrete-event engine schedules picking progress and completion.
8.  Confirmed picks and exceptions update order and inventory state
    through validated workflows.
9.  Inventory and workload changes affect subsequent decisions.
10. The dashboard displays the current simulated state and event
    history.

### During inventory planning

1.  Order-line history is aggregated by SKU, store, and time window.
2.  A forecasting baseline estimates future demand.
3.  Inventory intelligence combines forecasts with stock, reservations,
    inbound deliveries, and constraints.
4.  A replenishment recommendation is produced with an explanation.
5.  The manager reviews the recommendation.
6.  Before execution, the application revalidates it against current
    state.
7.  Simulated supplier delivery occurs later according to configured
    lead time; stock is updated only when receipt is recorded.

### During an experiment

1.  Select a scenario, duration, seed, initial state, and policy.
2.  Run the baseline policy.
3.  Run the optimized policy against equivalent conditions.
4.  Calculate metrics from recorded events.
5.  Compare results and display trade-offs.
6.  Save a reproducible report.

## 5. Suggested Technology Stack

  -----------------------------------------------------------------------
  Area                    Suggested technology    Purpose
  ----------------------- ----------------------- -----------------------
  Dashboard               React, TypeScript,      Operations UI and
                          Tailwind CSS            Simulation Lab

  Operational APIs        Node.js, TypeScript,    Business workflows and
                          Express                 application contracts

  Optimization service    Python, FastAPI,        Replenishment,
                          OR-Tools                constrained allocation,
                                                  routing

  Simulation engine       Python                  Synthetic demand,
                                                  discrete-event
                                                  execution, scenario
                                                  evaluation

  Persistence             PostgreSQL              Operational state,
                                                  event/audit records,
                                                  scenario/job metadata

  Geospatial view         Leaflet with suitable   Store locations and
                          map data                geographic context

  Warehouse view          Custom 2D graph/grid    Aisles, shelf
                                                  locations, picker
                                                  routes

  AI integration          LLM API with typed tool Copilot investigation
                          calling                 and approved workflows

  Packaging               Docker, Docker Compose  Reproducible local
                                                  environment

  CI/CD                   GitHub Actions or       Automated checks and
                          equivalent              deployment

  Observability           Structured logs,        Debugging and
                          metrics, traces, health operational reliability
                          checks                  
  -----------------------------------------------------------------------

The stack is a proposal, not a reason to couple business logic to
specific frameworks. Record important choices in architecture decision
records (ADRs). Pin dependencies and never commit credentials.

## 6. Architecture Principles

-   Modular business capabilities with explicit contracts.
-   SOLID applied inside modules, not used as a synonym for
    microservices.
-   Separate simulation time and synthetic event generation from
    production operational state.
-   The simulator calls normal application interfaces and cannot bypass
    domain invariants.
-   Optimization algorithms are deterministic and independently testable
    where possible.
-   The LLM explains and orchestrates approved tools; it does not
    replace domain logic.
-   Data ownership and state transitions are explicit.
-   Inventory reservation is concurrency-safe.
-   Simulation runs are reproducible and their assumptions are recorded.
-   Use synchronous APIs for bounded operations and background jobs for
    longer runs.
-   Apply authentication, authorization, idempotency, observability, and
    failure handling.
-   Start with a small number of deployable units; split further only
    when independent deployment or scaling justifies it.

## 7. Suggested Development Roadmap

### Phase 0 --- Contracts and development foundation

-   Confirm domain terms, state transitions, and module ownership.
-   Set up repository conventions, environment configuration, CI, tests,
    and containerized local development.
-   Write initial ADRs and project-level `AGENTS.md`.

### Phase 1 --- Operational foundation

-   Implement catalog, inventory accounting, stock movements, orders,
    and validated state transitions.
-   Add safe stock reservation and audit history.
-   Create database migrations and integration tests.

### Phase 2 --- Synthetic world and simulation skeleton

-   Seed virtual stores, products, supplier settings, layouts, and
    historical sales.
-   Implement a seeded demand generator.
-   Implement discrete-event scheduling and simulation job lifecycle.
-   Verify reproducibility and ensure events pass through normal
    business workflows.

### Phase 3 --- Baseline policies

-   Implement baseline replenishment, allocation, and valid picker
    routing.
-   Complete one end-to-end order lifecycle in simulation.
-   Calculate baseline KPIs from actual events.

### Phase 4 --- Optimization capabilities

-   Add demand-aware replenishment.
-   Add workload-aware allocation and safe reservation/recovery.
-   Add graph-based picker path optimization.
-   Test constraints and infeasible scenarios.

### Phase 5 --- Dashboard and Simulation Lab

-   Build operational views, event timeline, store view, warehouse route
    view, scenario controls, and run history.
-   Compare baseline and optimized policies on equivalent seeded
    scenarios.
-   Produce reproducible reports.

### Phase 6 --- AI copilot

-   Add read-only operational investigation.
-   Add scenario creation and analysis tools.
-   Add approval-gated actions only after permission, validation, audit,
    and idempotency behavior is tested.

### Phase 7 --- Deployment hardening

-   Add logs, metrics, traces, health checks, backups, recovery
    procedures, and CI deployment checks.
-   Test failure cases and concurrent reservations.
-   Deploy a demo with seeded data and a one-click reproducible
    scenario.

## 8. Agentic Development Workflow

Use an AI coding agent for narrow, reviewable implementation tasks.

1.  Inspect the repository and ask for a plan before editing.
2.  Provide module boundaries, invariants, contracts, and acceptance
    criteria.
3.  Implement one vertical slice at a time.
4.  Run formatter, linter, type checks, unit tests, integration tests,
    and contract tests.
5.  Review diffs for coupling, unsafe state changes, invented
    abstractions, and hardcoded demo results.
6.  Update docs, contracts, and ADRs.
7.  Commit only after checks pass.

Build in dependency order: operational state → synthetic world → event
simulation → baseline workflows → optimization → dashboard/evaluation →
copilot → deployment hardening.

Do not ask an agent to generate the entire platform in one prompt. Avoid
concurrent changes to the same files unless ownership and integration
are planned.

## 9. Definition of Done

-   Synthetic orders enter the same validated workflow as other orders.
-   The simulator does not directly write dashboard-only metrics.
-   Inventory reservations cannot oversell stock under concurrent
    orders.
-   Simulation runs can be reproduced from saved configuration and seed.
-   Baseline and optimized policies receive equivalent scenario
    conditions.
-   KPIs are calculated from run events and documented formulas.
-   Optimization constraints and infeasible outcomes are tested.
-   AI tool calls respect authorization and approval requirements.
-   Configuration and secrets are externalized.
-   Migrations, tests, health checks, logs, and recovery instructions
    are documented.
-   Simulated outcomes are labeled as simulated.
-   The end-to-end demo can be recreated from a clean environment.

## 10. Project Boundaries

The first release is a synthetic decision-support and evaluation
platform, not a live integration with a specific retailer. Real supplier
ordering, live rider dispatch, payments, and retailer-specific systems
are out of scope unless separately implemented with authorized access.

The purpose is to demonstrate credible operational workflows and
reproducible experiments. Simulated improvements must never be presented
as verified real-world impact.

## License

Choose and add a license before publishing the repository publicly.
