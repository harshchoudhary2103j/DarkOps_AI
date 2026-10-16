---
trigger: model_decision
description: "Backend development standards for Node.js/TypeScript and Python/FastAPI services, transaction handling, and API invariants."
---

# DarkOps AI Backend Rules

## 1. Domain-Driven & Clean Architecture
- Organize backend code into domain, application (use cases), ports, and adapters.
- Keep domain entities and business rules free from dependencies on Express, FastAPI, PostgreSQL drivers, or ORMs.
- HTTP controllers and CLI runners are thin adapters responsible only for input parsing, authentication, invoking the use case, and formatting responses.

## 2. Input Validation & Strict Typing
- Every inbound request must be validated at the boundary:
  - TypeScript services: use strict schemas (e.g., Zod).
  - Python services: use Pydantic v2 models.
- Reject invalid payloads immediately with HTTP 400 and structured validation details. Never pass untyped `any` or `dict` into domain use cases.

## 3. Concurrency & Inventory Invariants
- Inventory reservation must be concurrency-safe. Use row-level locking (`SELECT ... FOR UPDATE`) or optimistic concurrency versioning within an explicit database transaction.
- Available stock = Physical usable on-hand - Reserved. Available stock must never drop below zero.
- Re-validate stock positions immediately prior to committing any reservation or replenishment action.

## 4. Idempotency & Error Handling
- All mutating commands (e.g., order creation, stock allocation, replenishment approval) must support idempotency keys to ensure safe retries.
- Failures must return explicit, typed business error codes (e.g., `INSUFFICIENT_STOCK`, `STORE_NOT_ELIGIBLE`, `OPTIMIZATION_INFEASIBLE`).
- Never return HTTP 200 with fake or partially simulated success data when an invariant has failed.
