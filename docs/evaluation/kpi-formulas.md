# Event-Derived KPI Formulas and Fair Comparison Specification

This document defines the mathematical models, formulas, event provenance, data-quality invariants, and comparison framework for all operational, service-level, workload, and economic metrics computed by the DarkOps AI Experiment Evaluator.

> **Disclaimer**: All metrics and summaries produced by the evaluator represent **simulated outcomes derived from synthetic scenarios — not verified real-world results**.

---

## 1. Architectural Principles and Invariants

1. **Event-Derived Exclusivity**:
   Every reported KPI must be computed directly by parsing and aggregating recorded simulation events (`simulation_events`). Computing authoritative metrics from mutable operational snapshots or inventing synthetic events inside the evaluator is strictly prohibited.
2. **Canonical Event Ordering**:
   Replay of event streams strictly enforces deterministic ordering by:
   $$\text{sort\_key} = (\text{virtual\_timestamp}, \text{priority}, \text{sequence\_number})$$
3. **Division-by-Zero Safety**:
   Zero denominators (e.g. runs with zero orders or zero requested units) must never trigger runtime exceptions. The metric status must explicitly report `ZERO` or `NOT_APPLICABLE` with numerator and denominator set to zero.
4. **Data-Quality Classification**:
   Every metric container carries an explicit status:
   - `AVAILABLE`: Metric successfully computed from complete event evidence.
   - `ZERO`: Valid numeric zero outcome (e.g. 0 stockouts observed).
   - `NOT_APPLICABLE`: Metric not relevant or not modeled (e.g. expiry without lot tracking).
   - `INSUFFICIENT_DATA`: Required event fields or transitions missing from event stream.
   - `INVALID_EVENT_STREAM`: Empty or corrupted event stream.

---

## 2. Metric Specifications

### 2.1 Fulfillment & Service Level KPIs

#### A. Order Fill Rate (`order_fill_rate`)
- **Business Interpretation**: Proportion of customer orders whose entire requested basket was completely fulfilled.
- **Formula**:
  $$\text{Order Fill Rate} = \frac{\text{Fully Fulfilled Orders}}{\text{Eligible Terminal Orders}} \times 100$$
- **Numerator**: Count of orders reaching `READY` (all requested line quantities successfully picked).
- **Denominator**: Count of all orders reaching terminal fulfillment states (`READY`, `FAILED`, `CANCELLED`).
- **Unit**: `%`
- **Objective**: `HIGHER_IS_BETTER`
- **Source Events**: `CustomerOrderArrived`, `PickingCompleted`, `OrderCancelled`.
- **Exclusion Rules**: Orders still in progress (`ARRIVED`, `ALLOCATED`, `PICKING`) at run termination are excluded from the denominator in partial runs.

#### B. Unit Fill Rate (`unit_fill_rate`)
- **Business Interpretation**: Proportion of total requested product units that were successfully picked.
- **Formula**:
  $$\text{Unit Fill Rate} = \frac{\sum \text{Picked Units}}{\sum \text{Eligible Requested Units}} \times 100$$
- **Numerator**: Sum of quantities from all `ItemPicked` events across eligible orders.
- **Denominator**: Sum of line quantities requested in `CustomerOrderArrived` payloads.
- **Unit**: `%`
- **Objective**: `HIGHER_IS_BETTER`
- **Source Events**: `CustomerOrderArrived` (lines), `ItemPicked` (picked_quantity).

#### C. Line Fill Rate (`line_fill_rate`)
- **Business Interpretation**: Proportion of individual order line items where requested quantity was fully satisfied.
- **Formula**:
  $$\text{Line Fill Rate} = \frac{\text{Fully Fulfilled Lines}}{\text{Total Requested Lines}} \times 100$$
- **Numerator**: Count of order lines where picked quantity equals requested quantity.
- **Denominator**: Total lines across all eligible customer orders.
- **Unit**: `%`
- **Objective**: `HIGHER_IS_BETTER`

#### D. Stockout Rate (`stockout_rate`)
- **Business Interpretation**: Proportion of requested customer units that could not be fulfilled due to dark store stock unavailability.
- **Formula**:
  $$\text{Stockout Rate} = \frac{\text{Unfulfilled Requested Units Attributable to Stockout}}{\text{Total Eligible Requested Units}} \times 100$$
- **Numerator**: Unfulfilled units on orders that failed allocation due to insufficient stock (`RESERVATION_FAILED` or `UNFULFILLABLE`) plus units reported via `ItemMissing`.
- **Denominator**: Total requested units across all eligible orders.
- **Unit**: `%`
- **Objective**: `LOWER_IS_BETTER`
- **Exclusions**: Customer cancellations (where stock was available) are strictly excluded from stockout counts.

#### E. Stockout Incidents Count (`stockout_incidents_count`)
- **Business Interpretation**: Count of distinct order fulfillment attempts rejected due to stockouts.
- **Unit**: `incidents`
- **Objective**: `LOWER_IS_BETTER`

---

### 2.2 Operational Efficiency KPIs

#### A. Picking Duration (`picking_duration_seconds`)
- **Business Interpretation**: Time spent by warehouse pickers executing an assigned picking tour.
- **Formula**:
  $$t_{\text{pick}} = t_{\text{PickingCompleted}} - t_{\text{PickingStarted}}$$
- **Outputs**: Mean, Median, and Sample Count.
- **Unit**: `seconds`
- **Objective**: `LOWER_IS_BETTER`
- **Source Events**: `PickingStarted`, `PickingCompleted`.
- **Exclusions**: Does not include dispatch wait time or allocation latency.

#### B. Total Picker Travel Distance (`total_picker_travel_distance_meters`)
- **Business Interpretation**: Total physical distance traversed by warehouse pickers along valid aisle layout graph edges.
- **Formula**:
  $$\text{Distance} = \sum_{\text{tasks}} \text{route.total\_distance\_meters}$$
- **Unit**: `meters`
- **Objective**: `LOWER_IS_BETTER`
- **Source Events**: `PickingStarted` route payload validated against physical layout graph.

#### C. Order Turnaround Time (`order_turnaround_time_seconds`)
- **Business Interpretation**: End-to-end elapsed duration from customer order arrival to fulfillment completion (`READY`).
- **Formula**:
  $$t_{\text{turnaround}} = t_{\text{ready}} - t_{\text{arrival}}$$
- **Outputs**: Mean, Median, and Sample Count.
- **Unit**: `seconds`
- **Objective**: `LOWER_IS_BETTER`
- **Source Events**: `CustomerOrderArrived`, `PickingCompleted`.

#### D. Allocation Latency (`allocation_latency_seconds`)
- **Business Interpretation**: Time elapsed between order arrival and store allocation decision.
- **Formula**:
  $$t_{\text{latency}} = t_{\text{StockReserved}} - t_{\text{CustomerOrderArrived}}$$
- **Outputs**: Mean, Median, and Sample Count.
- **Unit**: `seconds`
- **Objective**: `LOWER_IS_BETTER`

#### E. Picker Active Time, Idle Time & Fleet Utilization
- **Active Time (`picker_active_time_seconds`)**:
  Sum of non-overlapping time intervals $[\tau_{\text{start}}, \tau_{\text{complete}}]$ assigned to active picking.
- **Idle Time (`picker_idle_time_seconds`)**:
  $$\text{Idle Time} = \max\left(0, P \times T_{\text{sim}} - \text{Active Time}\right)$$
  Where $P$ is the recorded picker fleet roster size.
- **Utilization (`picker_utilization_percent`)**:
  $$\text{Utilization} = \frac{\text{Active Time}}{P \times T_{\text{sim}}} \times 100$$
- **Incomplete Evidence Invariant**: If the simulation scenario does not record a fixed picker fleet roster ($P$), Idle Time and Utilization are reported with status `INSUFFICIENT_DATA` and an explanatory warning.

---

### 2.3 Economic & Cost KPIs

All economic formulas require explicit, versioned cost configuration parameters:

| Parameter | Default | Unit | Description |
| :--- | :--- | :--- | :--- |
| `carrying_cost_per_unit_hour` | $0.002 | USD/unit-hour | Inventory holding cost (~$0.048/unit/day) |
| `stockout_penalty_per_unit` | $5.00 | USD/unit | Lost sales penalty / customer compensation |
| `cost_per_purchase_order` | $25.00 | USD/PO | Administrative and handling cost per supplier order |
| `unit_waste_cost` | $2.00 | USD/unit | Acquisition valuation per expired unit |
| `currency` | USD | ISO code | Operational currency |

#### A. Inventory Holding Cost (`inventory_holding_cost`)
- **Business Interpretation**: Time-weighted inventory carrying cost over the simulated window.
- **Formula**:
  $$\text{Holding Cost} = \left(\int_{0}^{T} \text{physical\_on\_hand}(t) \, dt \right) \times c_{\text{carrying}}$$
- **Calculation**: Discrete step integration across `StockReceived` (+qty) and `ItemPicked` (-qty) events.
- **Unit**: `USD`
- **Objective**: `LOWER_IS_BETTER`

#### B. Estimated Stockout Penalty (`estimated_stockout_penalty`)
- **Formula**:
  $$\text{Penalty} = \text{total\_stockout\_units} \times c_{\text{penalty}}$$
- **Unit**: `USD`
- **Objective**: `LOWER_IS_BETTER`

#### C. Purchase Order Transaction Cost (`purchase_order_transaction_cost`)
- **Formula**:
  $$\text{PO Cost} = |\text{Unique POs}| \times c_{\text{po}}$$
- **Unit**: `USD`
- **Objective**: `LOWER_IS_BETTER`
- **Source Events**: Distinct `po_id` values from `SupplierDeliveryDue` events.

#### D. Expiry Waste Cost (`expiry_waste_cost`)
- **Status Invariant**: If batch lot tracking and expiry events are not modeled in the scenario, this metric returns status `NOT_APPLICABLE` with explicit explanation.

---

### 2.4 Workload & Queue KPIs

#### A. Peak Queue Depth (`peak_queue_depth`)
- **Business Interpretation**: Maximum concurrent orders waiting in the allocation queue.
- **Formula**:
  $$\text{Peak} = \max_{t} Q(t)$$
  $Q(t)$ increments on `CustomerOrderArrived` and decrements on `StockReserved` or allocation rejection.
- **Unit**: `orders`
- **Objective**: `LOWER_IS_BETTER`

#### B. Backlog Order-Hours (`backlog_order_hours`)
- **Business Interpretation**: Cumulative waiting time across all orders.
- **Formula**:
  $$\text{Backlog Order-Hours} = \int_{0}^{T} Q(t) \, dt$$
- **Unit**: `order-hours`
- **Objective**: `LOWER_IS_BETTER`

#### C. Mean Queue Depth (`mean_queue_depth`)
- **Formula**:
  $$\text{Mean Queue Depth} = \frac{\text{Backlog Order-Hours}}{T_{\text{sim\_hours}}}$$
- **Unit**: `orders`
- **Objective**: `LOWER_IS_BETTER`

---

## 3. Fair Comparison Framework

When comparing a baseline run ($A$) against a candidate optimization run ($B$):

1. **Compatibility Invariants**:
   - $\text{scenario\_id}_A = \text{scenario\_id}_B$ (emits warning if mismatched).
   - $\text{duration}_A \approx \text{duration}_B$ (within 5% tolerance).
   - Cost configurations and currencies must match.
2. **Delta and Percentage Change**:
   - Absolute Difference: $\Delta = V_B - V_A$
   - Percentage Change: If $V_A \neq 0$:
     $$\% \Delta = \frac{V_B - V_A}{|V_A|} \times 100$$
     If $V_A = 0$, percentage change is `null` with explanation: `"Baseline value is zero; percentage change undefined."`
3. **Improvement Direction**:
   - If objective is `HIGHER_IS_BETTER`: $\Delta > 0 \implies \text{IMPROVED}$, $\Delta < 0 \implies \text{DEGRADED}$.
   - If objective is `LOWER_IS_BETTER`: $\Delta < 0 \implies \text{IMPROVED}$, $\Delta > 0 \implies \text{DEGRADED}$.
   - If $\Delta = 0$: $\text{UNCHANGED}$.

---

## 4. API Endpoints

### 4.1 Get Run KPIs
`GET /api/v1/simulation/runs/:id/kpis`
- Returns HTTP 200 with `EvaluationSummary`.
- Returns HTTP 400 if run is still in progress (`QUEUED`, `RUNNING`).
- Returns HTTP 404 if run not found.

### 4.2 Compare Runs
`POST /api/v1/evaluation/compare`
- Body:
  ```json
  {
    "baseline_run_id": "run_baseline_01",
    "candidate_run_id": "run_candidate_02"
  }
  ```
- Returns HTTP 200 with `ComparisonReport`.
- Returns HTTP 400 on malformed payloads.
- Returns HTTP 404 if either run does not exist.
