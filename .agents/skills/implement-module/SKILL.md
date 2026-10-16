---
name: implement-module
description: >-
  Use this skill when implementing a new module, domain capability, use case,
  or vertical slice within DarkOps AI. Guides architectural compliance,
  boundary isolation, interface-first design, and verification.
---

# Implement Module Skill

Follow this standardized workflow when building or extending any module in DarkOps AI.

## Workflow

### 1. Pre-Implementation Review
1. Inspect [AGENTS.md](file:///AGENTS.md) and relevant Architecture Decision Records in [docs/adr/](file:///docs/adr/).
2. Identify module boundaries: determine which service owns the data (`services/operational-api`, `services/optimization-service`, or `services/simulation-worker`).
3. Verify required invariants before writing code (e.g., stock reservation atomicity, simulation state isolation).

### 2. Define Contracts & Ports (Interface-First)
1. Write domain types, command payloads, and repository interfaces first.
2. In TypeScript: define strict Zod schemas and exported TypeScript interfaces.
3. In Python: define Pydantic v2 schemas and abstract base classes / protocols.
4. Keep domain entities pure without dependencies on web frameworks (Express/FastAPI) or database clients (pg/SQLAlchemy).

### 3. Implement Application Use Cases
1. Implement the core business logic within the `application/` or `domain/` directory.
2. Ensure input validation is enforced at the entry point.
3. Implement explicit error handling: return domain error objects or raise typed exceptions. Never return HTTP 200 with fake success state on invariant failure.
4. Include idempotency key checks for mutating operations.

### 4. Implement Adapters (Persistence & Transport)
1. Create concrete repository implementations under `adapters/postgres/` or `adapters/http/`.
2. Wrap state-changing database operations in explicit transaction blocks with row-level locks or concurrency checks where required.
3. Expose thin HTTP controller routes that delegate directly to the application use case.

### 5. Automated Verification
1. Write unit tests covering domain rules, boundary constraints, and edge cases.
2. Write integration tests for database persistence and concurrency races.
3. Run the verification suite and confirm 100% pass rate before completing the task.
