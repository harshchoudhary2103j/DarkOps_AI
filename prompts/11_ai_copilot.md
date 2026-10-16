# Phase 11 — AI Copilot

## Objective
Implement the AI Operations Copilot with typed tool calling, strict authorization boundaries, an approval-gated mutation workflow, and an immutable audit trail, integrating natural language decision support into DarkOps AI.

## Scope
- Implement the Copilot Service & Tool Registry:
  - Strongly typed JSON Schema / Zod tool definitions:
    - **Read-Only Tools** (automatic execution):
      - `queryStoreInventory(storeId, sku)`: Retrieve authoritative stock levels and reservation details.
      - `listStockoutRisks(storeId, horizonHours)`: Retrieve SKUs projected to run out based on forecast.
      - `explainReplenishmentRecommendation(recommendationId)`: Retrieve inputs, lead times, safety stocks, and policy rationale for a specific replenishment order.
      - `compareSimulationRuns(runIdA, runIdB)`: Retrieve delta metrics between baseline and optimized runs.
    - **Mutating Tools** (approval-gated execution):
      - `requestSimulationRun(scenarioConfig)`: Submit a new discrete-event simulation run.
      - `approveReplenishmentRecommendation(recommendationId)`: Prepare an approval transaction for operator review.
- Implement the Two-Stage Approval Gate:
  1. Copilot prepares an action proposal containing the exact tool call, target parameters, and projected operational impact.
  2. UI presents a confirmation modal to the authorized operator.
  3. Upon operator approval, the application executes the use case through the standard Operational API and records the audit log.
- Implement conversational chat UI in `apps/dashboard` with streaming responses, formatted tool cards, and action confirmation modals.

## Dependencies
- Phase 01: Catalog Endpoints.
- Phase 02: Inventory Endpoints.
- Phase 07: Evaluation Endpoints.
- Phase 09: Operations Dashboard.

## Business & Engineering Invariants
- Copilot Not Source of Truth Invariant: The LLM is an orchestrator and explainer; it is never the authoritative source of inventory, pricing, or order state.
- No Direct Database/Shell Access: The copilot must never execute arbitrary SQL, shell scripts, or raw HTTP endpoints. It may only call registered, typed domain tools.
- Strict Approval Invariant: No mutating action may be committed solely by the LLM without human operator confirmation.
- Verification Before Reporting: The copilot must re-query the application state to verify that a state mutation succeeded before reporting success to the user.

## Acceptance Criteria
1. Copilot accurately answers operational queries (e.g., "Which store has the lowest stock of milk?") by calling typed tools and quoting backend numbers.
2. When asked to approve a replenishment recommendation, copilot generates a structured approval proposal with a visual confirmation card rather than executing immediately.
3. Unauthorized tool calls are blocked and logged.
4. Every executed tool call is recorded in the PostgreSQL audit log with user ID, correlation ID, tool name, parameters, and outcome.

## Required Tests
- Tool schema validation unit tests: ensuring tool parameters reject invalid inputs before reaching domain services.
- Permission and approval tests: verifying that mutating tools cannot execute without explicit authorization tokens.
- Integration tests: End-to-end chat flow mocking LLM responses and asserting tool execution against the Operational API.

## Documentation Updates
- Create `docs/copilot/tool-specifications.md` documenting all copilot tool schemas, input parameters, and security policies.

## Completion Report Format
```markdown
### Phase 11 Completion Report
- **Copilot Tools Registered**: [read-only and mutating tool list]
- **Approval Workflow Verified**: [two-stage confirmation test logs]
- **Audit Logging**: [verified audit entries for tool calls]
- **Next Steps**: [Phase 12 readiness]
```
