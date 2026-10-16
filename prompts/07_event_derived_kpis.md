# Phase 07 — Event-Derived KPIs and Experiment Evaluation

## Objective

Implement the Experiment Evaluator and KPI Reporting Engine for DarkOps AI.

Compute operational, service-level, workload, and economic metrics exclusively from persisted, run-scoped simulation events. Produce reproducible evaluation summaries that allow baseline policies from Phase 06 to be compared fairly and prepare the system for advanced optimization in Phase 08.

The evaluator must be deterministic, mathematically documented, auditable, and explicit about missing or insufficient event data.

## 1. Repository Inspection and Architecture Constraints

Before implementation, inspect the existing repository and identify:

- Phase 05 simulation event schemas, event types, timestamps, and payload fields.
- `simulation_runs` and `simulation_events` database schemas and their run-scoped query interfaces.
- Phase 06 baseline policies, policy identifiers, configurations, and end-to-end scenario.
- Existing simulation job lifecycle and completed/failed/cancelled run semantics.
- Operational API conventions, authentication, authorization, correlation IDs, response envelopes, database helpers, and OpenAPI documentation.
- Existing migration conventions and test infrastructure.

Reuse the actual event schemas and domain terminology found in the repository. Do not assume that every metric's required fields are already available.

Requirements:

- Do not modify production inventory or order state while evaluating simulation runs.
- Do not create a parallel simulation event store.
- Do not reconstruct KPIs from current mutable inventory snapshots when historical events are required.
- Do not generate synthetic event data inside the evaluator to fill missing information.
- Do not hardcode reported KPI values.
- Keep KPI calculations separate from HTTP handlers and database access.
- Use parameterized SQL and existing authorization conventions.
- Preserve run isolation and immutable `run_id` semantics.
- Do not introduce a new microservice, Redis, or message broker.
- Add an additive, versioned migration only if evaluation-summary persistence requires one.
- Do not begin Phase 08 optimization work.

## 2. Event-Derived Evaluation Architecture

Implement a clear pipeline:

1. Validate the requested run and its lifecycle state.
2. Load the run metadata, policy configuration, and ordered event stream.
3. Validate event ordering, required fields, and run identity.
4. Reconstruct order, inventory, picker, purchase-order, and queue state from events.
5. Compute individual KPIs using documented formulas.
6. Apply data-quality checks and assign a status to each metric.
7. Generate a versioned evaluation summary.
8. Persist the summary if required by the existing architecture.
9. Return the report or compare it with another compatible evaluation.

Use the existing event ordering semantics. Where multiple events have the same virtual timestamp, preserve the canonical event priority and sequence-number ordering.

Every evaluation must record:

- `run_id`
- `scenario_id`
- Random seed
- Simulated start and end time
- Simulated duration
- Run status
- Policy identifiers and versions
- Policy configuration or a reproducible configuration reference
- Evaluator version
- KPI formula/schema version
- Evaluation timestamp or other clearly identified metadata
- Data-quality warnings
- KPI values, units, and metric statuses

The same immutable event stream evaluated with the same evaluator/formula version must produce identical KPI values.

## 3. KPI Definitions and Mathematical Rules

Document every formula, unit, denominator, inclusion rule, and limitation in `docs/evaluation/kpi-formulas.md`.

Use the definitions below unless an existing domain contract requires a different definition. If a definition must change, document the reason and version the formula.

### 3.1 Fulfillment and Service KPIs

#### A. Order Fill Rate

Definition: proportion of eligible orders whose entire requested basket was fulfilled.

`Order Fill Rate = Fully Fulfilled Orders / Eligible Orders × 100`

Use a documented cohort of orders that have reached an outcome sufficient to determine fulfillment.

- Fully fulfilled means every requested unit was successfully picked.
- Exclude orders that have not reached a terminal fulfillment outcome.
- Report cancelled, failed, and unfulfillable orders separately.
- If business reporting includes cancellations in the denominator, expose that as a separately named metric rather than silently changing this definition.

#### B. Unit Fill Rate / Line Fill Rate

Calculate both where the event model supports them.

`Unit Fill Rate = Successfully Picked Units / Requested Units × 100`

`Line Fill Rate = Fully Fulfilled Order Lines / Eligible Order Lines × 100`

A line is fully fulfilled only if its requested quantity was picked successfully.

Do not confuse unit fill rate with line fill rate. Give them distinct names in the API and documentation.

#### C. Stockout Rate

Use the requested-unit definition:

`Stockout Rate = Unfulfilled Requested Units Attributable to Stock Unavailability / Total Eligible Requested Units × 100`

Count only units with evidence of stock unavailability, including explicit missing/stockout outcomes or equivalent documented event semantics.

Do not classify customer cancellations, invalid orders, or unrelated picking failures as stockouts.

Report separately:

- Total requested units
- Fulfilled units
- Unfulfilled units due to stockouts
- Stockout rate
- Number of distinct stockout incidents

Define a stockout incident explicitly, such as one order-line/SKU fulfillment attempt that cannot be satisfied because of unavailable stock. Use event identity and deduplication rules to avoid counting the same incident repeatedly.

If the current event schema cannot distinguish stockouts from other missing-item outcomes, report the metric as unavailable or insufficient-data rather than inventing the cause.

### 3.2 Operational Efficiency KPIs

#### A. Picking Duration

For each completed picking task:

`Picking Duration = Picking Completion Time - Picking Start Time`

Report mean, median, and sample count where data permits.

- Use virtual timestamps.
- Do not include unrelated allocation or delivery waiting time.
- Treat missing start/completion pairs as incomplete observations.
- Define how failed and cancelled tasks are reported separately.

#### B. Picker Travel Distance

Calculate:

`Total Picker Travel Distance = Sum of Valid Recorded Movement Edge Distances`

Use actual recorded movement events or a persisted, validated route whose graph-edge distances can be reproduced from the exact run layout version.

Requirements:

- Units must be meters.
- Never infer travel distance from elapsed time alone.
- Do not use straight-line shelf distances when the picker must follow aisle edges.
- Avoid double-counting repeated or retried movement events.
- Identify runs where route or movement evidence is incomplete.

If the existing event stream stores only route plans but not executed movements, distinguish planned route distance from actual recorded travel distance.

#### C. Order Turnaround Time

For fulfilled orders:

`Order Turnaround Time = Order Ready Time - Order Creation Time`

Report mean, median, and sample count.

Keep cancelled and failed orders in separate outcome metrics. Do not silently include them in fulfilled-order turnaround statistics.

If the existing lifecycle has no distinct READY event, use the actual documented fulfillment milestone and name the metric accordingly.

#### D. Picker Active and Idle Time

Derive picker utilization from explicit picker state transitions or sufficiently detailed movement/task events.

`Active Time = Sum of Non-Overlapping Intervals Assigned to Active Work`

`Idle Time = Observed Available Time - Active Time`

`Utilization = Active Time / Observed Available Time × 100`

Requirements:

- Define the observation window and picker availability semantics.
- Avoid double-counting overlapping tasks or intervals.
- Handle simultaneous picker events deterministically.
- Do not infer idle time simply from the absence of events.
- If the event stream does not establish picker availability and state transitions, mark idle time and utilization as unavailable.

#### E. Allocation Latency

`Allocation Latency = Allocation Outcome Time - Order Arrival Time`

Report latency separately for successful, unfulfillable, and failed allocation attempts when sufficient timestamps exist.

Do not count unrelated downstream picking time.

### 3.3 Economic and Inventory KPIs

All monetary values must use explicit scenario parameters, documented currency, and reproducible calculations.

Never embed business cost coefficients as unexplained constants.

#### A. Inventory Holding Cost

Calculate holding cost using inventory unit-hours reconstructed from inventory movement events:

`Holding Cost = Sum over SKUs of (Inventory Unit-Hours × Carrying Cost per Unit-Hour)`

The scenario must provide the carrying-cost coefficient and its unit.

Requirements:

- Reconstruct inventory quantities from a valid initial state and recorded stock movements.
- Account for event timing correctly.
- Define whether reserved units incur holding cost.
- Prevent negative inventory during reconstruction unless the event model explicitly records and explains an inconsistency.
- Validate that movement quantities reconcile.
- Do not use only the final inventory snapshot to estimate the entire day's holding cost.

If opening inventory or necessary movement information is missing, mark the metric as incomplete.

#### B. Estimated Lost Sales / Stockout Penalty

`Estimated Stockout Penalty = Unfulfilled Stockout Units × Configured Penalty per Unit`

Where appropriate, calculate estimated lost sales separately using a configured selling price and a clearly documented demand-loss assumption.

Do not label an estimated penalty as actual lost revenue or realized profit. Clearly distinguish revenue, margin, and penalty assumptions.

#### C. Purchase Order Transaction Cost

`Purchase Order Transaction Cost = Count of Unique Eligible Purchase Orders × Configured Cost per Purchase Order`

Use purchase-order creation events and stable purchase-order identifiers. Do not count delivery events as additional purchase orders.

Document whether failed, cancelled, and duplicate attempts incur costs.

#### D. Perishability and Expiry Waste

Calculate expiry waste only if the event stream or immutable scenario data contains enough evidence to identify expiry, spoilage, or disposal quantities and their valuation.

For example:

`Expiry Waste Cost = Expired Quantity × Configured Unit Waste Cost`

Define whether the unit cost represents acquisition cost, disposal cost, or another measure.

Do not infer expiry solely from a SKU's shelf-life setting unless the simulation explicitly models expiry events and tracks inventory batches or lots sufficiently to identify the expired quantity.

If expiry events or lot-level information are absent, report the metric as unavailable or not applicable and explain why.

#### E. Cost Assumptions

Create an explicit, versioned cost configuration for parameters such as:

- Carrying cost per unit-hour
- Stockout penalty per unit
- Selling price or contribution margin, if applicable
- Purchase order transaction cost
- Unit waste valuation
- Currency

Store the configuration or a reproducible reference with each evaluation.

Do not compare monetary values across incompatible currencies or coefficient configurations without an explicit conversion or normalization rule.

### 3.4 Workload and Queue KPIs

#### A. Peak Store Queue Depth

Replay the relevant order-queue events in canonical event order.

`Peak Queue Depth = Maximum Observed Number of Orders Waiting in the Defined Queue`

Define which queue is being measured, when an order enters it, and which event removes it.

Use an event-backed queue state. Do not equate all nonterminal orders with queue depth.

#### B. Backlog Duration

Report:

`Backlog Duration = Sum of Time Intervals During Which Orders Remain in the Defined Backlog State`

Define whether the aggregate unit is order-hours or elapsed backlog hours.

For total order-hours, calculate the area under the backlog-count-versus-time curve.

Use only documented queue-entry and queue-exit transitions. Handle unfinished intervals at the simulation end using a clearly documented censoring rule.

#### C. Queue and Workload Statistics

Where supported by the event schema, report:

- Maximum backlog size
- Mean backlog size over simulated time
- Total backlog order-hours
- Allocation latency
- Picker active and idle time

If queue transitions are absent, do not reconstruct a queue from unrelated events.

## 4. Metric Data-Quality Contract

Every KPI must carry a machine-readable status, such as:

- `AVAILABLE`
- `ZERO`
- `NOT_APPLICABLE`
- `INSUFFICIENT_DATA`
- `INVALID_EVENT_STREAM`

Adapt these names to existing API conventions where necessary.

Each KPI result must contain, where applicable:

- Metric name
- Value
- Unit
- Formula/version
- Numerator
- Denominator
- Observation count
- Data-quality status
- Warnings or limitations

Rules:

- A valid zero must be distinguishable from a missing value.
- A zero denominator must never cause a division-by-zero exception.
- A missing event must never silently become a zero-duration interval.
- Inconsistent inventory movements must produce an explicit validation failure or warning.
- Duplicate events must be handled according to documented event identity and idempotency semantics.
- Incomplete runs must be identified and must not be presented as complete operating days.
- Do not produce a final complete-run summary for a failed or cancelled run unless the API explicitly labels it as a partial evaluation.
- Never fabricate missing values or silently exclude invalid data without reporting the exclusion.

The report must include this exact disclaimer:

"Simulated outcomes derived from synthetic scenarios — not verified real-world results."

## 5. Fair Comparison Framework

Implement a standardized evaluation summary and comparison service.

Each summary must contain:

- Scenario ID and scenario version
- Seed and demand-generation configuration
- Simulated duration
- Run status
- Policy identifiers and versions
- Policy configuration
- Evaluator and formula versions
- KPI dictionary
- Metric data-quality statuses
- Cost assumptions and currency
- Event count and validation metadata
- Simulation configuration reference

### Comparison Rules

Before comparing two runs, validate compatibility.

Check:

- Both runs have valid evaluation summaries.
- Scenario definitions and demand-generation assumptions are compatible.
- Simulated durations are compatible.
- KPI formula versions and units match.
- Cost assumptions and currency match for economic metrics.
- Policy versions and configurations are recorded.
- Both event streams are complete enough for the requested comparison.

For a fair baseline comparison, use the same scenario, initial state, demand inputs, and random seed where applicable. Preserve independent random streams if the simulation supports them.

A comparison must identify which variables differ between runs.

Report:

- Baseline KPI value
- Candidate KPI value
- Absolute difference
- Percentage difference when the baseline value is nonzero
- Direction of improvement, based on the documented KPI objective
- Compatibility warnings
- Metrics that cannot be compared

Do not assume every KPI is better when larger. For example, lower stockout rates and lower fulfillment times are generally desirable, while higher fill rates are desirable.

If a baseline value is zero, do not divide by zero to calculate percentage change. Return an explicit unavailable percentage-change value with an explanation.

Do not label an observed difference as statistically significant unless a suitable statistical analysis has actually been performed.

Identical event streams evaluated using the same evaluator version and configuration must produce identical KPI values and zero KPI differences.

## 6. Evaluation API Endpoints

Expose the following endpoints through the existing Operational API.

### A. Get Run KPIs

`GET /api/v1/simulation/runs/{id}/kpis`

Requirements:

- Validate run ID and access permissions.
- Retrieve or compute the evaluation summary using the recorded event stream.
- Reuse a cached or persisted summary only when its event, configuration, and evaluator-version references are still valid.
- Return run metadata, KPI values, units, statuses, data-quality warnings, and the required disclaimer.
- Distinguish a run that does not exist, a run that is still running, an incomplete run, and an evaluation failure.
- Do not return a successful complete report for an unfinished run.

### B. Compare Evaluations

`POST /api/v1/evaluation/compare`

Accept two run IDs or evaluation-summary references using the repository's established API conventions.

Requirements:

- Validate that both evaluations exist and are authorized.
- Check comparison compatibility.
- Return baseline and candidate values, absolute differences, percentage changes where defined, and improvement direction.
- Include compatibility and data-quality warnings.
- Reject or explicitly mark incompatible comparisons instead of silently comparing unlike scenarios.
- Use standard success/error response envelopes and correlation IDs.
- Validate requests with the existing schema-validation conventions.

Update `docs/api/catalog-openapi.json` or the repository's canonical OpenAPI document as appropriate. Do not create a second API specification unnecessarily.

## 7. Evaluation Persistence and Database

Use the existing database architecture.

If evaluation summaries need persistence, create an additive, versioned migration and a dedicated summary table or equivalent existing model.

Persist enough information to reproduce and audit an evaluation without duplicating the complete event stream.

Requirements:

- Link summaries to immutable `run_id` values.
- Store evaluator and formula versions.
- Store policy and cost-configuration references.
- Preserve run isolation.
- Use transactions and parameterized SQL.
- Prevent duplicate summaries for the same run and evaluation configuration where appropriate.
- Ensure re-evaluation under a new evaluator version does not silently overwrite the historical result.
- Do not mutate recorded simulation events to make KPI calculations pass.

## 8. Required Tests

### Mathematical Unit Tests

Create deterministic event fixtures with manually calculated expected results for every KPI.

Cover:

- Order fill rate and line fill rate.
- Unit fill rate and stockout rate.
- Stockout incident counting and deduplication.
- Mean and median picking duration.
- Order turnaround time.
- Picker travel distance from valid graph-edge movements.
- Picker active and idle time, when supported.
- Allocation latency.
- Holding cost from time-weighted inventory.
- Estimated stockout penalty.
- Purchase order transaction cost.
- Expiry waste, when supported.
- Peak queue depth and backlog order-hours.

Each test must assert exact expected values, correct units, denominator semantics, and the correct metric status.

### Integration Tests

- Evaluate a completed simulation run containing at least 1,000 persisted operational events.
- Verify that KPIs derive from the recorded event stream.
- Verify that the evaluator does not mutate operational inventory or order tables.
- Verify that the API returns the correct summary and comparison response.
- Verify persistence and retrieval of evaluation summaries, if implemented.
- Verify that the required disclaimer is present in reports.

### Determinism and Comparison Tests

- Evaluate the same event stream twice using the same evaluator version.
- Assert identical KPI values and evaluation outputs apart from explicitly variable metadata such as evaluation timestamp.
- Compare two identical runs and assert zero KPI differences.
- Verify that changed policy versions or configurations are visible in comparison metadata.

### Edge Cases

- Zero orders.
- Zero eligible requested units.
- One hundred percent stockout.
- Cancelled orders.
- Failed and incomplete runs.
- No picker movement.
- Missing picker start or completion events.
- Missing inventory opening state.
- Duplicate events.
- Out-of-order or invalid events.
- Empty event stream.
- Unfinished backlog at the end of a run.
- Zero baseline KPI during percentage comparison.
- Missing expiry or queue-transition evidence.
- Incompatible scenarios or cost configurations.

Tests must assert explicit statuses rather than assuming all metrics are available.

## 9. Documentation

Create `docs/evaluation/kpi-formulas.md`.

For every metric, document:

- Definition and business interpretation.
- Mathematical formula.
- Numerator and denominator.
- Unit of measurement.
- Required source events and fields.
- Event inclusion and exclusion rules.
- Treatment of cancellations and incomplete runs.
- Default cost coefficients and units.
- Scenario parameters and configuration version.
- Data-quality statuses and failure conditions.
- Limitations caused by missing event information.

Also document how to execute an evaluation, retrieve KPIs, compare runs, and reproduce a report.

## 10. Completion Report

Provide the following report:

### Phase 07 Completion Report

- **KPI Metrics Implemented:** Metric names, units, and data-availability status.
- **Formula Verification:** Manually calculated fixtures and exact test outcomes.
- **Event Data Sufficiency:** Metrics unavailable due to missing event fields or transitions.
- **Evaluation Persistence:** Schema and reproducibility metadata.
- **Evaluation API Endpoints:** Request/response behavior and OpenAPI updates.
- **Fair Comparison:** Compatibility rules and comparison results.
- **Test Results:** Actual commands and pass/fail/skip counts.
- **Files Changed:** Created and modified files.
- **Known Limitations:** Unavailable metrics, assumptions, and unresolved risks.
- **Phase 08 Readiness:** Whether the evaluator can fairly compare baseline policies against future optimization algorithms.

Do not claim a KPI is implemented if its required event data is missing. Do not claim tests passed unless they were executed. Complete Phase 07 only; do not begin Phase 08.