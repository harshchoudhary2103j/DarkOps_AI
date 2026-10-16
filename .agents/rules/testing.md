---
trigger: model_decision
description: "Testing methodology, verification requirements, concurrency testing, and deterministic simulation reproducibility."
---

# DarkOps AI Testing Rules

## 1. Verification Hierarchy
- **Unit Tests**:
  - Test business logic, inventory arithmetic, state machines, and routing graph logic in complete isolation without external dependencies.
  - Fast execution (< 5 seconds for full unit suite).
- **Integration Tests**:
  - Verify database repositories, migration integrity, and foreign key constraints against PostgreSQL.
  - Test transactional rollback and isolation levels under real database transactions.
- **Contract Tests**:
  - Verify API request/response schemas between Operational API, Optimization Service, and Frontend.
- **Simulation Reproducibility Tests**:
  - Validate that simulation runs with identical random seeds and scenarios yield bit-for-bit identical event streams and KPI metrics.

## 2. Concurrency & Race Condition Verification
- Any module handling inventory reservation or order allocation must include automated concurrency tests (e.g., executing multiple simultaneous allocation requests for the final unit of stock).
- Verify that overselling is prevented and conflicting requests return deterministic conflict errors.

## 3. Honest Verification Invariant
- Never mark a task complete without running the relevant test suite and inspecting the exit code and output.
- Never mock away the core behavior being validated.
- Report exact commands executed and actual stdout/stderr in completion reports.
