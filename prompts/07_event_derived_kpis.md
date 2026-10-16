# Phase 07 — Event-Derived KPIs

## Objective
Implement the Experiment Evaluator and KPI Reporting engine to compute operational, service-level, and economic metrics strictly from recorded simulation events with mathematical rigor and reproducible reporting.

## Scope
- Implement the KPI Aggregator module:
  - **Fulfillment & Service KPIs**: Order fill rate, line fill rate, stockout rate (% of requested units unfulfilled), stockout incident counts.
  - **Operational Efficiency KPIs**: Mean picking duration, total picker travel distance (meters), order turnaround time (creation to ready), picker idle time vs. active time.
  - **Economic & Inventory Cost Estimates**: Holding cost (carrying cost per unit-hour), estimated lost sales / stockout penalties, purchase order transaction costs, and perishability/expiry waste.
  - **Workload & Queue KPIs**: Peak store queue depth, allocation latency, backlog duration.
- Implement the Fair Comparison Framework:
  - Standardized evaluation summary schema storing scenario ID, seed, duration, policy versions, KPI dictionary, and calculation metadata.
- Expose KPI reporting endpoints: `/api/v1/simulation/runs/{id}/kpis`, `/api/v1/evaluation/compare`.

## Dependencies
- Phase 05: Simulation Engine.
- Phase 06: Baseline Policies.

## Business & Engineering Invariants
- Event-Derived Invariant: Every reported KPI metric must be computed directly by querying recorded event streams and applying documented mathematical formulas. Hardcoding numbers or estimating values without event backing is strictly prohibited.
- Explicit Assumptions: All financial formulas (e.g., holding cost per unit per day = $0.05) must be documented as explicit scenario parameters, not embedded as magical constants in code.
- Disclaimers: All KPI reports must clearly include the disclaimer: "Simulated outcomes derived from synthetic scenarios — not verified real-world results."

## Acceptance Criteria
1. Evaluator computes complete KPI reports from a simulated event stream containing 1,000+ events without error.
2. Verified unit test formulas: stockout rate calculation exactly matches manually verified manual count from an event fixture.
3. Comparing two identical runs with identical seeds produces zero variance in computed KPIs.
4. If an event log contains zero orders or incomplete runs, the evaluator returns explicit error states or zero-counts rather than crashing with division-by-zero.

## Required Tests
- Mathematical unit tests for each individual KPI metric formula using deterministic synthetic event fixtures.
- Regression tests asserting zero variance when evaluating identical event logs.
- Edge case tests: zero orders, 100% stockout runs, cancelled orders, zero picker movement.

## Documentation Updates
- Create `docs/evaluation/kpi-formulas.md` detailing every KPI definition, mathematical formula, unit of measurement, and default cost coefficients.

## Completion Report Format
```markdown
### Phase 07 Completion Report
- **KPI Metrics Implemented**: [service, speed, efficiency, and cost metrics]
- **Formula Verification**: [unit test coverage against event fixtures]
- **Evaluation API Endpoints**: [summary of compare and report routes]
- **Next Steps**: [Phase 08 readiness]
```
