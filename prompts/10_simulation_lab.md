# Phase 10 — Simulation Lab
## Interactive Simulation, Fair Policy Evaluation, and Reproducible Experiments

## 1. Objective

Implement a complete, polished **Simulation Lab** inside `apps/dashboard` for DarkOps AI.

The Simulation Lab must allow an operator to:

1. Configure a synthetic quick-commerce scenario.
2. Submit and manage discrete-event simulation jobs.
3. Observe simulation progress, virtual time, event history, and queue state.
4. Compare baseline and optimized policies under equivalent experimental conditions.
5. Inspect event-derived KPIs and optimization outcomes.
6. Export reproducible simulation reports as JSON and Markdown.

This is an end-to-end implementation task. Build working interfaces connected to the existing simulation worker, Operational API, optimization service, and evaluation system wherever the established contracts support those operations.

**Core principle:** The backend is authoritative for simulation state, event history, inventory, order lifecycle, and KPI calculations. The frontend configures experiments, issues commands, visualizes persisted results, and exports reports.

Do not fabricate simulation progress, operational metrics, event history, or optimization improvements.

---

## 2. Mandatory Repository and API Discovery

Before implementing the UI:

1. Inspect the existing `apps/dashboard` architecture, router, shared components, query client, API client, toast system, and testing setup.
2. Inspect Phase 05 simulation job lifecycle, event persistence, run isolation, event schemas, virtual clock, and worker behavior.
3. Inspect Phase 07 KPI endpoints, evaluation records, formula versions, metric statuses, and comparison rules.
4. Inspect Phase 08 optimization request/response schemas and policy configuration.
5. Inspect Phase 09 navigation, design tokens, synthetic-environment banner, and established frontend conventions.
6. Inspect the real Operational API routes and existing OpenAPI specification.
7. Identify the supported simulation operations for creating, starting, pausing, resuming, cancelling, resetting, inspecting, and comparing runs.
8. Verify how scenario parameters, random seeds, policy configurations, event logs, and evaluation results are persisted.
9. Determine whether paired policy experiments can share the same initial world snapshot and exogenous demand realization.
10. Document missing contracts before deciding whether a small backward-compatible backend addition is required.

Do not assume that a requested endpoint or field exists simply because it appears in this prompt.

Reuse existing services and schemas. Do not create a second simulation engine in React or bypass the existing simulation worker.

If a required capability is missing, implement the smallest justified addition within the existing architecture, only when necessary. Do not introduce a new microservice, Redis, a message broker, or unrelated infrastructure.

---

## 3. Application Integration and Navigation

Add the Simulation Lab to the existing dashboard navigation.

Preferred route:

`/simulations`

Preserve all existing Phase 09 routes and functionality.

Use the established React, TypeScript, Tailwind CSS, TanStack Query, API client, and reusable UI components. Follow the existing project conventions instead of replacing working infrastructure.

Organize the feature into cohesive modules, adapting the structure to the repository:

```text
apps/dashboard/src/features/simulations/
├── components/
│   ├── ScenarioConfigurationForm.tsx
│   ├── SimulationRunCard.tsx
│   ├── SimulationExecutionConsole.tsx
│   ├── VirtualClock.tsx
│   ├── QueueDepthPanel.tsx
│   ├── EventTimeline.tsx
│   ├── PolicyComparisonPanel.tsx
│   ├── KPIComparisonChart.tsx
│   ├── RunHistoryPanel.tsx
│   └── ExportReportDialog.tsx
├── hooks/
│   ├── useSimulationRuns.ts
│   ├── useSimulationEvents.ts
│   ├── useSimulationControls.ts
│   └── useSimulationEvaluation.ts
├── lib/
│   ├── experiment-validation.ts
│   ├── report-export.ts
│   └── comparison-validation.ts
├── types/
└── pages/
    └── SimulationLabPage.tsx
```

Keep simulation state, API integration, presentation components, and report generation appropriately separated.

---

## 4. Scenario Configuration Studio

Build a polished configuration workspace for creating simulation experiments.

### A. Scenario parameters

Expose the parameters that are actually supported by the simulation API:

- Scenario template or scenario identifier.
- Simulation duration in hours.
- Demand arrival-rate configuration.
- Demand surge multiplier or supported time-varying demand configuration.
- Supplier lead-time adjustments.
- Random seed.
- Selected operational policies.
- Relevant simulation or optimization configuration options.

Use sensible defaults only when they are supported by existing contracts. Provide the requested demonstration configuration of a 12-hour simulation with seed `101`.

Clearly distinguish editable experiment parameters from parameters fixed by the selected scenario template.

Do not add controls that imply backend functionality that does not exist.

### B. Policy selection

Allow the operator to select:

- Baseline policy.
- Optimized policy.
- Both policies for a paired comparison, where supported.

Display a concise explanation of which policy configuration will be executed.

If policy selection affects multiple subsystems, persist the exact configuration used by each run.

### C. Validation

Validate inputs before submission using the established frontend validation approach.

Validate:

- Required scenario selection.
- Duration bounds supported by the backend.
- Nonnegative or positive arrival rates as required by the contract.
- Valid surge multipliers.
- Supplier lead-time constraints.
- Integer and supported-range random seeds.
- Valid policy configurations.

Display field-level errors and understandable submission errors.

Backend validation remains authoritative. Do not silently clamp invalid values or alter the submitted seed.

### D. Experiment summary

Before submission, show a compact summary of:

- Scenario.
- Duration.
- Random seed.
- Demand configuration.
- Supplier configuration.
- Selected policy or policies.
- Initial-state or snapshot identifier, if supported.

Make the final submitted configuration inspectable after the run is created.

---

## 5. Fair Comparison and Reproducibility

This is the most important business invariant in Phase 10.

### A. Paired experiment requirements

A baseline-versus-optimized comparison is valid only when both runs use compatible experimental conditions.

At minimum, verify:

- Identical initial world snapshot or an equivalent reproducible snapshot identifier.
- Identical scenario parameters.
- Identical simulation duration.
- Identical exogenous demand configuration.
- Identical random seed.
- Identical relevant supplier lead-time assumptions.
- Compatible cost configuration and currency.
- Clearly identified baseline and optimized policy versions.

Policy-specific configurations may differ only where those differences are intentional and documented as the experiment variable.

### B. Randomness and event ordering

A shared numeric seed alone is insufficient to prove fair comparison.

Where the simulation architecture permits, ensure that stochastic inputs such as customer arrivals, basket composition, and external supplier disruptions are generated from reproducible scenario inputs that are not inadvertently changed by policy-specific event consumption.

Use independent or otherwise controlled random streams where necessary and supported by the engine.

Do not change the established simulation engine merely to implement a frontend convenience. If fair paired execution requires backend support, document and implement the minimal justified change.

### C. Comparison validation

Before showing a comparison as fair:

1. Inspect the persisted metadata for both runs.
2. Validate the scenario, duration, seed, snapshot, cost assumptions, and policy identities.
3. Check that both runs completed successfully and produced valid evaluation results.
4. Check metric comparability and data-quality status.
5. Surface any incompatibilities or missing data.

If the comparison is invalid, display an explicit explanation and withhold the overall performance-improvement claim.

Never silently compare incompatible runs.

### D. Metric deltas

Display absolute and relative differences only when the underlying values are comparable and valid.

For metrics where lower is better, such as travel distance or stockout rate, clearly identify a reduction as favorable. For metrics where higher is better, such as fill rate, clearly identify an increase as favorable.

Handle zero baselines without division-by-zero errors. Preserve the backend's metric status and data-quality warnings.

**Never hardcode example improvements such as "-18% picker distance" or "-24% stockouts."** These are examples of presentation only; all displayed deltas must be derived from validated backend evaluation results.

---

## 6. Interactive Simulation Execution Console

Build a dedicated execution panel for each simulation run.

### A. Run lifecycle

Support the backend-defined operations for:

- Create or submit run.
- Start execution if a separate start operation exists.
- Pause.
- Resume.
- Cancel.
- Reset, only if the backend explicitly supports reset semantics.

Use the real job state machine and valid state transitions.

The existing worker may use states such as:

`QUEUED → RUNNING → PAUSED → SUCCEEDED / FAILED / CANCELLED`

Inspect the actual implementation before finalizing the state mapping.

Disable invalid controls for the current persisted state. For example, do not allow resuming a completed run unless the backend supports that operation.

### B. Backend-authoritative controls

Every control must issue the appropriate API command.

After a command:

1. Show a pending state.
2. Prevent accidental duplicate submissions.
3. Wait for the backend response.
4. Refresh the run status and related queries.
5. Show a success or error notification based on the confirmed result.

Do not simulate pause/resume by stopping a frontend timer while the backend continues running.

Do not implement Reset as a frontend-only state clear.

### C. Virtual clock

Display the virtual simulation time returned by the backend, with:

- Current virtual timestamp.
- Configured duration.
- Progress indicator where progress can be calculated reliably from authoritative timestamps.
- Persisted job status.
- Last successful status refresh time.

The clock may interpolate between backend snapshots for visual smoothness while the simulation is actively running, but it must be clearly treated as a display estimate, not authoritative simulation state.

Reconcile the display with persisted virtual time on each successful poll. Freeze or invalidate interpolation when paused, completed, failed, or cancelled.

Never let a browser timer advance the simulation itself.

### D. Speed controls

Expose `1x`, `10x`, `50x`, and `Max` speed options only if the backend supports simulation speed control.

First determine what these settings mean in the existing virtual-time engine.

If the worker executes virtual events as quickly as possible, a UI speed selector cannot meaningfully change execution speed without backend support.

In that case, either implement a properly scoped backend execution-throttling control if justified, or clearly distinguish **event playback speed** from **simulation execution speed**.

Do not present a playback control as if it changes the actual backend execution rate.

### E. Queue and run status

Display available queue depths and job progress from backend responses.

Use clear visual status indicators for queued, running, paused, completed, failed, and cancelled runs.

Do not derive authoritative queue depth or job status from the browser's event list.

---

## 7. Live Event Stream Timeline

Create a readable, responsive timeline of persisted simulation events.

### A. Event data

Use the real Phase 05 event schema and event retrieval endpoints.

Display supported fields such as:

- Virtual timestamp.
- Event type.
- Event sequence number.
- Affected entity or identifier.
- Relevant event details.
- Processing outcome or error information, where available.

Support relevant event categories such as:

- Order arrival.
- Allocation decisions.
- Reservation outcomes.
- Picking progress and completion.
- Supplier delivery and inventory receipt.
- Cancellation and exception events.

Use the actual event types; do not fabricate events for unsupported categories.

### B. Event ordering

Preserve the authoritative event ordering provided by the backend.

If ordering requires a documented composite key, use the server-provided virtual timestamp, priority, and sequence fields as applicable.

Do not reorder events solely according to client receipt time.

### C. Polling and pagination

Use bounded polling or another existing supported transport.

- Avoid continuously refetching completed runs.
- Use backoff for transient failures.
- Prevent overlapping requests.
- Fetch only newly available events when the API supports cursors or sequence-based pagination.
- Otherwise use the established pagination mechanism.
- Handle duplicate event delivery safely.
- Clean up timers and requests when changing runs or leaving the page.

### D. Timeline interactions

Support:

- Filtering by event type.
- Search by supported identifiers.
- Pausing and resuming visual playback, where playback exists.
- Jumping to the latest event.
- Clear loading, empty, and error states.

If the timeline is a persisted event feed, explain that refresh frequency depends on polling rather than claiming a real-time streaming connection.

---

## 8. A/B Policy Evaluation and Comparison

Build a dedicated comparative analysis view.

### A. Required KPI cards

Show backend-derived values where available for:

- Order fill rate.
- Stockout rate.
- Picker travel distance.
- Order turnaround time.
- Total operating cost.

Use the actual Phase 07 KPI names and definitions. Do not reinterpret the metric formulas in the frontend.

Additional available metrics may include allocation latency, picking duration, replenishment cost, and backlog measures.

### B. Comparison layout

Display baseline and optimized results side by side.

For each metric, show:

- Baseline value.
- Optimized value.
- Absolute difference.
- Relative difference when mathematically valid.
- Direction of improvement or regression.
- Backend metric status.
- Units and currency where applicable.

Use consistent units and formatting. Never compare meters with feet, seconds with minutes without conversion, or monetary values across incompatible currencies without an explicit supported conversion.

### C. Charts

Where appropriate, use:

- Side-by-side KPI bars.
- Cost breakdown charts.
- Virtual-time trend charts if event-derived time series are available.
- Queue-depth trends if persisted time-series data are available.

Charts must reflect actual returned data. Do not interpolate missing KPI values into invented trends.

Provide readable labels, tooltips, legends, and accessible textual summaries.

### D. Evaluation integration

Reuse the existing Phase 07 evaluation endpoints and Phase 08 policy metadata.

Persist or retrieve evaluation records through the existing backend contract. Do not recalculate official KPIs in React.

If evaluation is asynchronous, display its actual evaluation status and poll only while needed.

Distinguish between a completed simulation and a completed evaluation.

### E. Disclaimer

Display this exact disclaimer in the comparison view:

"Simulated results from synthetic quick-commerce environment. Not verified real-world outcomes."

The disclaimer must remain visible in exported comparisons as well.

---

## 9. Run History and Inspection

Provide a run history panel using persisted backend run records.

Display supported fields such as:

- Run identifier.
- Scenario.
- Policy.
- Seed.
- Simulation duration.
- Current or final status.
- Creation and completion timestamps.
- Evaluation status.

Allow operators to open a prior run and inspect its configuration, event history, and KPI evaluation.

Provide clear handling for missing, deleted, failed, or inaccessible runs.

Do not assume the currently selected run is the most recently created run or the only active job.

The interface must allow users to inspect a run without unintentionally changing its state.

---

## 10. Reset and Isolated State

Respect the existing run-isolation invariant.

Resetting or cancelling a run must never clear shared catalogs, other simulation runs, or live operational data.

Before implementing Reset, inspect the backend's actual semantics.

If Reset means deleting and recreating a run, clearing run-scoped events, or restoring a snapshot, expose only the operation the backend supports and require confirmation for destructive behavior.

If Reset is unsupported, do not fake it. Explain the limitation and use the supported workflow, such as creating a new run from the same scenario and snapshot.

Any reset implementation must be scoped to the target run and verified against a controlled backend test.

---

## 11. Reproducible Report Generator

Implement report export for JSON and Markdown.

### A. JSON export

Generate a downloadable JSON artifact containing all relevant available fields:

- Report schema version.
- Run identifiers.
- Scenario identifier and full effective scenario configuration.
- Random seed.
- Initial snapshot identifier or equivalent reproducibility metadata.
- Policy identity and algorithm versions.
- Simulation engine version when available.
- Evaluator and formula versions when available.
- Cost configuration and currency.
- Simulation duration.
- Final job state.
- KPI metrics and their statuses.
- Data-quality warnings.
- Comparison metadata and compatibility checks.
- Full event log, or a clearly identified paginated export if the backend does not support a complete event-log retrieval.
- Creation and completion timestamps.
- The required disclaimer.

Use a documented, stable JSON schema.

Do not claim an export contains the full event log unless all relevant events have been retrieved successfully.

If the backend can produce a complete authoritative report artifact, prefer that. Otherwise, retrieve all required pages and assemble the export with explicit completeness metadata.

### B. Markdown export

Generate a readable report containing:

1. Experiment summary.
2. Scenario configuration.
3. Seed and reproducibility metadata.
4. Policy configurations.
5. Run statuses.
6. KPI comparison table.
7. Cost breakdown where available.
8. Data-quality warnings.
9. Event-log summary and completeness.
10. The exact required disclaimer.

Clearly label any omitted or unavailable fields.

### C. Export integrity

- Include only data associated with the selected run or comparison.
- Do not include credentials or authentication headers.
- Handle failed or incomplete downloads.
- Use deterministic field ordering where practical.
- Include an export timestamp.
- Clearly distinguish incomplete event-log exports from complete exports.
- Avoid claiming that an exported report can reproduce a run if its snapshot, configuration, engine version, or other required metadata is missing.

If the run is incomplete, allow export only with explicit status and completeness metadata, or disable the export when the requested artifact cannot be produced honestly.

---

## 12. Typed API Integration

Reuse the existing API client and authentication mechanism.

Create feature-specific hooks for:

- Run creation and submission.
- Run listing and detail retrieval.
- Pause, resume, cancel, and supported reset actions.
- Event retrieval and polling.
- Evaluation retrieval and comparison.
- Report export.

Requirements:

- Strongly typed request and response schemas.
- Stable TanStack Query keys.
- Correct invalidation after mutations.
- Request cancellation where appropriate.
- No duplicate mutation submissions.
- Error mapping consistent with existing API envelopes.
- No secret credentials in browser code.
- No invented endpoint paths or response fields.

Verify every endpoint against the actual API implementation and OpenAPI specification.

If a backend endpoint is missing, document the gap and implement only the smallest justified addition needed for this phase.

---

## 13. Visual Design and Operator Experience

Use the established Phase 09 design system and shared dashboard components.

The Simulation Lab should feel like an integrated part of DarkOps AI rather than a separate application.

Recommended layout:

- **Header:** Simulation Lab title, run status, and selected run.
- **Configuration area:** Scenario form and policy selection.
- **Execution area:** Virtual clock, lifecycle controls, and queue status.
- **Event area:** Scrollable event timeline.
- **Evaluation area:** Baseline/optimized KPI comparison.
- **History area:** Prior runs and report downloads.

Use responsive layouts and appropriate spacing. Do not force every panel into one crowded screen.

Include:

- Skeletons while data is loading.
- Useful empty states.
- Inline errors and retry actions.
- Accessible dialogs and confirmations.
- Toast feedback for confirmed operations.
- Visible focus states.
- Keyboard navigation.
- Reduced-motion support for animated timelines and route visualizations.
- The persistent synthetic-environment banner from Phase 09.

All important data and state changes must remain understandable without relying on color or animation alone.

---

## 14. Testing Requirements

Use the existing Vitest and React Testing Library setup, plus the existing browser E2E framework if available.

### A. Component tests

Cover:

- Scenario configuration validation.
- Default 12-hour configuration and seed `101`.
- Policy selection.
- Execution controls for each lifecycle state.
- Virtual clock display and reconciliation.
- Queue-depth rendering.
- Event timeline ordering and filtering.
- KPI comparison cards and delta directionality.
- Zero-baseline and unavailable metric handling.
- Export controls.
- Loading, empty, and error states.
- Synthetic-environment disclaimer.

### B. API integration tests

Use deterministic network-level mocks based on the actual API contracts.

Verify:

- Simulation submission sends the exact configured parameters.
- Seed `101` is preserved.
- Run status polling updates the UI from backend responses.
- Pause and resume call the correct backend endpoints.
- Completed runs stop unnecessary polling.
- Event pagination does not duplicate or omit events.
- Failed commands do not produce false success.
- Evaluation data is rendered without frontend KPI recomputation.
- Report export includes the expected metadata and event completeness information.

### C. Fairness and reproducibility tests

Test the comparison-validation logic with:

1. Matching snapshots, scenario parameters, seed, duration, and cost configuration.
2. Different seeds.
3. Different initial snapshots.
4. Different scenario parameters.
5. Incompatible durations or cost configurations.
6. Failed or incomplete runs.
7. Missing KPI values.
8. Invalid event streams.
9. Zero baseline metrics.
10. Identical effective run inputs and identical deterministic outputs.

Verify that incompatible runs are not presented as a valid fair comparison.

**Important:** Identical seeds must not automatically make two distinct policy runs produce identical KPI values. Instead, verify that identical effective inputs for the same policy and deterministic engine produce reproducible results, and that baseline-versus-optimized comparisons use the same controlled exogenous scenario inputs.

Where backend determinism can be verified, compare persisted report data or stable event-log digests. Do not simulate determinism by returning hardcoded fixtures as if they were real engine results.

### D. E2E tests

Verify a controlled browser workflow:

1. Open `/simulations`.
2. Configure a 12-hour scenario with seed `101`.
3. Submit the run.
4. Observe the persisted job status and virtual clock.
5. Pause and resume a running job.
6. Inspect its event timeline.
7. Compare valid baseline and optimized evaluation results.
8. Export JSON and verify its schema, metadata, and event-log completeness.
9. Verify the required disclaimer is present.
10. Confirm that one run's reset/cancellation does not affect another run.

Use a controlled test environment. Do not depend on unpredictable production-like external services or real supplier integrations.

---

## 15. Performance and Reliability

- Avoid polling completed or terminal jobs.
- Prevent overlapping polling requests.
- Use backoff for transient errors.
- Retrieve only the required event pages.
- Avoid rendering the entire event history in an unbounded DOM when virtualization is appropriate.
- Keep virtual clock updates efficient.
- Clean up timers, subscriptions, and requests when the active run changes.
- Preserve the ability to inspect existing runs after page refresh.
- Handle multiple active background runs without mixing their state.
- Prevent duplicate event entries and stale comparison data.
- Keep large report exports from blocking the UI unnecessarily.

Do not introduce WebSockets or another transport unless existing requirements and infrastructure justify it.

---

## 16. Documentation

Create `docs/ui/simulation-lab-guide.md`.

Include:

1. Purpose of the Simulation Lab.
2. How to configure a scenario.
3. Supported scenario parameters and policy options.
4. How to submit, pause, resume, cancel, and reset runs where supported.
5. Explanation of virtual time and execution speed.
6. How event polling and timeline ordering work.
7. How to compare baseline and optimized policies.
8. Fair-comparison rules and reproducibility limitations.
9. KPI definitions and metric-status handling.
10. How to export JSON and Markdown reports.
11. Report schema and event-log completeness.
12. Local setup and required environment configuration.
13. Test commands.
14. Known limitations and missing backend capabilities.

Do not document unsupported behavior as if it were implemented.

---

## 17. Implementation Sequence

### Step 1 — Contract discovery

Inspect simulation, evaluation, and optimization contracts. Identify missing capabilities and confirm fair-comparison feasibility.

### Step 2 — Scenario configuration

Implement the validated scenario form, effective configuration summary, and submission flow.

### Step 3 — Run lifecycle

Implement persisted run status, virtual clock, queue state, supported controls, and isolated run selection.

### Step 4 — Event timeline

Implement ordered event retrieval, filtering, pagination, and efficient polling.

### Step 5 — Evaluation and comparison

Integrate Phase 07 evaluations and Phase 08 policy metadata. Implement compatibility validation and trustworthy KPI comparisons.

### Step 6 — Report export

Implement complete or explicitly partial JSON export and Markdown report generation.

### Step 7 — Verification

Run component tests, API integration tests, fairness/reproducibility tests, browser E2E tests, TypeScript checks, and production build.

### Step 8 — Documentation

Write the Simulation Lab guide and the completion report.

Do not stop after building a visually attractive simulation form. The phase is complete only when the supported workflows work against the real backend contracts and limitations are clearly disclosed.

---

## 18. Definition of Done

- [ ] The Simulation Lab is accessible through the existing dashboard navigation.
- [ ] A 12-hour scenario with seed `101` can be configured and submitted.
- [ ] Run state and virtual time reflect backend responses.
- [ ] Supported pause/resume/cancel/reset operations call the correct backend endpoints.
- [ ] Queue depths and event history come from the appropriate backend data.
- [ ] Event ordering is preserved.
- [ ] Baseline and optimized runs are validated for fair comparison.
- [ ] KPI values and metric statuses originate from Phase 07 evaluation results.
- [ ] Missing or incompatible data is never presented as verified improvement.
- [ ] JSON export contains scenario configuration, seed, policy metadata, KPI data, and event log or explicit completeness information.
- [ ] Markdown export includes the scenario, comparison, metadata, warnings, and disclaimer.
- [ ] The exact required disclaimer appears in the UI and exported reports.
- [ ] Reset or cancellation affects only the intended run.
- [ ] Multiple active runs do not contaminate each other's state.
- [ ] Component, integration, fairness, and supported E2E tests pass.
- [ ] TypeScript checks and production build pass.
- [ ] `docs/ui/simulation-lab-guide.md` is complete.
- [ ] Missing backend contracts and known limitations are documented.
- [ ] Existing Phase 09 views and earlier phase contracts remain compatible.

---

## 19. Completion Report

Return this report after executing the relevant checks.

### Phase 10 Completion Report

- **Simulation Lab UI Features:** Configuration studio, execution console, event timeline, comparison view, run history.
- **Backend Integration:** Verified run creation, lifecycle controls, event retrieval, evaluation, and export endpoints.
- **Fair Comparison Verification:** Snapshot, scenario, seed, duration, cost, and policy compatibility checks.
- **Reproducibility:** Evidence from deterministic run/report tests and any limitations.
- **Execution Controls:** Actual pause/resume/cancel/reset support and verification.
- **Event Timeline:** Ordering, polling, pagination, and event-log completeness.
- **KPI Comparison:** Available metrics, delta calculations, unavailable statuses, and validation.
- **Export & Report Formats:** JSON/Markdown verification, report schema, metadata, and event-log completeness.
- **Tests:** Actual component, integration, fairness, and E2E test results.
- **Type Checking and Build:** Actual command results.
- **Documentation:** Files created or updated.
- **Known Limitations:** Unsupported operations or missing backend capabilities.
- **Phase 11 Readiness:** Evidence that the Simulation Lab integrates with the existing platform.

Do not claim successful real-backend integration based solely on mocked frontend tests. Do not claim full event-log export without verifying completeness. Do not claim fair comparison solely because both runs share a seed.

**Final instruction:** Deliver a trustworthy, reproducible simulation workspace that makes the existing DarkOps AI simulation and optimization engine observable and useful. Preserve backend authority, fair experimental conditions, isolated run state, and honest reporting over superficial visual polish.