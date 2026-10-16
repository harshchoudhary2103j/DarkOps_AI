# Phase 06 — Baseline Policies

## Objective

Implement transparent, deterministic baseline policies for inventory replenishment, order allocation, and picker routing in DarkOps AI.

Integrate these policies with the existing Discrete-Event Simulation (DES) engine from Phase 05 and execute a complete 24-hour simulated operating day with concurrent orders, replenishment deliveries, and picking completions.

The purpose of this phase is to establish reliable, reproducible baseline policies against which advanced optimization algorithms can be evaluated in subsequent phases.

## 1. Repository and Architecture Constraints

Before implementation, inspect the current repository and identify the existing interfaces for:

- Simulation engine, event queue, virtual clock, event handlers, and run state.
- Demand generation and event persistence.
- Inventory positions, reservations, movements, and ledger reconciliation.
- Store coordinates, service areas, service zones, SKU inventory, and warehouse layouts.
- Order lifecycle and picking task models from Phase 03.
- Supplier delivery scheduling and simulation job orchestration from Phase 05.

Reuse existing interfaces and conventions wherever possible.

Requirements:

- Do not create a second simulation engine or a parallel inventory ledger.
- Do not mutate live operational order or inventory tables during simulations.
- Preserve immutable run IDs and run isolation.
- Keep policy implementations separate from the simulation engine.
- Use explicit configuration objects for policy parameters.
- Preserve deterministic execution for identical initial state, configuration, and random seed.
- Do not introduce new infrastructure dependencies unless essential and justified.
- Keep the implementation compatible with the existing Docker Compose setup and service boundaries.

Suggested module organization, adapted to the existing repository:

`services/simulation-worker/src/policies/`

- `replenishment.py`
- `allocation.py`
- `routing.py`
- `adapters.py`
- `config.py`

Use existing naming and package conventions if equivalent modules already exist.

## 2. Baseline Replenishment Policy

Implement a static reorder point and order-up-to-level policy using a historical moving average demand estimate.

### 2.1 Definitions

For each store/SKU pair, define:

- `s`: reorder point.
- `S`: order-up-to level, with `S > s`.
- `d_bar`: average demand per unit of simulated time, estimated from the configured historical window.
- `L`: supplier lead time in the same time units as the demand rate.
- `SS`: configured safety-stock quantity.
- `IP`: inventory position, calculated using simulation state.

Use the following inventory-position definition:

`IP = physical_on_hand - reserved_stock + outstanding_purchase_order_quantity`

If the existing simulation state defines inventory position differently, document the distinction and maintain a consistent accounting model.

### 2.2 Reorder Point

Provide a configurable reorder-point calculation:

`s = ceil(d_bar * L + SS)`

Use the moving-average demand estimate from historical demand observations available to the policy. If the history is insufficient, use a documented fallback or configured minimum. Never silently substitute future demand observations.

### 2.3 Order-Up-To Rule

When `IP < s`, calculate:

`Q = max(0, S - IP)`

If `Q > 0`, create a simulated purchase order for quantity `Q`.

Requirements:

- Keep `s`, `S`, `L`, `SS`, moving-average window, and fallback parameters explicit and configurable.
- Validate that `S > s >= 0`, `L >= 0`, and safety stock is nonnegative.
- Round calculated quantities according to the SKU's configured order unit or pack size where such metadata is available.
- Respect supplier/SKU relationships and configured supplier lead times.
- Avoid duplicate orders when an outstanding purchase order already covers the replenishment need.
- Re-evaluate inventory position before submitting another purchase order.
- Schedule supplier receipt using the existing virtual clock and event queue.
- Record purchase-order creation, scheduled delivery, and stock receipt in the simulation event stream.
- Apply inventory movements through the simulation's existing accounting mechanisms.
- Do not modify production inventory.

Document the moving-average observation window, time units, initialization behavior, and any demand-history fallback.

## 3. Baseline Order Allocation Policy

Implement a deterministic greedy nearest-eligible-store policy.

### 3.1 Eligibility

A candidate store must:

1. Be operational and available to accept orders.
2. Be serviceable for the customer's location under the existing service-area and service-zone rules.
3. Have sufficient available inventory for every SKU and requested quantity in the complete basket.
4. Be able to reserve the complete basket through the existing simulation inventory-reservation mechanism.

Do not treat a preliminary availability check as a reservation.

### 3.2 Distance and Selection

Use a documented distance metric based on actual store and customer coordinates.

- Use haversine distance for geographic latitude/longitude coordinates, unless the repository already defines a consistent alternative.
- If coordinates are missing or invalid, apply an explicit policy: exclude the candidate or return a documented validation failure. Never invent coordinates.
- Sort eligible candidates by ascending distance, with a stable store-ID tie-breaker.
- Revalidate availability when attempting the reservation because competing orders may change inventory.

### 3.3 Allocation Outcomes

Return an explicit outcome:

- `ALLOCATED`: the complete basket has been successfully reserved.
- `UNFULFILLABLE`: no eligible store can fulfill the complete basket.
- `RESERVATION_FAILED`: eligible candidates existed, but all reservation attempts failed.

Use existing domain statuses if equivalent values already exist, and document the mapping.

Requirements:

- Never split a basket across stores in this phase.
- Never mark an order allocated before its reservation succeeds.
- Never leave partial reservations behind when an allocation attempt fails.
- If reservation attempts fail, follow the existing compensation and inventory-release semantics.
- Do not retry candidates until any prior partial reservation has been confirmed released.
- Preserve idempotency and run isolation.
- Record the chosen store, evaluated candidates, distances, eligibility decisions, and final allocation outcome in the simulation event stream or structured decision metadata.

Do not introduce advanced workload scoring or MILP optimization in this phase.

## 4. Baseline Picker Routing Policy

Implement a deterministic S-Shape/Serpentine traversal or a greedy nearest-shelf heuristic using the existing warehouse layout graph.

Select the approach best supported by the current graph representation. Document why it was selected.

### 4.1 Graph Requirements

Treat the warehouse layout as a graph:

- Nodes represent valid walkable locations, shelf access points, or the dispatch station.
- Edges represent permitted movement between connected locations.
- Edge weights represent travel distance or travel cost.
- Blocked aisles, walls, and inaccessible shelf locations must not be traversed.

Never connect two shelves directly merely because their coordinates are close.

### 4.2 Route Generation

Given a picking task:

1. Resolve every requested SKU to its valid shelf access location using the active warehouse layout.
2. Verify that the dispatch station exists and is reachable.
3. Generate a deterministic route starting at the dispatch station.
4. Visit every required item location.
5. Return to the dispatch station.
6. Calculate route distance and estimated travel duration from the graph's edge weights and configured walking speed.

If an item has multiple possible shelf locations, apply a documented deterministic selection rule.

If any required shelf is missing, unreachable, or invalid, return an explicit routing failure. Do not fabricate a route or silently omit an item.

### 4.3 Path Validation

Validate the complete route:

- The first node is the dispatch station.
- The last node is the dispatch station.
- Every consecutive pair of nodes has a valid graph edge.
- Every required item location is visited.
- No blocked or nonexistent nodes are traversed.
- Route distance equals the sum of the selected edge weights.
- Travel duration is derived consistently from route distance and walking speed.

Use graph search such as BFS for unweighted connectivity or Dijkstra's algorithm for nonnegative weighted edges when validating or connecting required stops.

The routing policy must remain deterministic under the same graph, picking task, and configuration.

## 5. Policy Adapters and Simulation Integration

Implement policy adapters that connect all three policies to the Phase 05 simulation engine.

The adapters should translate existing simulation events and state into policy inputs, invoke the appropriate policy, and schedule the resulting events through the existing event queue.

Integrate:

- Replenishment evaluation at documented inventory/demand milestones.
- Allocation decisions on order-arrival/allocation events.
- Route generation when a picking task becomes ready to execute.
- Item-pick and picking-completion events using the selected route.
- Supplier-delivery receipt using the existing simulated lead-time mechanism.

Requirements:

- Preserve existing event priority and sequence-number semantics.
- Avoid scheduling duplicate events when an event is retried.
- Use the existing event handlers and run state wherever possible.
- Record policy identifiers and configuration versions with each run.
- Ensure policy execution does not introduce wall-clock sleeps or nondeterministic external calls.
- Keep simulated time independent of wall-clock execution time.

## 6. End-to-End Operating-Day Scenario

Create a deterministic scenario that exercises all three baseline policies.

Target scenario:

- One simulated operating day of 24 virtual hours.
- Approximately 200 generated orders.
- Multiple stores where the existing scenario supports them.
- Multiple concurrent orders.
- Multiple SKUs and complete multi-item baskets.
- Inventory reservations and picking tasks.
- Supplier purchase orders and deliveries with simulated lead times.
- At least some replenishment-triggering conditions.
- At least some unfulfillable orders if supported by the configured scenario.
- Completed, failed, or cancelled workflows as appropriate.

The scenario must exercise replenishment, allocation, and routing rather than merely instantiate the policies.

Acceptance conditions:

1. The run completes without an unhandled exception.
2. Every generated order reaches a terminal state: `PICKED`, `READY`, `CANCELLED`, or `FAILED`, according to the existing order lifecycle.
3. Every fulfilled order has a consistent reservation and picking history.
4. Every requested item is accounted for as picked, missing, damaged, cancelled, or otherwise explicitly resolved under the existing domain rules.
5. Supplier receipts occur only at or after their scheduled virtual delivery times.
6. Inventory and reservation invariants remain valid throughout the run.
7. Every simulated stock change is reflected consistently in the simulation ledger.
8. All lifecycle and inventory movement events are persisted to the run-scoped event log.
9. Production operational tables remain untouched.
10. The run is reproducible using its recorded seed, scenario, policy identifiers, and policy configuration.

If the current demand model cannot guarantee exactly 200 orders, configure the scenario appropriately or document the generated count and the reason for any deviation.

## 7. Required Tests

### Unit Tests

**Replenishment**
- Moving-average demand calculation.
- Reorder-point calculation.
- No order when inventory position is at or above `s`.
- Correct order quantity when inventory position falls below `s`.
- Pack-size rounding, where applicable.
- No duplicate replenishment orders while an order is outstanding.
- Supplier lead-time and delivery-event scheduling.

**Allocation**
- Nearest eligible store wins.
- Ineligible stores are excluded.
- Complete basket availability is required.
- Equal-distance ties resolve deterministically.
- Reservation failures do not create false allocations.
- Partial reservations are compensated before retry or failure.
- No eligible store returns the explicit unfulfillable outcome.

**Routing**
- Route starts and ends at the dispatch station.
- Every requested shelf is visited.
- Every route edge exists in the layout graph.
- Blocked nodes and disconnected shelves produce explicit failures.
- Route distance and travel duration are correct.
- Identical inputs produce identical routes.

### Integration Tests

Run the end-to-end simulation against the actual test infrastructure used by the repository.

Verify:

- A complete 24-hour operating day.
- At least 500 validated operational events.
- Successful execution of replenishment, allocation, and picking.
- Valid supplier delivery timing.
- Terminal outcomes for all orders.
- Inventory ledger and reservation reconciliation.
- Run isolation and absence of production-table writes.
- Reproducibility under the same seed and policy configuration.

### Regression Tests

Run relevant existing tests for the simulation engine, inventory core, order lifecycle, warehouse graph validation, and worker job lifecycle.

Report actual commands and test output. Do not claim tests passed unless they were executed.

## 8. Documentation

Create `docs/policies/baseline-policies.md` containing:

- Purpose and limitations of each baseline.
- Mathematical definitions and equations.
- Default parameters and their units.
- Moving-average demand estimation and fallback behavior.
- Inventory-position and outstanding-purchase-order semantics.
- Store eligibility, distance metric, and deterministic tie-breaking.
- Routing algorithm and graph-validity guarantees.
- Policy identifiers and configuration versioning.
- Reproduction instructions for the end-to-end scenario.
- KPIs emitted by the run, if available.
- Known limitations and deferred optimization work.

Do not claim a policy is optimal. These are baseline heuristics for comparison with future algorithms.

## 9. Completion Report

Provide a completion report in this format:

### Phase 06 Completion Report

- **Baseline Replenishment:** Equations, parameters, tests, and observed behavior.
- **Baseline Allocation:** Eligibility, distance metric, outcomes, and tests.
- **Baseline Routing:** Algorithm, path-validity results, and tests.
- **End-to-End Simulation:** Orders generated, terminal outcomes, events recorded, virtual duration, and wall-clock runtime.
- **Inventory Integrity:** Reservation and ledger reconciliation results.
- **Determinism:** Seed, policy configuration, and reproducibility results.
- **Test Results:** Exact commands and actual pass/fail/skip counts.
- **Files Changed:** Created and modified files.
- **Known Limitations:** Unimplemented behavior and unresolved risks.
- **Phase 07 Readiness:** Whether the event stream contains sufficient information for KPI calculation and aggregation.

Do not begin Phase 07 or advanced optimization in this phase. Complete, test, document, and report Phase 06 only.