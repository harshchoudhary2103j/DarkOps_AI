# Phase 03 — Order Lifecycle

## Role

Act as a Senior Backend Engineer, Distributed Workflow Designer, PostgreSQL Transaction Specialist, and QA Engineer.

Implement Phase 03 of the DarkOps AI platform within the existing Operational API, following the established repository architecture and the contracts established in Phases 01 and 02.

Build a reliable order lifecycle with single-store allocation, inventory reservation, picking tasks, pick confirmations, cancellation, and failure compensation.

Implement incrementally. Do not claim verification unless the relevant tests were actually executed.

---

## 1. Objective

Implement:
- Order and order-line domain models.
- An explicit order state machine.
- Store eligibility and single-store basket allocation.
- Integration with the existing Inventory Core.
- Durable allocation workflow and failure recovery.
- Picking tasks and pick items.
- Pick confirmation and missing/damaged item handling.
- Order cancellation and reservation release.
- Idempotent order and picking commands.
- REST endpoints, validation, and standardized errors.
- Unit, integration, concurrency, and API contract tests.
- Order lifecycle documentation and OpenAPI updates.

The result must preserve inventory correctness during retries, concurrent allocation attempts, cancellation, picking failures, and partial fulfillment.

## 2. Architecture and Compatibility

Extend the existing Operational API as a modular monolith.

Reuse:
- Existing PostgreSQL connection pooling and transaction helpers.
- Versioned SQL migration tooling.
- Existing stores, service zones, SKUs, and warehouse layouts.
- Inventory positions, reservations, movement ledger, and Inventory Core application services.
- Existing idempotency infrastructure.
- Zod validation, authorization middleware, correlation IDs, and ADR-003 response envelopes.

Requirements:
1. Add new versioned migrations; never edit an already-applied migration.
2. Do not create a second inventory implementation or write directly to inventory tables from order or picking code.
3. All inventory mutations must go through the existing Inventory Core use cases and preserve its accounting invariants.
4. Reuse the existing idempotency mechanism where its contract is suitable.
5. If order creation, allocation, or cancellation spans multiple database transactions or service boundaries, use a durable workflow with idempotent steps and compensating actions.
6. Do not introduce microservices, Redis, or a message broker solely for this phase.
7. Do not reimplement catalog or inventory functionality unnecessarily.

## 3. Order Domain

Implement an Order entity containing:
- Order ID.
- Customer reference, if available.
- Customer delivery location.
- Delivery zone or zone reference, when applicable.
- Selected store ID once allocated.
- Order status.
- Total distinct line count.
- Total requested units.
- Failure code and safe failure rationale, when applicable.
- Creation and update timestamps.
- Relevant allocation, cancellation, and completion timestamps.

Implement OrderLine containing:
- Order-line ID.
- Order ID.
- SKU ID.
- Requested quantity.
- Reserved quantity.
- Picked quantity.
- Missing quantity, where applicable.
- Damaged quantity, where applicable.
- Line status and timestamps.

Requirements:
- Order quantities must be positive integers unless the catalog explicitly supports fractional units.
- Each SKU must appear only once per order line set, or duplicate SKU lines must be normalized deterministically.
- All SKU references must be valid.
- Quantities must satisfy documented bounds.
- Picked quantities must never exceed reserved quantities.
- Missing and damaged quantities must not be represented as successfully picked quantities.
- Define how quantities are reconciled when an item is partially fulfilled.
- Calculate derived totals consistently rather than trusting client-provided totals.
- Persist monetary totals only if required by the existing domain; define currency and exact decimal handling if implemented.

Create versioned migrations and the necessary indexes, foreign keys, uniqueness constraints, and check constraints.

## 4. Order State Machine

Implement and document the following primary lifecycle:

`CREATED → ALLOCATION_PENDING → ALLOCATED → PICKING → PICKED → READY`

Terminal outcomes:
- `CANCELLED`
- `FAILED`

Define every permitted transition explicitly.

### Transition rules

- `CREATED → ALLOCATION_PENDING`: a valid order has been accepted for allocation.
- `ALLOCATION_PENDING → ALLOCATED`: the chosen store has successfully reserved the complete required basket and the reservation references have been persisted.
- `ALLOCATION_PENDING → FAILED`: no eligible store exists, stock allocation fails after candidate evaluation, or allocation reaches a documented terminal failure.
- `ALLOCATED → PICKING`: a valid picking task has been created and picking begins.
- `PICKING → PICKED`: all required picking decisions are recorded, including any explicitly permitted missing or damaged quantities, and inventory consumption/release reconciliation succeeds.
- `PICKED → READY`: the order satisfies the documented readiness criteria.
- `CREATED`, `ALLOCATION_PENDING`, `ALLOCATED`, and `PICKING` may transition to `CANCELLED` only through documented cancellation behavior and after required compensation is confirmed.
- `PICKED → CANCELLED` is prohibited unless a future phase explicitly introduces a post-pick cancellation and reverse-inventory workflow.
- `READY`, `CANCELLED`, and `FAILED` are terminal in this phase.

If the workflow requires additional internal states, such as `ALLOCATION_COMPENSATION_PENDING` or `CANCELLATION_PENDING`, model them explicitly rather than reporting a terminal result before compensation finishes.

### State machine requirements

- Centralize transition rules in a domain/application service.
- Reject direct or invalid state jumps.
- Persist status changes atomically with their associated order events.
- Protect concurrent transitions using row locks or optimistic version checks.
- Make retries of the same transition idempotent.
- Return structured errors for invalid transitions.
- Prevent a successful allocation state without verified inventory reservation references.

Document the transition graph and the conditions required for every edge.

## 5. Store Eligibility and Allocation

Implement single-store allocation. Each order must be allocated to one store that can fulfill the complete requested basket.

### Candidate filtering

Evaluate candidate stores using:
1. Store status and availability.
2. Customer delivery location.
3. Applicable service-zone eligibility.
4. Valid store-to-zone ownership.
5. Complete basket availability.

Use the existing geographic representation from Phase 01. Implement and document point-in-polygon semantics, including boundary behavior.

Do not assume that checking the store's own polygon automatically checks all applicable service-zone rules. Apply the configured delivery eligibility policy consistently.

### Candidate selection

- Filter out ineligible stores before attempting reservations.
- Evaluate all required SKUs and quantities.
- Do not select a store merely because it has some of the requested items.
- Define a deterministic candidate ordering, such as a documented priority followed by a stable tie-breaker.
- Do not introduce distance optimization unless explicitly required.
- Account for stock changing between eligibility evaluation and reservation.

### Inventory reservation handshake

For each candidate:
1. Attempt to reserve the complete basket through the existing Inventory Core use cases.
2. Use an idempotency key derived from a stable allocation command identifier and the relevant operation scope.
3. Persist the returned reservation references and quantities.
4. Mark the order `ALLOCATED` only after the reservation result has been verified and persisted.
5. Create exactly one initial picking task for the successfully allocated order.

If the candidate cannot fulfill the basket:
- Do not leave partial reservations behind.
- If the inventory API supports atomic multi-SKU reservations, use that operation.
- Otherwise, coordinate the individual reservations through a durable allocation workflow. Record each successful reservation and compensate successful earlier reservations if a later line fails.
- Do not advance to another candidate until the previous candidate's reservations are confirmed released or safely reconciled.

If all eligible candidates fail, transition the order to `FAILED` with a stable failure code and safe explanation.

### Workflow recovery

Allocation may span multiple transactions. Do not claim that an ordinary database transaction makes an external API call atomic.

Persist enough workflow state to recover from:
- Process crashes.
- Timeouts with an unknown reservation outcome.
- Duplicate requests.
- Partial basket reservation failures.
- Reservation success followed by order persistence failure.
- Picking-task creation failure.

Use idempotent steps and compensating actions. If compensation cannot be confirmed, retain a recoverable nonterminal workflow state and expose the failure for retry or operational intervention.

## 6. Picking Domain

Implement PickingTask containing:
- Task ID.
- Order ID.
- Store ID.
- Status.
- Assigned picker ID, when applicable.
- Creation and update timestamps.
- Start and completion timestamps, where applicable.

Support task statuses:
- `PENDING`
- `IN_PROGRESS`
- `COMPLETED`
- `FAILED`

Implement PickItem containing:
- Pick-item ID.
- Picking-task ID.
- Order-line reference.
- SKU ID.
- Target shelf location derived from the active warehouse layout.
- Requested pick quantity.
- Confirmed picked quantity.
- Missing quantity.
- Damaged quantity.
- Status.
- Relevant timestamps.

Support item statuses:
- `PENDING`
- `PICKED`
- `MISSING`
- `DAMAGED`

Define whether mixed outcomes for a single item are supported. If so, represent the quantities explicitly instead of forcing one status to describe multiple outcomes.

### Picking requirements

- Generate pick items from the allocated order lines and the selected store's active warehouse layout.
- Resolve shelf locations only from a valid layout belonging to that store.
- Define behavior when a SKU has no suitable shelf location; do not fabricate a location.
- Ensure only one active initial picking task exists per order.
- Protect task and item transitions against concurrent or duplicate commands.
- Record picker identity when authenticated picker information is available.
- Do not implement route optimization or picking-sequence optimization in this phase.
- Keep task generation and order status transitions consistent.

## 7. Pick Confirmation and Inventory Consumption

Implement an explicit pick-confirmation use case.

### Successful pick

For successfully picked quantities:
1. Validate the picking task and item state.
2. Validate the requested quantity against the reservation's remaining quantity.
3. Consume the corresponding reserved inventory through Inventory Core.
4. Record the confirmed picked quantity.
5. Persist the associated order and picking updates.
6. Make the operation idempotent.

Inventory consumption must decrease physical on-hand and reserved quantities atomically within Inventory Core.

### Missing or damaged items

A missing or damaged item must not be marked as successfully picked.

For an affected reservation:
- Consume only the quantity actually confirmed picked.
- Release the unfulfilled reserved quantity through Inventory Core.
- Record the missing/damaged outcome.
- Update the order-line quantities and status.
- Reconcile all quantities and reservation references.

Do not release quantities already consumed.

If the inventory operation and order database changes cannot share one transaction, use a durable workflow and idempotent compensation so retries cannot duplicate consumption or release.

### Order completion criteria

Define the exact conditions for:
- Completing a picking task.
- Transitioning an order to `PICKED`.
- Transitioning an order to `READY`.

A partially fulfilled order must be represented accurately. Do not silently mark it fully fulfilled.

If partial fulfillment is allowed, document the policy and how the order reaches readiness. If it is not allowed, define a consistent exception/compensation path and terminal outcome.

## 8. Cancellation and Failure Compensation

Implement cancellation for orders in supported preterminal states.

### Cancellation requirements

- Reject cancellation of terminal orders.
- Prevent new picking confirmations from racing with cancellation.
- Determine which reservation quantities remain unconsumed.
- Release only those remaining reserved quantities through Inventory Core.
- Do not release stock already consumed.
- Record cancellation reason, actor, and timestamp where available.
- Transition the order to `CANCELLED` only after the required release operations have been confirmed.
- Make repeated cancellation requests idempotent.

If cancellation fails partway through:
- Persist enough workflow state to resume safely.
- Do not falsely report the order as fully cancelled while reservations remain active.
- Retry idempotently or require operational intervention when compensation cannot be confirmed.

### Picking failure

If a picking task fails:
- Record the task failure and reason.
- Stop further pick confirmations unless explicitly permitted by the recovery policy.
- Reconcile consumed and remaining reserved quantities.
- Release only unconsumed reserved stock when the documented policy requires it.
- Ensure that order and task terminal states accurately reflect the result.
- Never perform a duplicate release or consumption during recovery.

Use explicit compensation workflows rather than pretending distributed operations can always be rolled back atomically.

## 9. Idempotency and Concurrency

Use the existing durable idempotency infrastructure for externally exposed mutation commands.

Support safe retries for:
- Order creation.
- Allocation requests.
- Cancellation.
- Picking task start.
- Pick confirmation.
- Missing/damaged item reporting.
- Picking failure handling.

Requirements:
- Identical retries return the original outcome without repeating mutations.
- Reuse of an idempotency key with a different request must follow the existing key-conflict contract.
- Concurrent allocation requests for the same order must not create duplicate allocations or picking tasks.
- Concurrent cancellation and pick confirmation must be serialized or resolved using version checks and documented conflict handling.
- Inventory reservations and consumption must use Inventory Core's existing concurrency and accounting safeguards.
- Use database uniqueness constraints and locks where appropriate.
- Do not use in-memory deduplication as the correctness mechanism.

## 10. REST API

Implement endpoints under `/api/v1` using the existing Express application conventions.

### Orders

- `POST /api/v1/orders`
- `GET /api/v1/orders`
- `GET /api/v1/orders/:orderId`
- `POST /api/v1/orders/:orderId/allocate`
- `POST /api/v1/orders/:orderId/cancel`

Add further endpoints only when required by the documented workflow.

### Picking

- `GET /api/v1/picking/tasks`
- `GET /api/v1/picking/tasks/:taskId`
- `POST /api/v1/picking/tasks/:taskId/start`
- `POST /api/v1/picking/tasks/:taskId/items/:itemId/confirm`
- `POST /api/v1/picking/tasks/:taskId/items/:itemId/report-exception`
- `POST /api/v1/picking/tasks/:taskId/fail`

Define request and response schemas for all endpoints.

Requirements:
- Validate request bodies, headers, path parameters, and query parameters using Zod.
- Use the existing ADR-003 response and error envelopes.
- Reuse existing authorization and correlation-ID middleware.
- Require appropriate authorization for order mutations and picker operations.
- Apply bounded pagination and deterministic ordering to list endpoints.
- Return explicit domain errors for invalid transitions, unavailable allocation, missing reservations, duplicate operations, and unresolved compensation.
- Do not expose stack traces or database internals.
- Document idempotency requirements for mutation endpoints.

Use the project's established route naming and API conventions if equivalent routes already exist.

## 11. Persistence and Transaction Design

Create additive migrations for:
- Orders.
- Order lines.
- Picking tasks.
- Pick items.
- Order lifecycle events or equivalent durable workflow history.
- Allocation/compensation workflow records, where needed.

Use appropriate:
- Foreign keys.
- Unique constraints.
- Check constraints.
- Indexes for status, store, order, task, and workflow lookups.
- Timestamps and optimistic version fields where appropriate.

Ensure:
- Order-line quantities remain valid.
- Picking tasks reference valid orders and stores.
- Pick items reference valid task and order-line records.
- Reservation references are stored and traceable.
- Duplicate task generation is prevented at the database level where possible.
- State transitions and associated event records are persisted consistently.

Keep all SQL parameterized.

Do not store redundant inventory balances in order tables. Inventory remains owned by Inventory Core.

## 12. Testing Requirements

### Unit tests

Test:
- Every allowed order state transition.
- Every prohibited order state transition.
- Picking task transitions.
- Order-line quantity invariants.
- Allocation eligibility decisions.
- Missing and damaged item accounting.
- Cancellation eligibility.
- Idempotent command behavior.

### Workflow integration tests

Test against PostgreSQL and the actual Inventory Core implementation:
- Successful order creation and allocation.
- Complete basket eligibility.
- Store and service-zone filtering.
- Reservation references persisted on successful allocation.
- Exactly one picking task generated.
- Correct shelf lookup from the active warehouse layout.
- Allocation failure when no store can fulfill the basket.
- Recovery when a reservation succeeds but later workflow steps fail.
- Cancellation and inventory release.
- Picking failure and compensation.
- Missing and damaged item handling.
- Correct transition to `PICKED` and `READY`.

### Concurrency tests

Test:
- Two orders competing for the remaining inventory.
- Concurrent allocation attempts for the same order.
- Concurrent cancellation and pick confirmation.
- Concurrent duplicate pick confirmations.
- Duplicate cancellation requests.
- Failure recovery after a partial allocation or compensation attempt.

Verify final order states, reservations, inventory balances, ledger entries, picking tasks, and workflow records.

### API contract tests

Test:
- Valid and invalid order creation.
- Invalid state transitions.
- Missing or malformed idempotency keys.
- Duplicate requests.
- Insufficient inventory.
- Missing or invalid store eligibility.
- Cancellation and picking exceptions.
- Authorization failures.
- Standardized success and error envelopes.

Use an isolated test database. Execute the integration tests rather than only checking that test files exist. Report the actual commands and results.

## 13. Documentation

Create `docs/architecture/order-lifecycle.md` containing:
- Order state transition diagram.
- Picking task and item state transition diagrams.
- Store eligibility and allocation policy.
- Inventory reservation handshake.
- Allocation recovery and compensation.
- Cancellation behavior.
- Missing/damaged item policy.
- Pick consumption semantics.
- Idempotency and concurrency guarantees.
- Transaction boundaries and failure recovery.
- Relevant API endpoints and error codes.

Update the existing OpenAPI specification with all new order and picking endpoints, request/response schemas, required headers, and structured error responses.

Keep documentation synchronized with the implementation.

## 14. Acceptance Criteria

Phase 03 is complete only when:

1. The complete order happy path succeeds: creation → allocation → reservation → picking task → pick confirmation → `PICKED` → `READY`.
2. An order cannot reach `ALLOCATED` without verified reservation references.
3. Invalid state transitions are rejected.
4. Store eligibility and whole-basket allocation are deterministic and tested.
5. Concurrent orders cannot oversell inventory.
6. Repeated allocation requests cannot create duplicate reservations or picking tasks.
7. Cancellation releases all remaining reserved stock without reversing already-consumed stock.
8. Missing and damaged items are recorded explicitly and correctly reconciled.
9. Partial workflow failures can be retried or compensated safely.
10. Concurrent cancellation and pick confirmation cannot produce inconsistent outcomes.
11. All mutation endpoints have documented retry/idempotency behavior.
12. Unit, integration, concurrency, and API contract tests pass.
13. Documentation and OpenAPI specifications match the actual implementation.
14. Existing services and inventory functionality continue to operate correctly.
15. No multi-store split fulfillment, route optimization, payment processing, or delivery dispatch system is introduced unless explicitly required by the existing phase specification.

## 15. Execution Plan

Implement incrementally:

1. Domain entities, state machines, and invariants.
2. Database migrations and repositories.
3. Order creation and validation.
4. Store eligibility and allocation workflow.
5. Inventory reservation integration.
6. Picking task and item generation.
7. Pick confirmation and exception handling.
8. Cancellation and compensation.
9. Idempotency and concurrency safeguards.
10. Unit, integration, concurrency, and API contract tests.
11. Documentation and regression verification.

Run relevant tests after each major step. Do not claim tests passed unless their commands were actually executed and results observed.

Do not begin Phase 04 during this task.

## 16. Completion Report

Provide a Markdown report containing:

- **Entities and migrations:** tables, constraints, and migration results.
- **State machines:** valid transitions and tested invalid transitions.
- **Allocation workflow:** eligibility policy and reservation integration.
- **Picking:** task generation, shelf mapping, and confirmation behavior.
- **Cancellation and compensation:** release behavior and failure recovery.
- **Concurrency verification:** test scenarios, parameters, and actual results.
- **Idempotency verification:** duplicate requests and conflict behavior.
- **API endpoints:** routes, examples, and error codes.
- **Tests executed:** commands, pass/fail counts, and skipped tests.
- **Build and regression results:** actual observed outcomes.
- **Files created or modified.**
- **Known limitations and unresolved risks.**
- **Git status and commit hash, if committed.**
- **Phase 04 readiness recommendation.**

Stop after Phase 03 and await review.