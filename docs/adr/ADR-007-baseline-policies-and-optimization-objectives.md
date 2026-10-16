# ADR-007: Baseline Policies, Optimization Objectives, and Constraints

- **Status**: Accepted
- **Date**: 2026-10-16
- **Context**: To demonstrate the value of optimization, we need transparent, realistic baseline heuristics to compare against OR-Tools mathematical optimization across replenishment, store allocation, and picker routing.

## Decision
1. **Three Paired Capabilities**:
   - **Replenishment**:
     - *Baseline*: Static Reorder Point `(s, S)` rule using moving-average demand.
     - *Optimized*: Multi-period Mixed Integer Linear Programming (MILP) minimizing holding cost + ordering cost + stockout penalties subject to lead time, MOQ, pack sizes, and storage volume constraints.
   - **Order Allocation**:
     - *Baseline*: Greedy nearest-eligible store with full basket availability.
     - *Optimized*: Workload-aware multi-criteria optimization balancing travel distance, store picking queue backlog, and regional stock protection to minimize delivery SLA breaches.
   - **Picker Routing**:
     - *Baseline*: S-Shape / Serpentine traversal heuristic across warehouse aisles.
     - *Optimized*: Traveling Salesperson Problem (TSP) / route minimization over the warehouse graph using OR-Tools Routing solver.
2. **Explicit Fallbacks**: If an optimization solver times out or encounters infeasibility, it logs the condition and cleanly falls back to the baseline heuristic.

## Alternatives Considered
- *Black-box reinforcement learning (RL)*: Hard to explain, sample-inefficient, non-deterministic, and prone to hallucinations.
- *Comparing optimization against random actions*: Unfair strawman; baseline must represent realistic operational heuristics.

## Consequences
- **Positive**: Clear, defensible comparison benchmarks; deterministic optimization with explainable decision variables; safe fallbacks under solver timeout.
- **Negative**: Requires maintaining two implementations for each capability (heuristic baseline + MILP/OR optimizer).
