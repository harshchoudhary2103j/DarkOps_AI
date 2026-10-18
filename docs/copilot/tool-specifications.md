# DarkOps AI Operations Copilot — Tool Specifications & Security Architecture

This document defines the formal tool contracts, schema definitions, permission gating, and verification protocols for the AI Operations Copilot, implementing the standards established in [ADR-009](../adr/ADR-009-ai-copilot-tools-authorization-approval.md).

---

## 1. Architectural Boundaries & Security Invariants

1. **Copilot Not Source of Truth Invariant**: The LLM is an orchestrator, synthesizer, and explainer. Authoritative inventory balances, order lifecycle states, and financial calculations strictly reside in PostgreSQL managed by the `operational-api`.
2. **No Direct Database/Shell Access**: The Copilot interacts strictly through typed Zod and JSON Schema tool definitions. Arbitrary SQL execution, CLI shell runners, and unvalidated network calls are strictly prohibited.
3. **Two-Stage Human-in-the-Loop Approval Gate**:
   - **Read-Only Tools** execute immediately and return authoritative data.
   - **Mutating Tools** never execute directly from LLM output. The Copilot must prepare an immutable `CopilotActionProposal` with `status: 'PENDING_APPROVAL'`. The application UI renders an action card requiring an authorized operator click before any state mutation occurs.
4. **Post-Execution State Verification**: Prior to reporting success to the user, the Copilot must re-query the application database to verify that the state transition completed successfully.
5. **Immutable Audit Trail**: Every tool call and operator decision is recorded in the PostgreSQL `copilot_audit_events` table with timestamp, user ID, correlation ID, tool name, parameters, and outcome.

---

## 2. OpenAI Configuration & Fallback Engine

The backend Copilot service (`services/operational-api/src/copilot/copilot.service.ts`) uses the official `openai` SDK with function tool calling:

- **Environment Configuration**:
  ```env
  OPENAI_API_KEY="sk-..."       # Your OpenAI API key
  OPENAI_MODEL="gpt-4o-mini"    # Model identifier (defaults to gpt-4o-mini)
  ```
- **Deterministic Fallback Engine**: If `OPENAI_API_KEY` is omitted, empty, or unreachable (e.g. offline testing environments), the service automatically falls back to a deterministic intent router that executes the exact same typed domain tools against PostgreSQL.

---

## 3. Tool Specifications

### 3.1 Read-Only Tools (Auto-Executed)

#### `queryStoreInventory`
- **Purpose**: Retrieve authoritative stock positions, physical on-hand, reserved units, and available stock.
- **Parameters**:
  - `store_id` (string, optional): Dark store identifier.
  - `sku_id` (string, optional): Specific SKU code to inspect.
  - `low_stock_only` (boolean, optional): Filter only items below safety buffer.
- **Return Type**:
  ```json
  {
    "store_id": "store-manhattan-demo-01",
    "store_name": "DarkStore Manhattan Urban Network #01",
    "total_positions": 24,
    "positions": [
      {
        "sku_id": "sku-manhattan-demo-006",
        "physical_on_hand": 100,
        "reserved_stock": 15,
        "available_stock": 85,
        "status": "HEALTHY"
      }
    ]
  }
  ```

#### `listStockoutRisks`
- **Purpose**: Identify SKUs projected to breach safety stock within a given horizon.
- **Parameters**:
  - `store_id` (string, optional): Target dark store.
  - `horizon_hours` (integer, optional, default: 12, min: 1, max: 72): Forecast horizon.
- **Return Type**: Array of at-risk SKUs with hourly burn rate and projected hours to stockout.

#### `explainReplenishmentRecommendation`
- **Purpose**: Retrieve mathematical inputs, supplier MOQs, lead times, and policy rationale for a replenishment recommendation.
- **Parameters**:
  - `recommendation_id` (string, required): UUID of the recommendation record.
- **Return Type**: Formula inputs (`reorder_point`, `target_stock_level`, `supplier_moq`, `lead_time_hours`) and human explanation.

#### `explainOrderAllocation`
- **Purpose**: Explain dark store assignment and routing trade-offs for a customer order.
- **Parameters**:
  - `order_id` (string, required): Order identifier (e.g. `#ord-morning-rush-01`).
- **Return Type**: Delivery coordinates, line items, assigned store name, and allocation rationale.

#### `querySurgeTelemetry`
- **Purpose**: Inspect real-time surge order arrival rate, picking queue bottlenecks, and store congestion.
- **Parameters**:
  - `store_id` (string, optional): Optional store filter.
- **Return Type**: Surge order counts (pending, allocated, picking, completed) and network congestion status.

#### `queryPickingBacklog`
- **Purpose**: Retrieve active picking tasks and SLA status across stores.
- **Parameters**:
  - `store_id` (string, optional): Target store.
  - `status` (string, optional): Filter by `PENDING_PICK`, `PICKING`, `PICKED`, or `FAILED`.

---

### 3.2 Mutating Tools (Two-Stage Approval Gated)

#### `emergencySurgeRestock`
- **Purpose**: Propose immediate physical inventory restock to avert stockouts during live surge conditions.
- **Parameters**:
  - `store_id` (string, required): Destination dark store.
  - `sku_id` (string, required): Target SKU.
  - `quantity` (integer, required, min: 1): Units to receive.
  - `reason` (string, optional): Operational justification.
- **Workflow**:
  1. Generates `CopilotActionProposal` with `status: 'PENDING_APPROVAL'`.
  2. Renders `CopilotActionCard` in Dashboard UI.
  3. Upon operator click on `Confirm & Execute`: executes transactional receipt via `inventoryService.receiveStock()`, verifies new stock in PostgreSQL, updates proposal status to `EXECUTED`, and records audit entry.

#### `approveReplenishmentRecommendation`
- **Purpose**: Propose operator approval for an automated purchase order recommendation.
- **Parameters**:
  - `recommendation_id` (string, required): UUID of the pending recommendation.
  - `reason` (string, optional): Operator justification.
- **Workflow**:
  1. Validates recommendation is in `PENDING` state.
  2. Generates `CopilotActionProposal` with `status: 'PENDING_APPROVAL'`.
  3. Upon operator approval: executes `replenishmentService.approve()`, verifies status `APPROVED` in PostgreSQL, and records audit entry.

#### `reallocateOrder`
- **Purpose**: Propose transferring a customer order from a congested dark store to an alternative store.
- **Parameters**:
  - `order_id` (string, required): Target order ID.
  - `target_store_id` (string, required): Destination store ID.
  - `reason` (string, optional): Operational justification.

---

## 4. REST API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/copilot/chat` | Send chat prompt with store context and message history |
| `GET` | `/api/v1/copilot/proposals` | List recent action proposals |
| `GET` | `/api/v1/copilot/proposals/:id` | Retrieve specific proposal by ID |
| `POST` | `/api/v1/copilot/proposals/:id/decision` | Approve or Reject an action proposal (`{ decision: "APPROVE" \| "REJECT" }`) |
| `GET` | `/api/v1/copilot/audit-logs` | Retrieve immutable audit event history |
| `GET` | `/api/v1/copilot/tools` | Retrieve registered OpenAI tool specifications |

---

## 5. Verification Test Matrix

- **Unit Tests**: `services/operational-api/tests/unit/copilot.test.ts` (9 tests passing).
- **Contract Tests**: `services/operational-api/tests/contract/copilot-api.test.ts` (6 tests passing).
- **Frontend Component Tests**: `apps/dashboard/src/test/copilot.test.tsx` (5 tests passing).
- **Full Backend Suite**: 14 test files, 107 / 107 tests passing.
- **Full Frontend Suite**: 6 test files, 44 / 44 tests passing.
