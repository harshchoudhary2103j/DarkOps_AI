# Phase 10 — Simulation Lab

## Objective
Implement the interactive Simulation Lab UI in `apps/dashboard` allowing operators to configure, execute, inspect, and compare discrete-event simulations, view live event timelines, and generate reproducible policy comparison reports.

## Scope
- Implement Simulation Lab Views:
  - **Scenario Configuration Studio**: Form to select scenario templates, duration (hours), arrival rates, demand surge multipliers, supplier lead time delays, random seeds, and policy toggles (Baseline vs. Optimized).
  - **Interactive Execution Console**: Start, Pause, Resume, Reset controls, simulation speed selector (1x, 10x, 50x, max speed), live virtual clock display, and current queue depths.
  - **Live Event Stream Timeline**: Real-time virtual event feed displaying order arrivals, allocation decisions, pick completions, and stock receipts.
  - **A/B Policy Evaluation & Comparison**: Side-by-side comparative cards and charts displaying event-derived KPIs (Fill Rate, Stockout Rate, Travel Distance, Turnaround Time, Total Operating Cost) between baseline and optimized policies.
  - **Reproducible Report Generator**: Export simulation run results with embedded scenario metadata, random seed, algorithm versions, and full event logs as JSON or Markdown.

## Dependencies
- Phase 05: Simulation Engine.
- Phase 07: Event-Derived KPIs.
- Phase 08: Optimization Policies.
- Phase 09: Operations Dashboard.

## Business & Engineering Invariants
- Fair Comparison Invariant: When comparing baseline and optimized policies in the UI, both runs must use the identical initial world snapshot, scenario parameters, and random seed.
- Isolated State Invariant: Resetting a simulation in the UI must restore only the target run's scoped state without clearing demonstration catalogs or affecting background runs.
- Disclaimer Invariant: All charts, reports, and exported comparisons must feature the disclaimer: "Simulated results from synthetic quick-commerce environment. Not verified real-world outcomes."

## Acceptance Criteria
1. Operator can configure a 12-hour simulation scenario with seed `101`, submit the job, and observe real-time progress.
2. Side-by-side comparison view displays baseline vs. optimized runs with clear delta indicators (e.g., "-18% picker distance, -24% stockouts").
3. Exporting a run report downloads a complete JSON artifact containing scenario configuration, random seed, KPI metrics, and event log.
4. Pausing and resuming the simulation correctly updates job execution state on the backend.

## Required Tests
- Frontend component tests for scenario configuration forms, live virtual clock timers, and comparison charts.
- Integration tests validating simulation job submission and result polling hooks.
- Verification test ensuring identical seeds generate identical comparison report cards.

## Documentation Updates
- Create `docs/ui/simulation-lab-guide.md` walking operators through scenario creation, execution, and policy evaluation.

## Completion Report Format
```markdown
### Phase 10 Completion Report
- **Simulation Lab UI Features**: [configuration studio, controls, event timeline, comparison cards]
- **Fair Comparison Verification**: [reproducible run inspection]
- **Export & Report Formats**: [JSON/Markdown report export verified]
- **Next Steps**: [Phase 11 readiness]
```
