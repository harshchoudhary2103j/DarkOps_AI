# Phase 03 — Order Lifecycle

## Objective
Implement order management, order lifecycle state machines, single-store allocation workflows, picking tasks, pick confirmations, and automated reservation rollback upon failure.

## Scope
- Implement Order domain models:
  - `Order`: Order ID, customer location, delivery zone, total lines, status lifecycle (`CREATED` -> `ALLOCATION_PENDING` -> `ALLOCATED` -> `PICKING` -> `PICKED` -> `READY`, plus `CANCELLED` and `FAILED`).
  - `OrderLine`: Line ID, SKU, requested quantity, reserved quantity, picked quantity.
- Implement Picking domain models:
  - `PickingTask`: Task ID, store ID, order ID, status (`PENDING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`), assigned picker ID.
  - `PickItem`: Item ID, SKU, target shelf location, status (`PENDING`, `PICKED`, `MISSING`, `DAMAGED`).
- Implement the Order Allocation Workflow:
  - Evaluate candidate stores by service polygon, open status, and basket availability.
  - Call Inventory Core to reserve stock atomically.
  - If stock reservation succeeds: transition Order to `ALLOCATED` and generate `PickingTask`.
  - If reservation fails or no store eligible: transition Order to `FAILED` with explicit failure rationale.
- Implement cancellation and exception workflows: release reserved inventory when an order is cancelled or picking fails.

## Dependencies
- Phase 01: Domain Contracts and Persistence.
- Phase 02: Inventory Core.

## Business & Engineering Invariants
- An order cannot transition to `ALLOCATED` without a verified inventory reservation reference.
- Direct status jumps (e.g., `CREATED` -> `READY`) are strictly prohibited and must be rejected by the domain state machine.
- If picking encounters missing items, the system records explicit missing item events and triggers documented compensation or partial fulfillment logic; it must not pretend all items were picked.
- Order cancellation must atomically invoke Inventory Core to release all reserved stock.

## Acceptance Criteria
1. Full happy-path lifecycle executes: Order Created -> Allocated -> Stock Reserved -> Picking Created -> Items Picked -> Order Ready.
2. Concurrent allocation attempts for orders requesting remaining stock safely allocate to the winner and fail gracefully for the loser.
3. Order cancellation at `ALLOCATED` or `PICKING` stage successfully releases reserved stock back to available stock.
4. Attempting an invalid state transition returns an explicit domain state machine error.

## Required Tests
- State machine unit tests covering all valid transitions and rejecting all invalid transitions.
- Workflow integration tests covering store candidate filtering, reservation integration, and picking task generation.
- Rollback tests: cancelling an allocated order verifies stock balance returns to original available count.

## Documentation Updates
- Update `docs/architecture/order-lifecycle.md` with complete state transition diagrams.
- Document order and picking task REST API endpoints in OpenAPI specs.

## Completion Report Format
```markdown
### Phase 03 Completion Report
- **State Machine Implementation**: [order and picking task lifecycles]
- **Allocation Workflow**: [store filtering, stock reservation handshake]
- **Rollback & Compensation**: [cancellation and missing item handling verified]
- **Next Steps**: [Phase 04 readiness]
```
