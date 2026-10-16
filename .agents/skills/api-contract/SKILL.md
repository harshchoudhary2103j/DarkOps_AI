---
name: api-contract
description: >-
  Use this skill when designing, updating, or validating API contracts, schemas,
  and error responses across DarkOps AI services. Enforces consistent REST conventions,
  schema validation, structured errors, and idempotency.
---

# API Contract Skill

Use this guideline to ensure standardized, resilient API contracts across all DarkOps AI services.

## Contract Standards

### 1. Versioning & Route Structure
- Prefix all operational endpoints with `/api/v1/`.
- Use plural nouns for resources: `/api/v1/stores`, `/api/v1/inventory`, `/api/v1/orders`.
- Use verb actions only for RPC-style execution: `/api/v1/orders/{id}/allocate`, `/api/v1/simulation/runs/{id}/start`.

### 2. Request & Response Schemas
- Every request payload must be strictly validated before touching domain handlers.
  - TypeScript: Zod schemas.
  - Python: Pydantic v2 schemas.
- Reject extra/unknown fields where appropriate to avoid unexpected behavior.

### 3. Standard Headers
- `X-Correlation-Id`: Client- or gateway-generated request tracing UUID.
- `Idempotency-Key`: Mandatory on mutating POST/PUT commands (e.g., creating orders, reserving stock).

### 4. Structured Error Response Envelope
All error responses must follow a consistent JSON structure:

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Store store-101 has insufficient available stock for SKU-banana.",
    "details": {
      "storeId": "store-101",
      "sku": "SKU-banana",
      "requested": 5,
      "available": 2
    },
    "correlationId": "req-98fbc182-45e2"
  }
}
```

### 5. Contract Testing
- Implement automated schema validation tests to ensure serialization and deserialization match between TypeScript and Python services.
