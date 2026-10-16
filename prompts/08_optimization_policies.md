# Phase 08 — Optimization Policies

## Objective
Implement deterministic, constraint-based optimization engines using Python, FastAPI, and OR-Tools within `services/optimization-service` for demand-aware replenishment, workload-aware multi-store order allocation, and graph-based picker path minimization.

## Scope
- Implement the Optimization Service endpoints and solvers:
  - **Replenishment Optimizer (`/api/v1/optimize/replenishment`)**: Formulate multi-period inventory replenishment problem incorporating lead times, review periods, safety stock targets, supplier pack sizes, MOQs, storage limits, and holding vs. stockout penalty trade-offs.
  - **Constrained Multi-Store Allocation Optimizer (`/api/v1/optimize/allocation`)**: Formulate multi-criteria allocation balancing travel distance, store current picking backlog/queue depth, and remaining stock safety buffers to minimize SLA breach risk.
  - **Picker Path Optimizer (`/api/v1/optimize/picker-route`)**: Model warehouse aisles and shelf nodes as a graph and solve the Traveling Salesperson Problem (TSP) / shortest valid traversal through required pick locations using OR-Tools Routing or Dijkstra/A* graph search.
- Return structured result envelopes: objective value, decision variables, constraint feasibility status, execution duration, and human-readable decision factors/explanations.
- Support explicit fallback behavior when optimization is infeasible or times out.

## Dependencies
- Phase 01: Domain Contracts (Warehouse layouts, stores, SKUs).
- Phase 06: Baseline Policies (to serve as comparison benchmarks and fallbacks).

## Business & Engineering Invariants
- Statelessness Invariant: The optimization service must remain 100% stateless. It must not connect to the database or retain session memory across requests.
- Feasibility Invariant: If constraints cannot be satisfied (e.g., zero stores have inventory, or timeout occurs), return an explicit `INFEASIBLE` or `TIMEOUT` status with unmet constraint details; never silently violate hard constraints or invent feasible results.
- Valid Route Invariant: Every optimized route must be verified as a connected, collision-free walk through aisle nodes.

## Acceptance Criteria
1. Route optimizer produces paths that are demonstrably equal to or shorter in distance than the Phase 06 baseline S-shape heuristic on identical order baskets.
2. Infeasible allocation requests (e.g., SKU quantity exceeds total regional stock) return HTTP 200/422 with status `INFEASIBLE` and explanatory diagnostics.
3. Replenishment recommendations respect supplier MOQ and pack size multiples (e.g., order quantity must be an integer multiple of pack size).
4. Solvers execute within strict time limits (e.g., < 250ms for routing and allocation, < 2s for multi-SKU replenishment).

## Required Tests
- Unit tests: Mathematical formulations, constraint checks (MOQ, pack size, storage capacity), graph distance solvers.
- Benchmark tests: Comparing optimized picker path lengths vs. baseline S-shape paths across 50 test layouts and baskets.
- Infeasibility tests: Submitting over-constrained problems and asserting explicit infeasible status responses.

## Documentation Updates
- Create `docs/optimization/formulations.md` defining objective functions, decision variables, constraints, and solver configurations.
- Document OpenAPI schemas for all optimization endpoints.

## Completion Report Format
```markdown
### Phase 08 Completion Report
- **Solvers Implemented**: [replenishment, allocation, picker routing]
- **Benchmark Comparison vs. Baseline**: [distance reduction %, allocation queue balance metrics]
- **Constraint & Infeasibility Handling Verified**: [test outputs]
- **Next Steps**: [Phase 09 readiness]
```
