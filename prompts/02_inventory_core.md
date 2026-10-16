# Phase 02 — Inventory Core

## Objective
Implement core inventory accounting, stock movements, safe concurrent reservations, replenishment recommendations, and immutable audit logs within the Operational API.

## Scope
- Implement inventory accounting entities and domain rules:
  - Inventory positions: Physical on-hand, Reserved units, Available units (`available = physical - reserved`), and Incoming units.
  - Stock movement ledger: movements recording stock receipt, positive/negative adjustments, reservations, releases, and picking consumption.
- Implement concurrency-safe reservation engine using PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) or serializable transactions.
- Implement replenishment recommendation domain entities (`status`: `PENDING`, `APPROVED`, `REJECTED`, `EXECUTED`).
- Implement idempotent inventory mutation commands with `Idempotency-Key` headers.
- Expose REST endpoints: `/api/v1/inventory`, `/api/v1/inventory/reserve`, `/api/v1/inventory/release`, `/api/v1/inventory/movements`.

## Dependencies
- Phase 01: Domain Contracts and Persistence (Store and SKU catalog schemas).

## Business & Engineering Invariants
- `available_stock` must strictly equal `physical_on_hand - reserved_stock`. Available stock must never drop below zero.
- Two simultaneous reservation requests competing for the last unit of stock must not oversell; exactly one succeeds, and the other receives an explicit `INSUFFICIENT_STOCK` error.
- External modules (Orders, Picking, Simulation) must never write directly to inventory tables. All changes must pass through inventory use cases.
- Stock movements are immutable ledger entries; stock quantities are recalculated or verified against ledger history.

## Acceptance Criteria
1. Concurrency test with 50 parallel reservation attempts against 10 available units succeeds exactly 10 times and fails cleanly 40 times.
2. Idempotent reservation requests with identical keys return the original reservation result without decrementing stock twice.
3. Stock release returns reserved units to available stock immediately.
4. Confirmed pick consumption decrements both physical on-hand and reserved units atomically.

## Required Tests
- Unit tests: inventory arithmetic, reservation invariant checks, available stock calculations.
- Concurrency integration tests: multi-threaded or parallel promise race conditions for stock depletion against live PostgreSQL.
- Idempotency tests: replayed requests with identical headers.

## Documentation Updates
- Update `docs/architecture/inventory-ledger.md` with stock movement state machines and concurrency guarantees.
- Update API documentation with error codes (`INSUFFICIENT_STOCK`, `CONCURRENCY_CONFLICT`).

## Completion Report Format
```markdown
### Phase 02 Completion Report
- **Inventory Engine Features**: [ledger, reservation manager, movement tracker]
- **Concurrency Verification**: [parallel test parameters, pass rates, lock timing]
- **Invariants Tested**: [no overselling, non-negative available stock]
- **Next Steps**: [Phase 03 readiness]
```
