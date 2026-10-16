# Phase 00 — Repository Bootstrap

## Objective
Establish the baseline monorepo configuration, workspace tooling, shared type definitions, Docker Compose infrastructure, and automated continuous integration pipelines across all four DarkOps AI application packages and the PostgreSQL database.

## Scope
- Establish package structures for:
  - `services/operational-api` (Node.js/Express/TypeScript)
  - `services/optimization-service` (Python/FastAPI)
  - `services/simulation-worker` (Python)
  - `apps/dashboard` (React/TypeScript/Tailwind CSS)
- Configure root and package-level build, lint, format, and typecheck scripts.
- Implement Dockerfiles for each service and a unified `docker-compose.yml` with PostgreSQL 16.
- Set up GitHub Actions CI workflow covering linting, type-checking, and unit test execution across all services.
- Configure `.env.example` and environment configuration validation.

## Dependencies
- Phase 0: Engineering Foundation (Root AGENTS.md, Rules, Skills, ADRs).

## Business & Engineering Invariants
- Services must be independently buildable and testable without circular dependencies.
- No production secrets or live credentials in repository files or container definitions.
- Local containerized environment must run with `docker compose up --build` cleanly.
- All code must adhere to [AGENTS.md](file:///AGENTS.md) and [.agents/rules/darkops-engineering-standards.md](file:///.agents/rules/darkops-engineering-standards.md).

## Acceptance Criteria
1. Root-level workspace commands (e.g., `npm run lint`, `npm run type-check`) execute without errors across frontend and TypeScript backend.
2. Python virtual environments and dependency management (e.g., `requirements.txt` or `pyproject.toml`) configured for optimization and simulation services.
3. `docker-compose.yml` starts PostgreSQL with health checks, and all service containers build successfully.
4. CI workflow passes on master and pull request branches.
5. No business logic or fake data mocks introduced.

## Required Tests
- Build verification: `docker compose build`.
- Linter checks: ESLint/Prettier for TypeScript, Flake8/Ruff/Black for Python.
- Type checks: `tsc --noEmit` in TS packages; `mypy` in Python packages.
- Smoke tests: container startup and port availability checks.

## Documentation Updates
- Update `README.md` with concrete local setup instructions, prerequisite tooling versions, and Docker Compose commands.
- Verify environment variable documentation in `.env.example`.

## Completion Report Format
```markdown
### Phase 00 Completion Report
- **Files Created/Modified**: [list of files]
- **Tooling & Containers Verified**: [docker compose build output, linter/typecheck results]
- **Decisions & Deviations**: [any package manager or config choices]
- **Next Steps**: [Phase 01 invocation readiness]
```
