# Phase 02 — Inventory Core

## Role

Act as a Senior Backend Engineer, PostgreSQL Transaction Design Specialist, and QA Engineer. Implement Phase 02 of the DarkOps AI platform within the existing Operational API.

Follow the existing repository architecture, domain conventions, migration system, and API contracts. Implement incrementally and provide evidence for all verification claims.

---

## 1. Objective

Implement the foundational inventory accounting system, including:

- Inventory positions and stock accounting.
- Immutable stock movement ledger.
- Concurrency-safe reservations.
- Reservation release and picking consumption.
- Idempotent inventory mutation commands.
- Replenishment recommendation entities and lifecycle.
- Versioned PostgreSQL migrations.
- Repository and application service layers.
- REST endpoints, validation, and structured errors.
- Unit, integration, concurrency, and API contract tests.
- Inventory architecture and API documentation.

Inventory accounting must remain correct under concurrent requests, client retries, transaction failures, and repeated commands.

## 2. Existing Architecture and Compatibility Requirements

Phase 01 has already established the following components:

- PostgreSQL catalog tables: `stores`, `skus`, `products`, `suppliers`, `supplier_skus`, `service_zones`, and `warehouse_layouts`.
- PostgreSQL connection pooling and transaction utilities in `services/operational-api/src/database/db.ts`.
- Versioned SQL migrations and migration history.
- Domain types and Zod validation.
- Repository and application service patterns.
- Authorization and correlation-ID middleware.
- Standardized API error envelopes defined by ADR-003.
- `catalog_audit_events` for catalog mutation auditing.

Requirements:

1. Extend the existing Operational API. Do not create a separate inventory service.
2. Reuse the existing PostgreSQL connection pool, transaction helpers, migration tooling, validation conventions, and error middleware.
3. Add new, versioned, additive SQL migrations. Never edit an already-applied migration.
4. Preserve ADR-003 response envelopes and existing correlation-ID behavior.
5. Extend existing error conventions with inventory-specific codes instead of introducing a competing error format.
6. Reuse the existing authorization boundary. Do not introduce a parallel authentication system.
7. Keep inventory movement records separate from `catalog_audit_events`. The inventory ledger is the accounting source of truth; catalog audit events remain for catalog mutations.
8. Do not repeat or reimplement completed Phase 01 functionality unnecessarily.
9. Do not modify unrelated services or existing catalog behavior.

---

## 3. Inventory Accounting Model

Create an inventory position for each unique `(store_id, sku_id)` combination.

Each position must contain:

- `id`
- `store_id`
- `sku_id`
- `physical_on_hand`
- `reserved_stock`
- `incoming_units`
- `created_at`
- `updated_at`
- Optional `version` for concurrency diagnostics

Use integer quantities for discrete stock units unless the existing domain explicitly requires fractional units. Document the unit convention.

### Accounting invariants

The following must always hold:

1. `available_stock = physical_on_hand - reserved_stock`
2. `physical_on_hand >= 0`
3. `reserved_stock >= 0`
4. `reserved_stock <= physical_on_hand`
5. `incoming_units >= 0`
6. `available_stock >= 0`
7. Incoming stock does not become available until a receipt is recorded.
8. Every committed inventory mutation has corresponding committed ledger entries.
9. A failed mutation leaves neither a partial balance update nor an orphaned success record.

Enforce applicable invariants through PostgreSQL constraints and application-level validation.

Expose `available_stock` as a derived value or generated expression where appropriate. Do not independently maintain a writable available-stock value that can drift from the accounting equation.

### Inventory initialization

A missing inventory position must not silently imply zero stock that can be reserved, nor should the application silently invent available stock.

Define an explicit initialization or opening-stock operation. It must:
- Establish the inventory position.
- Validate the initial quantities.
- Record the appropriate opening-stock movement.
- Execute atomically.
- Be idempotent when retried using the same command key.

Document how opening balances are represented during reconciliation.

---

## 4. Immutable Stock Movement Ledger

Create an inventory movement table with, at minimum:

- `id`
- `store_id`
- `sku_id`
- `movement_type`
- Quantity
- Reference to the reservation or originating command, where applicable
- Source or reason
- Actor or system identity, where available
- Command correlation or idempotency reference
- Timestamp
- Relevant metadata

Use appropriate foreign keys and indexes.

### Supported movement types

Support:
- `OPENING_STOCK`
- `RECEIPT`
- `POSITIVE_ADJUSTMENT`
- `NEGATIVE_ADJUSTMENT`
- `RESERVATION`
- `RESERVATION_RELEASE`
- `PICK_CONSUMPTION`

Document the exact quantity effects of each movement type.

| Movement | Physical on-hand | Reserved stock | Incoming units |
|---|---:|---:|---:|
| Opening stock | Increases | As explicitly initialized | As explicitly initialized |
| Receipt | Increases | No change | Decreases by the received quantity when linked to an incoming record |
| Positive adjustment | Increases | No change | No change |
| Negative adjustment | Decreases | No change | No change |
| Reservation | No change | Increases | No change |
| Reservation release | No change | Decreases | No change |
| Pick consumption | Decreases | Decreases | No change |

All movements must have clearly defined quantity semantics. If an operation affects more than one accounting dimension, its related ledger entries must be committed atomically.

### Ledger immutability

- Normal application paths must never update or delete committed movement records.
- Corrections must use compensating movements.
- A failed mutation must not leave a committed movement without its corresponding balance update.
- A balance update must not commit without its required movement records.
- Prevent accidental ledger mutation through database permissions or an appropriate repository/database access boundary where practical.

### Reconciliation

Implement a reconciliation mechanism that verifies the stored inventory position against the movement history.

Define:
- Opening-balance treatment.
- Physical-stock calculation.
- Reserved-stock calculation.
- Incoming-stock calculation.
- How reservation releases, consumption, and adjustments are represented.
- How discrepancies are reported without silently rewriting history.

Do not recalculate the complete ledger on every inventory request. Update positions transactionally and use reconciliation for verification.

---

## 5. Reservation Domain and Lifecycle

Create a reservation entity containing:

- `id`
- `store_id`
- `sku_id`
- `quantity`
- `remaining_quantity`
- `status`
- `created_at`
- `updated_at`
- Relevant release or consumption timestamps
- Optional external reference for future integrations

Use a database constraint or equivalent invariant to ensure that remaining quantity is never negative and never exceeds the original reservation quantity.

### Reservation lifecycle

At minimum, support:

- `ACTIVE`
- `PARTIALLY_RELEASED`, if partial release is implemented
- `PARTIALLY_CONSUMED`, if partial consumption is implemented
- `RELEASED`
- `CONSUMED`

Define and document the allowed state transitions before implementation.

Requirements:

1. Reservation quantity must be positive.
2. A reservation must reference a valid store, SKU, and inventory position.
3. A release cannot exceed the remaining reserved quantity.
4. Consumption cannot exceed the remaining reserved quantity.
5. A fully released or consumed reservation cannot be mutated again.
6. Repeated release or consumption commands must not change balances twice.
7. Partial operations, if supported, must update remaining quantity and status correctly.
8. All reservation state changes, inventory changes, and movement records must be atomic.

Do not implement order management or the picking workflow in this phase. Expose the inventory capabilities needed by future modules.

---

## 6. Concurrency-Safe Inventory Mutations

Use PostgreSQL row-level locking with `SELECT ... FOR UPDATE`, or another demonstrably correct transaction strategy.

All stock mutations must execute within database transactions.

### Required mutation sequence

1. Begin a transaction.
2. Claim or validate the idempotency key.
3. Acquire the necessary database locks in a documented, consistent order.
4. Read and validate the latest inventory and reservation state.
5. Check all quantity and state invariants.
6. Update the inventory position and reservation state, where applicable.
7. Insert the corresponding immutable movement records.
8. Persist the successful idempotency result.
9. Commit the transaction.

Adapt this sequence as needed to prevent duplicate execution during concurrent requests with the same idempotency key. Never hold locks longer than necessary.

If any required operation fails, roll back the entire mutation.

### Concurrency acceptance scenario

Given one inventory position with 10 available units, issue 50 independent concurrent reservation requests, each requesting one unit.

Expected results:
- Exactly 10 requests succeed.
- Exactly 40 requests fail with `INSUFFICIENT_STOCK`.
- Final available stock is zero.
- Final reserved stock is 10.
- Physical stock remains unchanged at its original quantity.
- Exactly 10 successful reservations exist.
- Exactly 10 corresponding reservation movements exist.
- No failed request leaves partial changes.
- All inventory invariants hold.

Run this test against live PostgreSQL using independent connections and real concurrent requests. Mocks and sequential loops do not satisfy this requirement.

### Deadlocks and transaction conflicts

- Use consistent lock ordering.
- Where relevant, handle deadlocks or serialization failures with bounded retries.
- Do not retry indefinitely.
- Ensure retries cannot duplicate committed side effects.
- Distinguish `CONCURRENCY_CONFLICT` from `INSUFFICIENT_STOCK`.
- Do not return an insufficient-stock error merely to hide a persistent database or infrastructure failure.

---

## 7. Durable Idempotency

Require an `Idempotency-Key` header for externally exposed inventory mutation endpoints.

Implement a persistent idempotency table containing:

- Idempotency key.
- Operation or endpoint scope.
- Appropriate actor or client scope.
- Request fingerprint.
- Execution status.
- Original HTTP status.
- Original response body.
- Creation and completion timestamps.

Enforce uniqueness in PostgreSQL for the chosen key scope.

### Required behavior

1. An identical retry returns the original successful result.
2. A mutation executes at most once for a given scoped key.
3. Concurrent requests with the same key cannot both execute the mutation.
4. Reusing a key with a different request fingerprint returns a structured conflict.
5. Failed transactions cannot leave a success record for an uncommitted mutation.
6. Transient failures and incomplete executions have documented recovery behavior.
7. Idempotency correctness must not depend on an in-memory cache.
8. The balance update, movement entries, reservation changes, and successful idempotency result must commit atomically where they share PostgreSQL.

Use a deterministic request fingerprint based on the validated semantic payload, not incidental JSON property ordering.

Document:
- Key scope.
- Key format and maximum length.
- Retention policy.
- Concurrent duplicate handling.
- Failure recovery.
- Behavior after a stored key expires.

Do not expire keys in a way that permits unsafe replay of a previously committed mutation.

---

## 8. Replenishment Recommendations

Implement replenishment recommendation records and a deterministic recommendation policy.

Each recommendation must include:

- `id`
- `store_id`
- `sku_id`
- Suggested quantity
- Status
- Reason
- Calculation inputs
- Creation and update timestamps
- Decision actor and timestamp, where applicable
- Execution reference or timestamp, where applicable

Support statuses:
- `PENDING`
- `APPROVED`
- `REJECTED`
- `EXECUTED`

### Recommendation behavior

Implement a documented, configurable threshold-based policy using available inventory data. Avoid adding forecasting or optimization dependencies.

Define:
- How the recommendation threshold is configured.
- How suggested quantities are calculated.
- How invalid or missing inputs are handled.
- Which status transitions are allowed.
- Whether duplicate pending recommendations are permitted.
- How recommendation execution is recorded.

`EXECUTED` means the recommendation has been marked as executed; it does not mean physical stock has arrived.

Actual supplier purchasing, purchase orders, external supplier integrations, forecasting models, and replenishment optimization remain out of scope.

Do not mutate inventory balances when generating, approving, or rejecting a recommendation. Stock changes only through explicit inventory mutation operations.

---

## 9. REST API

Implement endpoints under `/api/v1` using the existing Express application.

### Inventory queries
- `GET /api/v1/inventory`
- `GET /api/v1/inventory/:storeId/:skuId`

### Inventory mutations
- `POST /api/v1/inventory/initialize`
- `POST /api/v1/inventory/receipts`
- `POST /api/v1/inventory/adjustments`
- `POST /api/v1/inventory/reserve`
- `POST /api/v1/inventory/release`
- `POST /api/v1/inventory/consume`

### Movement history
- `GET /api/v1/inventory/movements`

### Replenishment recommendations
Implement endpoints for listing and creating recommendations, approving and rejecting them, and marking approved recommendations as executed.

Choose route names consistently with existing API conventions and document the final contract.

### API requirements

- Use Zod validation for request bodies, headers, path parameters, and query parameters.
- Reject invalid requests before executing mutations.
- Reuse ADR-003 success and error envelopes.
- Reuse existing error middleware and correlation IDs.
- Apply bounded pagination and deterministic ordering to list endpoints.
- Require the existing authorization mechanism for administrative mutations.
- Document how future service-to-service callers will be authorized.
- Do not leak SQL errors, stack traces, or internal implementation details.

Document request and response schemas, status codes, idempotency requirements, and representative responses in the OpenAPI specification.

### Error codes

Use the existing error conventions and support at least:

- `VALIDATION_ERROR`
- `INSUFFICIENT_STOCK`
- `CONCURRENCY_CONFLICT`
- `IDEMPOTENCY_KEY_REUSED`
- `INVALID_RESERVATION_STATE`
- `INVENTORY_POSITION_NOT_FOUND`
- `RESERVATION_NOT_FOUND`
- `REPLENISHMENT_RECOMMENDATION_NOT_FOUND`

Add further codes only where needed for clear, actionable error handling.

---

## 10. Database Migrations and Repositories

Create new versioned migrations for:

- Inventory positions.
- Stock movement ledger.
- Reservations.
- Idempotency records.
- Replenishment recommendations.

Use foreign keys to the existing catalog tables and appropriate indexes for:
- Unique store/SKU positions.
- Inventory queries.
- Movement history.
- Reservation lookup.
- Idempotency key lookup.
- Recommendation queries.

Requirements:
- Preserve existing migration history and data.
- Use safe, additive schema changes.
- Use parameterized SQL.
- Reuse existing connection pooling and transaction helpers.
- Define transaction boundaries and lock ordering explicitly.
- Keep SQL and persistence details out of controllers.
- Keep all inventory mutation logic inside inventory application services.
- Do not create a second connection pool or transaction framework.

Do not let Orders, Picking, Simulation, or other modules directly mutate inventory tables. All changes must pass through the inventory use cases.

Keep the platform as a modular monolith. Do not introduce Redis, message brokers, or additional services solely for this phase.

---

## 11. Testing Requirements

### Unit tests

Test:
- Inventory accounting arithmetic.
- Available-stock derivation.
- Quantity validation.
- Movement accounting semantics.
- Reservation state transitions.
- Partial release and consumption, if supported.
- Idempotency request fingerprints.
- Replenishment recommendation calculation and lifecycle.

### PostgreSQL integration tests

Test:
- Migrations on an isolated empty database.
- Foreign key and check constraints.
- Atomic balance and ledger updates.
- Transaction rollback after simulated failures.
- Reservation release and consumption.
- Durable idempotency and payload mismatch.
- Concurrent duplicate idempotency requests.
- Balance-to-ledger reconciliation.

### Concurrency tests

Test:
1. Fifty concurrent one-unit reservations against ten available units.
2. Concurrent identical requests using the same idempotency key.
3. Concurrent release and consumption attempts against the same reservation.
4. Concurrent negative adjustments and reservations against limited stock.

Use independent PostgreSQL connections and real concurrent requests.

Verify:
- Final balances.
- Reservation records.
- Ledger records.
- Idempotency records.
- Absence of partial mutations.
- All accounting invariants.

### API contract tests

Cover:
- Successful initialization and receipt.
- Positive and negative adjustments.
- Reservation, release, and consumption.
- Missing or malformed idempotency keys.
- Identical request replays.
- Idempotency-key reuse with a different payload.
- Insufficient stock.
- Invalid quantities and reservation states.
- Not-found resources.
- Standardized response envelopes.
- Authorization behavior.

Automated tests must use an isolated test database, never production data. Do not require paid external API calls.

---

## 12. Documentation

Create `docs/architecture/inventory-ledger.md` documenting:

- Inventory accounting equations.
- Entity relationships.
- Movement types and balance effects.
- Reservation lifecycle and state transitions.
- Transaction boundaries and lock strategy.
- Idempotency guarantees and recovery.
- Replenishment calculation and lifecycle.
- Reconciliation strategy.
- Error codes.
- Concurrency test methodology and observed results.

Update the existing OpenAPI specification with all new endpoints, headers, request/response schemas, and error codes.

Ensure the documentation matches the actual implementation.

---

## 13. Acceptance Criteria

Phase 02 is complete only when:

1. Inventory position constraints enforce all accounting invariants.
2. Balance changes and ledger records are transactionally consistent.
3. The ledger is immutable through normal application operations.
4. Reconciliation verifies balances against movement history.
5. Concurrent reservations cannot oversell stock.
6. The 50-versus-10 PostgreSQL concurrency test passes with exactly 10 successes and 40 insufficient-stock failures.
7. Identical idempotent requests cannot apply a mutation twice.
8. Reusing a key with a different payload is rejected.
9. Release and consumption cannot over-adjust reservations.
10. Replenishment recommendations have documented calculation rules and valid state transitions.
11. API contracts, ADR-003 envelopes, and inventory error codes are tested.
12. All required unit, integration, concurrency, and contract tests pass.
13. The existing Operational API builds and the existing Docker Compose stack remains functional.
14. No order lifecycle, supplier purchasing, forecasting engine, or optimization algorithm is implemented prematurely.

---

## 14. Execution Plan

Implement incrementally:

1. Domain entities and accounting contracts.
2. Database migrations.
3. Repositories and transaction integration.
4. Inventory accounting and movement services.
5. Reservation lifecycle.
6. Idempotency.
7. REST endpoints.
8. Replenishment recommendations.
9. Integration and concurrency tests.
10. Documentation and regression verification.

After each major step, run relevant tests and inspect the diff.

Do not claim a test passed unless its command was executed and the result observed. Report skipped tests and environment limitations honestly.

Do not begin Phase 03 during this task.

---

## 15. Completion Report

Provide a Markdown report containing:

- **Inventory entities and migrations:** tables, constraints, and migration commands/results.
- **Accounting guarantees:** balance invariants and movement semantics.
- **Reservation lifecycle:** supported transitions and edge cases.
- **Concurrency verification:** test parameters, actual results, and final balances.
- **Idempotency verification:** replay results, concurrent duplicate handling, and key-reuse conflict behavior.
- **Reconciliation:** test methodology and observed results.
- **Replenishment recommendations:** policy and state transitions.
- **API endpoints:** routes, headers, and sample responses.
- **Tests executed:** commands, pass/fail counts, and skipped tests.
- **Build and regression results:** actual observed outcomes.
- **Files changed:** relevant created and modified files.
- **Known limitations and unresolved risks.**
- **Git status and commit hash**, if committed.
- **Phase 03 readiness recommendation.**

Stop after Phase 02 and await review.