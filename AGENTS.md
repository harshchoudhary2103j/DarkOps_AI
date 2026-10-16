# AGENTS.md — DarkOps AI Agentic Development Guide

This guide establishes the mandatory engineering standards, architectural boundaries, coding practices, and verification rules for all AI agents and engineers operating in the DarkOps AI repository.

---

## 1. Project Architecture & Module Ownership

DarkOps AI is a decision-support, simulation, and optimization platform for quick-commerce dark stores. It is structured into clearly separated deployable units with distinct bounded contexts:

1. **Operational API (`services/operational-api`)**: Node.js + TypeScript + Express.
   - **Ownership**: Stores, catalog, SKUs, inventory positions, stock movements, order lifecycle, allocations, picking tasks, audit log persistence.
   - **Boundary Invariant**: All business mutations (stock reservations, status transitions) must pass through domain validation and transactional invariants. External services never write directly to operational tables.
2. **Optimization Service (`services/optimization-service`)**: Python + FastAPI + OR-Tools.
   - **Ownership**: Replenishment optimization, multi-store order allocation, picker graph routing.
   - **Boundary Invariant**: Pure, stateless decision service. Receives problem payloads, validates constraints, computes solutions, returns explicit feasibility status and explanations. Does not persist state or manage transactions.
3. **Simulation Worker (`services/simulation-worker`)**: Python.
   - **Ownership**: Synthetic world seeding, time-varying demand generation, discrete-event simulation (DES) scheduling, scenario KPI evaluation.
   - **Boundary Invariant**: Runs are strictly isolated (`run_id`). Simulation clock is virtual. Simulation events invoke operational APIs or run-isolated adapters; they never bypass business invariants or write fake operational metrics directly to reporting tables.
4. **Operations Dashboard (`apps/dashboard`)**: React + TypeScript + Tailwind CSS.
   - **Ownership**: Operations UI, warehouse 2D graph viewer, store geographic overview, Simulation Lab, Copilot chat interface.
   - **Boundary Invariant**: Pure presentation. Renders backend-verified data; never synthesizes operational state or calculates authoritative metrics on the client.
5. **AI Operations Copilot**:
   - **Ownership**: Natural language interface invoking typed, authorized application tools.
   - **Boundary Invariant**: Never the source of truth for inventory or financials. Read-only queries execute directly; mutating actions require explicit operator review and confirmation.

---

## 2. Clean, Simple, Readable Coding Standards

Agents must write production-grade, readable, maintainable code following these rules:

- **Simplest Correct Solution**: Prefer the most straightforward implementation that satisfies requirements and preserves invariants. Resist speculative features, premature generalizations, and needless layers.
- **Readable & Direct**: Avoid cryptic abbreviations, deep inheritance hierarchies, and clever one-liners. Code should read clearly from top to bottom.
- **Module Boundaries**: Respect single responsibility. Keep HTTP controllers thin, domain models pure, repositories focused on persistence, and external adapters decoupled.
- **Explicit Error Handling**: Return typed, structured domain errors. Fail fast on invalid inputs. Never swallow exceptions or log empty catch blocks.
- **No Massive Files or Fragmentation**: Target files under 300 lines. Avoid 1-line pass-through wrappers that only forward calls without adding value.

---

## 3. Pragmatic SOLID Principles

- **Single Responsibility (SRP)**: Each class/module must have one reason to change. Separate business calculations from transport protocols (HTTP/JSON) and persistence mechanisms.
- **Open/Closed (OCP)**: Enable extensibility (e.g., swapping a baseline policy for an OR-Tools optimizer) through clear interfaces without modifying stable core domain logic.
- **Liskov Substitution (LSP)**: Alternative policy implementations (e.g., greedy baseline vs. MILP optimizer) must satisfy identical interface contracts and return standardized result structures.
- **Interface Segregation (ISP)**: Expose small, cohesive interfaces (e.g., `StockReservationPort`, `RoutePlannerPort`) rather than monolithic "God interfaces".
- **Dependency Inversion (DIP)**: Core domain logic depends on abstractions/ports, not concrete database drivers or third-party web frameworks.

---

## 4. Verification & Testing Standards

Every implementation task must be verified with automated tests before completion:

- **Unit Tests**: Domain rules, inventory arithmetic, reservation math, lifecycle state machines, route graph solvers, and KPI formulas must be 100% unit-tested with zero external dependencies.
- **Integration Tests**: Database repositories, transactional concurrency (e.g., double-reservation race conditions), and service-to-service contracts must be verified against live or containerized Postgres.
- **Deterministic Simulation Tests**: Given an identical random seed and scenario configuration, simulation runs must yield identical event logs and KPI results.
- **Honest Test Execution**: Never mock away the behavior under test. Never report tests as passing unless they have actually run and succeeded in the environment.

---

## 5. Non-Negotiable Invariants & Anti-Patterns

Any code violating the following will be rejected immediately:

1. **No Hardcoded KPIs or Fabricated Metrics**: Never hardcode demo metrics, synthetic improvements, or artificial cost savings. All metrics must be computed from actual recorded simulation events.
2. **No Fake Success Responses**: If stock cannot be reserved or an optimization problem is infeasible, return an explicit error or failure state. Never return HTTP 200 with dummy fulfilled data.
3. **No Bypassed Business Invariants**: Simulated orders, background workers, and AI copilot actions must execute through the same validated domain workflows as normal operations.
4. **No Unsafe Concurrency**: Inventory reservations must use atomic updates, row-level locking (`SELECT FOR UPDATE`), or serializable transactions to prevent overselling.
5. **No Secrets or Insecure Defaults**: Never commit API keys, database credentials, or auth tokens. All secrets must use environment variables with documentation in `.env.example`.

---

## 6. Documentation & Architecture Drift Prevention

- **Keep Documentation Synchronized**: When altering an interface, adding a configuration flag, or introducing a data model, update the corresponding documentation in `docs/` and API OpenAPI specs immediately.
- **Architecture Decision Records (ADRs)**: Any architectural change outside an existing approved task scope requires an ADR in `docs/adr/` before implementation.
- **Preserve Existing Standards**: Adhere strictly to the baseline engineering standards defined in [.agents/rules/darkops-engineering-standards.md](file:///.agents/rules/darkops-engineering-standards.md).
