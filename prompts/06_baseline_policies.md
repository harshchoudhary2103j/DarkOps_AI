# Phase 06 — Baseline Policies

## Objective
Implement transparent, deterministic baseline policies for inventory replenishment, order allocation, and picker routing, and execute an end-to-end simulated operating day producing a complete event stream.

## Scope
- Implement Baseline Policies:
  - **Baseline Replenishment**: Static reorder point (ROP) and order-up-to-level `(s, S)` rule per SKU/store based on historical moving average demand.
  - **Baseline Order Allocation**: Greedy nearest-eligible store policy selecting the closest operational store with complete basket inventory availability.
  - **Baseline Picker Routing**: Standard heuristic routing (e.g., S-Shape / Serpentine traversal or greedy nearest-shelf sequence) across the warehouse layout graph.
- Implement simulation policy adapters binding these baseline strategies to the discrete-event simulation engine.
- Execute an end-to-end simulated operating day (e.g., 24 virtual hours with 200 orders, stock receipts, and picking completions).
- Record all lifecycle and movement events to the simulation run event log.

## Dependencies
- Phase 03: Order Lifecycle.
- Phase 05: Simulation Engine.

## Business & Engineering Invariants
- Baseline policies must be transparent, deterministic, and fully reproducible given the same state and seed.
- If no eligible store has complete stock for an order, the baseline allocation policy must return an explicit `UNFULFILLABLE` status; it must not split the basket or fake an allocation.
- The picker route must be a strictly valid graph path: every movement between shelves must follow defined aisles without walking through walls or racks.

## Acceptance Criteria
1. Baseline policies execute without error across 24 simulated hours with multiple concurrent orders.
2. Every order in the simulation reaches a terminal state (`PICKED`, `READY`, `CANCELLED`, or `FAILED`).
3. Reorder recommendations are triggered when inventory falls below `s` and generate valid purchase orders that arrive after simulated supplier lead times.
4. Picker routes verify that all requested items are visited and the picker starts and ends at the dispatch station.

## Required Tests
- Unit tests: Baseline ROP calculation, nearest store distance selection, S-shape picker traversal validity.
- Integration tests: End-to-end simulation run under baseline policy emitting at least 500 validated operational events.
- Path validity tests: Checking generated picker paths against warehouse obstacle and graph definitions.

## Documentation Updates
- Create `docs/policies/baseline-policies.md` defining the mathematical equations, algorithms, and default parameters for all three baselines.

## Completion Report Format
```markdown
### Phase 06 Completion Report
- **Baseline Implementations**: [ROP replenishment, nearest-store allocation, S-shape routing]
- **End-to-End Simulation Run**: [orders processed, events recorded, virtual runtime]
- **Verification of Path & Allocation Validity**: [test outcomes]
- **Next Steps**: [Phase 07 readiness]
```
