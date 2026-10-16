---
name: simulation-validation
description: >-
  Use this skill when verifying discrete-event simulation (DES) runs, synthetic
  demand generation, scenario seed reproducibility, and event-derived KPI calculations.
---

# Simulation Validation Skill

Use this runbook to validate the correctness, reproducibility, and metric integrity of simulation runs.

## Validation Principles

### 1. Virtual Clock Verification
- The discrete-event engine must advance virtual time from event to event.
- Assert that virtual clock timestamps advance strictly monotonically.
- Ensure no real wall-clock sleeps (`time.sleep`) are used to simulate delays.

### 2. Deterministic Seed Reproducibility
- Given identical scenario inputs and random seed:
  1. Run simulation A.
  2. Run simulation B.
  3. Compare the event stream arrays: event count, timestamps, event types, and payloads must match exactly.
  4. Compare final computed KPIs: metrics must be 100% identical.

### 3. Workflow Invariant Enforcement
- Synthetic orders generated during simulation must enter the standard order allocation and inventory reservation workflows.
- Confirm that reservations fail or stockout events are emitted when stock is depleted.
- Confirm that supplier delivery events update stock positions only when the scheduled receipt event fires.

### 4. Event-Derived KPI Integrity
- Verify that KPI summaries are computed strictly by aggregating recorded simulation events:
  - `stockout_rate` = (stockout count) / (total item demand)
  - `picking_duration_mean` = average of (pick_completed_at - pick_started_at)
  - `fulfillment_latency` = average of (order_ready_at - order_created_at)
- Reject any hardcoded metric values or unverified statistical estimates.
