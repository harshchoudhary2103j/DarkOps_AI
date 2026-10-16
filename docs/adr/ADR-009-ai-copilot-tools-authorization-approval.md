# ADR-009: AI Tool Authorization and Approval Workflow

- **Status**: Accepted
- **Date**: 2026-10-16
- **Context**: An AI Operations Copilot helps dark-store operators query store state and run simulations. If given unconstrained mutation access, an LLM could corrupt inventory balances or trigger unauthorized purchase orders due to hallucinations or prompt injection.

## Decision
1. **Strict Tool Calling with Typed Schemas**: The Copilot interacts with the backend strictly through typed tool schemas (Zod/JSON Schema). No arbitrary SQL, CLI, or unchecked HTTP endpoints are exposed.
2. **Read vs. Mutate Permission Segregation**:
   - *Read-Only Tools* (`queryStoreInventory`, `checkStockoutRisks`, `explainRecommendation`): Authorized users execute immediately.
   - *Mutating Tools* (`approveReplenishment`, `triggerSimulation`, `reallocateOrder`): Strictly gated behind a Two-Stage Approval Workflow.
3. **Two-Stage Approval Workflow**:
   - Stage 1: The Copilot generates a structured action proposal containing tool name, exact parameters, entity IDs, and projected impact.
   - Stage 2: The UI renders a dedicated confirmation card requiring an authenticated human operator click to approve.
4. **Post-Execution Verification**: The Copilot must re-query the application state to verify success before reporting that an action was executed.
5. **Audit Trail**: Every tool call and user confirmation is logged in PostgreSQL with timestamp, user ID, correlation ID, tool name, parameters, and outcome.

## Alternatives Considered
- *Direct autonomous LLM action execution*: High risk of hallucinations mutating physical stock or placing invalid supplier orders.
- *Natural language query over database directly (Text-to-SQL)*: High security and consistency risk; easily bypassed invariants and lack of business validation.

## Consequences
- **Positive**: Complete operator control; zero hallucinated inventory mutations; full regulatory and audit compliance.
- **Negative**: Adds a human confirmation step in the UI for state-changing operations.
