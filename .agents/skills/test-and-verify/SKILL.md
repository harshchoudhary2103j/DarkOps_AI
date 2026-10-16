---
name: test-and-verify
description: >-
  Use this skill when running, writing, or validating test suites across DarkOps AI
  services. Enforces testing standards, concurrency verification, simulation seed
  reproducibility checks, and honest reporting.
---

# Test and Verify Skill

Use this runbook to execute and validate tests across TypeScript and Python services.

## Test Categories

1. **Unit Tests**:
   - TypeScript: Run via test runner (e.g., `npm test` or `npm run test:unit`).
   - Python: Run via `pytest tests/unit`.
   - Invariant: Zero network, zero database connections, execution completes in seconds.
2. **Integration Tests**:
   - Test repository queries, transaction commits, rollbacks, and schema migrations against PostgreSQL.
   - Run via `npm run test:integration` or `pytest tests/integration`.
3. **Concurrency Race Tests**:
   - Execute parallel workers or promises competing for the same limited inventory units.
   - Assert that overselling is prevented and conflicting operations produce clear conflict errors.
4. **Simulation Reproducibility Tests**:
   - Run simulation scenarios with fixed seeds twice and assert that event sequences and final calculated KPIs are identical.

## Execution Checklist

1. **Format & Lint Check**:
   - TypeScript: `npm run lint` and `npm run type-check`.
   - Python: `flake8` / `ruff check` and `mypy`.
2. **Execute Tests**:
   - Run test commands with full output capture.
   - Never suppress failing exit codes.
3. **Inspect Output**:
   - Check test names, pass/fail counts, execution time, and any unhandled promise rejections or warnings.
4. **Generate Verification Report**:
   - Document the exact command executed, exit code, and summarized test output.
