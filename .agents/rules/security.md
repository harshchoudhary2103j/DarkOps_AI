---
trigger: model_decision
description: "Security standards, secret management, authorization boundaries, AI tool-call gating, and audit trail requirements."
---

# DarkOps AI Security Rules

## 1. Secrets & Credentials Management
- Never commit private keys, API secrets, database passwords, or JWT secrets to version control.
- All secrets must be injected via environment variables. Keep `.env.example` updated with dummy variable definitions and clear configuration instructions.
- Ensure all `.env` files, `.pem` files, and credentials are listed in `.gitignore`.

## 2. Authentication & Authorization Gates
- Operational API endpoints modifying catalog, inventory, or orders must require valid operator authentication and role-based permissions.
- AI Copilot actions are subject to strict permission checks:
  - Read-only queries (e.g., querying inventory levels) can execute immediately for authenticated users.
  - State-changing actions (e.g., approving replenishment orders, forcing store reallocations) require explicit approval and secondary confirmation.

## 3. Tool Calling Security for AI Agents
- AI Copilot tool calling must use strictly typed schemas (JSON Schema / Zod).
- The AI Copilot must never have access to arbitrary SQL execution, bash/shell runners, or unvalidated HTTP proxies.
- Every tool invocation must be audited with user ID, correlation ID, tool name, parameters, and execution outcome.

## 4. Audit Logging & Non-Repudiation
- Critical state transitions (stock adjustments, reservations, order cancellations, replenishment approvals) must be recorded in an immutable audit table.
- Do not log sensitive personal data, authorization tokens, or payment details in audit logs or console outputs.
