# ADR-002: Inventory Ownership, Reservations, and Concurrency

- **Status**: Accepted
- **Date**: 2026-10-16
- **Context**: Quick-commerce dark stores operate with narrow inventory margins and rapid order fulfillment. Concurrent orders competing for scarce inventory must not result in overselling, double allocation, or phantom reservations.

## Decision
1. **Single Ownership**: The `operational-api` Inventory module is the exclusive authority over inventory balances. Other services (Order Management, Simulation Worker, Optimization) must never write directly to inventory tables.
2. **Formula Invariant**: `available_stock = physical_on_hand - reserved_stock`. Available stock must never drop below zero.
3. **Concurrency Control**: Stock reservations execute inside explicit PostgreSQL transactions using row-level locking (`SELECT ... FOR UPDATE`) or optimistic version concurrency (`UPDATE ... WHERE version = :expected`).
4. **Idempotency**: All reservation and release endpoints mandate an `Idempotency-Key` header to prevent double-reserving during retries.
5. **Ledger Integrity**: Stock movements are recorded as append-only immutable ledger events (receipt, adjustment, reservation, release, consumption).

## Alternatives Considered
- *In-memory reservation locks (Redis)*: Adds distributed state, dual-write failures between Redis and PostgreSQL, and cache invalidation bugs.
- *Eventual consistency / post-hoc reconciliation*: Unacceptable for dark-store quick-commerce where overselling forces order cancellations and breaches SLAs.

## Consequences
- **Positive**: Complete prevention of overselling; verifiable audit trail; safe concurrency under heavy parallel order spikes.
- **Negative**: Database lock contention during high concurrency on hot SKUs, requiring small transaction scopes and minimal lock hold times.
