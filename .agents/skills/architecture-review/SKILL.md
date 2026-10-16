---
name: architecture-review
description: >-
  Use this skill when reviewing code changes, pull requests, or design proposals
  for DarkOps AI. Checks boundary violations, bypassed invariants, anti-patterns,
  unnecessary dependencies, and adherence to ADRs.
---

# Architecture Review Skill

Use this review procedure before finalizing any implementation task or creating a pull request.

## Review Checklist

### 1. Boundary & Module Ownership
- [ ] Does this change respect service boundaries defined in [AGENTS.md](file:///AGENTS.md)?
- [ ] Does any service bypass the Operational API to write directly to database tables owned by another module?
- [ ] Are simulation models completely isolated from operational domain models?

### 2. Business Invariants & Integrity
- [ ] Are all inventory updates concurrency-safe and transactional?
- [ ] Are all state transitions validated against domain state machines?
- [ ] Are there any hardcoded KPIs, fake metrics, or artificial optimization savings? (Zero tolerance!)
- [ ] Does any error path return HTTP 200 with fake success data?

### 3. Simplicity & Code Quality
- [ ] Is this the simplest correct solution, or does it introduce premature abstractions, unnecessary interfaces, or speculative features?
- [ ] Are files focused and appropriately sized (< 300 lines)?
- [ ] Are naming conventions explicit and free of cryptic abbreviations?
- [ ] Are domain entities decoupled from framework and database dependencies?

### 4. Documentation & ADRs
- [ ] Are public API contract changes documented in OpenAPI or schema definitions?
- [ ] Was an ADR created in [docs/adr/](file:///docs/adr/) if an architectural decision was introduced?
