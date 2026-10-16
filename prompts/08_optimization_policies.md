# Phase 08 — Optimization Policies

## Objective

Implement deterministic, constraint-based optimization engines in `services/optimization-service` using Python, FastAPI, and OR-Tools.

Upgrade DarkOps AI from baseline heuristics to mathematically formulated optimization policies for:

1. Multi-period, demand-aware inventory replenishment.
2. Workload-aware, constrained multi-store order allocation.
3. Graph-valid picker route minimization.

The optimization service must remain stateless and independent of PostgreSQL. It receives explicit problem inputs, solves the problem within configured resource limits, and returns structured, reproducible decisions.

Use Phase 06 policies as baselines and fallback candidates, and Phase 07 evaluation outputs and definitions as the basis for comparing performance.

The objective is not merely to return a solver solution. It is to return a valid, explainable decision and demonstrate whether it improves upon the baseline.

## 1. Repository Inspection and Architecture Constraints

Before implementation, inspect the existing repository and identify:

- `services/optimization-service` application structure and dependencies.
- Existing FastAPI routers, request/response models, health checks, and error handling.
- Existing domain contracts for stores, SKUs, supplier relationships, pack sizes, storage capacity, service areas, and warehouse layouts.
- Phase 06 baseline policy implementations and their input/output conventions.
- Phase 07 KPI definitions, units, and comparison semantics.
- Existing Docker Compose configuration, network settings, and service health checks.
- Relevant ADRs and API response conventions.

Reuse existing contracts wherever possible.

Requirements:

- Keep the optimization service stateless.
- Do not connect directly to PostgreSQL or write to operational tables.
- Do not retain mutable optimization state across requests.
- Do not silently fall back to an undocumented default when required inputs are missing.
- Do not invent stock levels, coordinates, graph edges, costs, demand observations, or feasible decisions.
- Do not weaken hard constraints to obtain a solver solution.
- Keep mathematical formulations separate from HTTP handlers.
- Use explicit, validated configuration objects.
- Use deterministic variable construction, input ordering, tie-breaking, and solver configuration wherever supported.
- Do not introduce another simulation engine or duplicate the Phase 05 event-processing system.
- Preserve existing service and API conventions.
- Add only the dependencies required by the chosen solver implementations.

Suggested package organization, adapted to the repository's existing conventions:

`services/optimization-service/`

- `routers/replenishment.py`
- `routers/allocation.py`
- `routers/picker_route.py`
- `models/requests.py`
- `models/responses.py`
- `solvers/replenishment.py`
- `solvers/allocation.py`
- `solvers/routing.py`
- `solvers/graph.py`
- `policies/fallbacks.py`
- `tests/`
- `docs/optimization/formulations.md`

Do not duplicate existing modules if equivalent implementations already exist.

## 2. Common Solver Contract

All three endpoints must return a standardized response containing:

- `status`: solver outcome.
- `objective_value`: objective value, when meaningful.
- `decisions`: structured decision variables.
- `constraint_status`: hard-constraint validation results.
- `execution_time_ms`: measured wall-clock solver execution duration.
- `solver`: algorithm and configuration metadata.
- `explanations`: human-readable decision factors.
- `diagnostics`: relevant feasibility, timeout, or data-quality details.
- `fallback`: whether a fallback was attempted or used.

Use consistent status semantics:

- `OPTIMAL`: an optimal solution was proven.
- `FEASIBLE`: a valid solution was found, but optimality was not proven.
- `INFEASIBLE`: the submitted valid problem has no solution satisfying the modeled constraints.
- `TIMEOUT`: the solver did not establish a usable result within its configured limit.
- `INVALID_INPUT`: the request violates input validation or required data is missing.
- `ERROR`: an unexpected solver or execution failure occurred.

Do not claim `OPTIMAL` merely because a solver returned a solution before the time limit.

When a solver returns `FEASIBLE`, return the incumbent solution only after independently validating all hard constraints.

When a solver returns `INFEASIBLE` or `TIMEOUT`, do not return a fabricated optimized solution.

For a valid request that is infeasible, prefer HTTP 200 with `status: INFEASIBLE` and explanatory diagnostics. Use HTTP 422 for malformed or semantically invalid input. Follow existing API conventions if they require a different consistent mapping, and document it.

### Determinism

For identical normalized inputs and solver configuration:

- Use stable ordering for stores, SKUs, orders, graph nodes, and variables.
- Use deterministic tie-breaking where multiple equivalent solutions exist.
- Configure random seeds and solver parallelism explicitly where applicable.
- Avoid wall-clock timestamps or random IDs inside decision calculations.
- Separate non-deterministic metadata, such as measured execution duration, from the decision output.

A deterministic configuration does not guarantee that every solver or platform will produce the same optimum under all circumstances. Document any remaining limitations.

## 3. Replenishment Optimizer

Endpoint:

`POST /api/v1/optimize/replenishment`

### 3.1 Objective

Optimize inventory replenishment over a finite planning horizon by balancing:

- Inventory holding costs.
- Estimated stockout penalties.
- Supplier order transaction costs.
- Supplier lead times.
- Demand forecasts.
- Review periods.
- Safety-stock targets.
- Supplier minimum order quantities.
- Supplier pack sizes.
- Store storage-capacity constraints.

The optimizer must improve upon or benchmark against the Phase 06 static reorder-point/order-up-to baseline.

### 3.2 Input Contract

Accept explicit inputs for:

- Planning horizon and time-step duration.
- Store/SKU identifiers.
- Opening physical inventory and reserved inventory.
- Forecast demand by SKU and time period.
- Forecast units and time units.
- Supplier lead times.
- Supplier/SKU eligibility.
- Supplier minimum order quantities.
- Supplier pack sizes.
- Existing outstanding purchase orders and scheduled receipts.
- Storage capacities and SKU storage requirements.
- Safety-stock targets.
- Holding cost coefficients.
- Stockout penalty coefficients.
- Purchase order transaction costs.
- Cost currency.
- Solver time limit and configuration.

Validate all quantities, units, costs, and identifiers.

If demand forecasts are absent, do not invent them. Return `INVALID_INPUT` unless a documented and explicitly configured fallback forecast is provided.

### 3.3 Mathematical Formulation

Use OR-Tools CP-SAT, MILP, or another appropriate solver supported by the existing stack. Document the selection and any required integer scaling.

For SKU \(i\) and period \(t\), define:

- \(I_{i,t}\): end-of-period on-hand inventory.
- \(R_{i,t}\): expected demand.
- \(O_{i,t}\): quantity ordered in period \(t\).
- \(A_{i,t}\): quantity received in period \(t\), including previously outstanding orders.
- \(U_{i,t}\): unfulfilled demand or shortage variable.
- \(C^H_i\): holding cost per unit-period.
- \(C^S_i\): stockout penalty per unit.
- \(C^P_i\): purchase order transaction cost.

Use a consistent inventory-balance equation:

\[
I_{i,t}=I_{i,t-1}+A_{i,t}-R_{i,t}+U_{i,t}
\]

with the appropriate nonnegative inventory and shortage constraints.

The objective should minimize:

\[
\min \sum_{i,t}
\left(
C^H_i I_{i,t}
+C^S_i U_{i,t}
+C^P_i Y_{i,t}
\right)
\]

where \(Y_{i,t}\) indicates whether an order is placed, with purchase order transaction costs applied only when appropriate.

The exact objective may be extended to include other explicitly configured costs, but all terms, units, and assumptions must be documented.

### 3.4 Hard Constraints

Enforce:

- Nonnegative inventory and order quantities.
- Demand and inventory conservation.
- Supplier eligibility for each SKU.
- Supplier lead times and receipt periods.
- Existing outstanding purchase orders and scheduled receipts.
- Minimum order quantities.
- Pack-size multiples.
- Storage capacity.
- Configured safety-stock constraints or targets.
- Any applicable order frequency or supplier constraints.

For supplier pack size \(P_i\):

\[
O_{i,t}=P_i K_{i,t},\qquad K_{i,t}\in\mathbb{Z}_{\geq 0}
\]

When an order is placed, enforce the supplier MOQ. If no order is placed, order quantity remains zero.

Do not round a continuous solution after solving if doing so can violate feasibility. Model integer order quantities directly.

Document whether safety stock is a hard constraint or a soft target with a penalty. Do not silently mix the two.

If storage capacity, supplier constraints, and demand requirements cannot all be satisfied, return explicit infeasibility diagnostics.

### 3.5 Output

Return:

- Recommended purchase orders by SKU, supplier, quantity, and period.
- Expected receipt times.
- Projected inventory trajectory.
- Expected shortages and service-level outcomes.
- Objective value and cost breakdown.
- Constraint validation results.
- Comparison against the supplied baseline plan, when available.
- Solver status and execution duration.
- Human-readable reasons for the major decisions.

Do not create real purchase orders or mutate inventory. This endpoint returns recommendations only.

## 4. Multi-Store Allocation Optimizer

Endpoint:

`POST /api/v1/optimize/allocation`

### 4.1 Objective

Allocate a batch of orders to eligible stores while balancing:

- Estimated customer travel distance.
- Current store picking backlog and queue depth.
- Remaining inventory safety buffers.
- Expected fulfillment time.
- SLA breach risk.

Unlike the Phase 06 nearest-eligible-store policy, this optimizer must consider the effects of multiple allocations on the same store.

### 4.2 Input Contract

Accept explicit data for:

- Orders and complete SKU/quantity baskets.
- Customer locations.
- Store identifiers, coordinates, and operational status.
- Serviceability and service-zone eligibility.
- Available inventory by store/SKU.
- Reserved inventory and relevant inventory buffers.
- Current store backlog and queue depth.
- Estimated picking and fulfillment times.
- SLA deadlines or configured SLA thresholds.
- Objective weights or cost coefficients.
- Solver time limit and configuration.

Validate coordinates, quantities, store IDs, SKU IDs, and units.

Do not infer missing inventory or queue data. Return `INVALID_INPUT` if required data is unavailable and no documented fallback has been configured.

### 4.3 Decision Variables

Define:

\[
x_{o,s}\in\{0,1\}
\]

where \(x_{o,s}=1\) means order \(o\) is assigned to store \(s\).

Define:

\[
u_o\in\{0,1\}
\]

where \(u_o=1\) means the order cannot be allocated under the modeled constraints.

### 4.4 Hard Constraints

Each order must be assigned to at most one store:

\[
\sum_s x_{o,s}\leq 1
\]

Require an explicit unallocated outcome:

\[
\sum_s x_{o,s}+u_o=1
\]

Only eligible stores may receive an order. Eligibility must account for:

- Store operational status.
- Customer serviceability.
- Complete basket availability.
- Required inventory safety buffers.
- Other configured hard operational constraints.

For every store \(s\) and SKU \(k\):

\[
\sum_o q_{o,k}x_{o,s}\leq A_{s,k}
\]

where \(q_{o,k}\) is the requested quantity and \(A_{s,k}\) is the allocatable quantity after applying the documented inventory-buffer rules.

Do not split baskets across stores in this phase.

Do not allow one unit of stock to satisfy multiple orders.

Do not treat an allocation recommendation as a completed inventory reservation. Actual execution must revalidate stock and reserve inventory through the existing operational inventory workflow.

### 4.5 Objective

Use a documented weighted or lexicographic objective that prioritizes avoiding unallocated orders and SLA breaches, followed by operational efficiency.

A possible weighted objective is:

\[
\min
\left(
\lambda_U\sum_o u_o
+\lambda_D\sum_{o,s}d_{o,s}x_{o,s}
+\lambda_Q\sum_{o,s}Q_s x_{o,s}
+\lambda_B\sum_{o,s}B_{o,s}x_{o,s}
\right)
\]

where:

- \(d_{o,s}\): estimated customer travel distance.
- \(Q_s\): normalized store workload or queue measure.
- \(B_{o,s}\): estimated SLA breach penalty or risk.
- \(\lambda_U,\lambda_D,\lambda_Q,\lambda_B\): explicit configuration weights.

Avoid arbitrary, unnormalized weights. Document their units, calibration, and relative importance.

Prefer lexicographic optimization or provably dominant penalties when the business requires one objective to take priority over another.

The optimizer must not sacrifice hard feasibility constraints to improve its objective.

### 4.6 Output

Return:

- Assigned store per order.
- Explicit unallocated orders and reasons.
- Estimated distance, queue impact, and SLA metrics.
- Store workload before and after the proposed assignment.
- Remaining projected stock buffers.
- Objective value and component breakdown.
- Constraint validation results.
- Solver status and execution duration.
- Human-readable decision factors.

Support deterministic output ordering.

The optimizer must return `INFEASIBLE` or an explicit unallocated outcome when no valid assignment exists. It must not fabricate an allocation or silently split a basket.

## 5. Picker Route Optimizer

Endpoint:

`POST /api/v1/optimize/picker-route`

### 5.1 Objective

Find a valid, low-distance picking route through the warehouse layout graph.

The route must start at the dispatch station, visit every required item location, and return to the dispatch station.

Use the Phase 06 baseline S-Shape or greedy nearest-shelf route for benchmarking.

### 5.2 Graph Contract

The request must include:

- Warehouse layout identifier and version.
- Graph nodes and permitted edges.
- Node types and coordinates where available.
- Edge distances or traversal costs.
- Dispatch station.
- Required pick locations and item identifiers.
- Optional directionality or traversal restrictions.
- Solver time limit and configuration.

Treat the graph as the authoritative representation of walkable space.

Requirements:

- Never invent an edge between nearby nodes.
- Never traverse a blocked node or edge.
- Validate that all required pick locations exist.
- Validate reachability from the dispatch station.
- Preserve graph directionality when directed edges are configured.
- Use consistent distance units, preferably meters.

### 5.3 Solver Design

Use a two-layer approach.

**Layer A — Graph shortest paths**

Use Dijkstra or A* to calculate valid shortest paths between the dispatch station and required pick locations.

- Retain Dijkstra as a reliable reference implementation.
- A* may be used for point-to-point queries when a valid admissible heuristic is available.
- If coordinates and edge weights are used, ensure the heuristic never overestimates the actual remaining graph distance.
- Do not use Euclidean distance as the final route distance when warehouse aisles require a longer graph path.

**Layer B — Stop ordering**

Use OR-Tools Routing or another documented deterministic heuristic to order the required pick locations.

For a modest number of stops, formulate the route as a TSP over shortest-path distances between required locations, with the dispatch station as the start and end depot.

For larger instances, configure appropriate solver limits and return a valid feasible route when available.

Do not confuse shortest paths between nodes with the optimization of the complete multi-stop picking sequence.

### 5.4 Route Reconstruction and Validation

After selecting the stop sequence:

1. Reconstruct the complete path using the actual graph edges.
2. Include all intermediate aisle nodes.
3. Confirm that every requested pick location is visited.
4. Confirm that the first and last nodes are the dispatch station.
5. Confirm that every consecutive node pair corresponds to a valid permitted edge.
6. Recompute total distance from the reconstructed path.
7. Verify that the reported objective matches the validated route distance.

If any required item location is unreachable, return `INFEASIBLE` with the affected locations and diagnostics.

Do not return a route that silently omits an item.

### 5.5 Baseline Comparison

For every benchmark case, compare the optimized route with the Phase 06 baseline using:

- The same warehouse graph and layout version.
- The same dispatch station.
- The same required item locations.
- The same distance units.
- The same route start/end requirements.

Report:

\[
\text{Distance Reduction \%}
=
\frac{D_{\text{baseline}}-D_{\text{optimized}}}
{D_{\text{baseline}}}\times 100
\]

If baseline distance is zero, report percentage reduction as unavailable and explain why.

The optimized route must never be reported as better if its validated distance exceeds the baseline distance. If the solver times out and only a worse feasible route is available, return the measured result and explicitly identify the outcome; do not mislabel it as an improvement.

## 6. Time Limits and Fallback Policies

Configure independent time limits:

- Routing: target under 250 ms for the documented benchmark workload.
- Allocation: target under 250 ms for the documented benchmark workload.
- Replenishment: target under 2 seconds for the documented benchmark workload.

Measure actual execution duration. Do not guarantee these limits for every possible input size.

When a time limit is reached:

1. Return a valid incumbent solution only if the solver provides one and independent constraint validation succeeds.
2. Otherwise return `TIMEOUT`.
3. Attempt the corresponding Phase 06 baseline only when its inputs are valid and its result can be independently verified.
4. Label fallback output explicitly with its policy identifier and reason.
5. Never claim a fallback result is optimal.
6. Never silently relax hard constraints to produce a result.

Fallbacks:

- Replenishment: Phase 06 static ROP/order-up-to policy.
- Allocation: Phase 06 nearest-eligible-store policy.
- Routing: Phase 06 S-Shape or greedy nearest-shelf policy, reconstructed and validated against the same graph.

If a baseline fallback cannot produce a feasible result, return the explicit failure status and diagnostics.

Distinguish solver infeasibility from timeout, malformed input, and unexpected execution failure.

## 7. API and Service Requirements

Implement:

- `POST /api/v1/optimize/replenishment`
- `POST /api/v1/optimize/allocation`
- `POST /api/v1/optimize/picker-route`

Requirements:

- Use Pydantic request and response models.
- Validate inputs before invoking solvers.
- Return structured response envelopes.
- Document status codes and solver outcomes.
- Include objective values, decisions, feasibility checks, execution duration, solver metadata, and explanations.
- Expose the endpoints in the service's canonical OpenAPI specification.
- Preserve existing health checks and Docker Compose behavior.
- Keep all requests independent and free of persistent session state.
- Bound computational resources and avoid unbounded solver execution.
- Ensure malformed or excessively large requests cannot bypass configured limits.

A successful HTTP response must not imply that the solver proved optimality. The response `status` is authoritative.

## 8. Required Tests

### Replenishment Unit Tests

- Inventory-balance equations.
- Demand and lead-time handling.
- Supplier MOQ.
- Pack-size multiples.
- Storage capacity.
- Safety-stock enforcement.
- Outstanding purchase orders.
- Supplier eligibility.
- Infeasible storage or supply constraints.
- Timeout and fallback behavior.
- Deterministic repeated solves.

### Allocation Unit Tests

- Store serviceability and operational status.
- Complete-basket inventory constraints.
- Shared inventory across simultaneous orders.
- Inventory safety buffers.
- Queue/workload impact.
- SLA breach penalties.
- Explicit unallocated orders.
- Infeasible and malformed requests.
- Timeout and fallback behavior.
- Deterministic tie-breaking.

### Routing Unit Tests

- Graph connectivity and reachability.
- Valid directed and undirected edges as configured.
- Blocked edges and nodes.
- Dispatch start/end requirements.
- Complete pick-location coverage.
- Dijkstra/A* shortest-path correctness.
- TSP or stop-ordering behavior.
- Route distance recalculation.
- Infeasible disconnected layouts.
- Timeout and fallback behavior.

### Benchmark Tests

**Picker routing**

Benchmark at least 50 deterministic warehouse layouts and picking baskets.

Record for every case:

- Number of graph nodes and edges.
- Number of required stops.
- Baseline distance.
- Optimized distance.
- Distance reduction percentage.
- Solver execution duration.
- Feasibility and path-validation outcome.

Include both small and larger layouts.

Do not require every case to produce a positive distance reduction; equivalent routes and solver timeouts may occur. Require all returned routes to be valid and require every claimed improvement to be supported by measured distances.

**Allocation**

Compare baseline and optimized policies using identical order batches, inventory, store states, demand inputs, and SLA assumptions.

Report:

- Fulfilled and unallocated order counts.
- Store workload distribution.
- Queue depth or queue-related metrics where available.
- Estimated SLA breaches.
- Objective values.
- Execution time.

**Replenishment**

Compare baseline and optimized plans under identical demand scenarios, opening inventory, supplier lead times, and cost assumptions.

Report:

- Purchase order quantities and timings.
- Projected shortages.
- Holding cost.
- Stockout penalties.
- Purchase order costs.
- Total objective value.
- Constraint validation results.

### Infeasibility Tests

Submit requests with:

- No eligible stores.
- Requested quantities exceeding available regional stock.
- Disconnected required shelf locations.
- Supplier MOQ conflicting with storage capacity.
- Impossible safety-stock requirements.
- Invalid or missing required coordinates.
- Missing supplier relationships.
- Time limits too restrictive to obtain a validated solution.

Assert explicit status codes, solver statuses, and useful diagnostics. Never assert fabricated feasible outputs.

### Service Tests

- FastAPI endpoint request/response validation.
- OpenAPI schema correctness.
- Stateless behavior across repeated requests.
- No database connection attempts.
- Health-check regression.
- Configured solver time-limit handling.
- Actual measured benchmark runtimes.

Run the tests in the existing project environment and report actual outcomes.

## 9. Documentation

Create `docs/optimization/formulations.md`.

Document each optimization domain separately.

For every formulation, include:

- Business problem and scope.
- Decision variables.
- Objective function.
- Hard constraints and soft penalties.
- Units and normalization.
- Input and output schemas.
- Solver selection and configuration.
- Determinism and tie-breaking.
- Time-limit behavior.
- Infeasibility diagnostics.
- Baseline fallback behavior.
- Known limitations.
- Benchmark methodology and results.

Also document the API schemas in the canonical OpenAPI specification.

Explicitly state that the results are recommendations based on supplied data and modeled assumptions. They are not guaranteed real-world improvements until validated against appropriate operational evidence.

## 10. Completion Report

Provide:

### Phase 08 Completion Report

- **Solvers Implemented:** Replenishment, allocation, and routing formulations.
- **Mathematical Formulations:** Decision variables, objectives, and hard constraints.
- **Benchmark Comparison vs. Baseline:** Measured route distance changes, allocation outcomes, workload distribution, and replenishment cost comparisons.
- **Constraint Validation:** Actual test outcomes for MOQ, pack sizes, storage capacity, serviceability, stock availability, and graph validity.
- **Infeasibility and Timeout Handling:** Verified statuses, diagnostics, and fallback behavior.
- **Performance:** Actual execution-time distributions and benchmark input sizes.
- **Determinism:** Repeated-run comparison results and configuration details.
- **API and Documentation:** Endpoints, OpenAPI changes, and formulation documentation.
- **Test Results:** Commands and actual pass/fail/skip counts.
- **Files Changed:** Created and modified files.
- **Known Limitations:** Unsupported constraints, data assumptions, and unresolved risks.
- **Phase 09 Readiness:** Whether optimization results can be reliably evaluated and integrated into the broader DarkOps AI workflow.

Complete Phase 08 only. Do not begin Phase 09 or add unrelated dashboard functionality.