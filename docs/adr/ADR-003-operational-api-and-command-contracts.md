# ADR-003: Operational API and Internal Command Contracts

- **Status**: Accepted
- **Date**: 2026-10-16
- **Context**: We need standardized inter-service communication and client API conventions between the dashboard, operational backend, optimization engine, and simulation workers.

## Decision
1. **REST & JSON**: Use synchronous HTTP/REST with JSON payloads for bounded operational commands, catalog retrieval, and optimization requests.
2. **Versioning & Routes**: All endpoints prefixed with `/api/v1/`. Resource nouns for collections; explicit verbs only for RPC-like operations (e.g., `/orders/{id}/allocate`).
3. **Boundary Validation**:
   - TypeScript services use Zod schemas for request validation.
   - Python services use Pydantic v2 models.
4. **Error Envelope**: Standardized JSON error response format containing error `code`, human-readable `message`, structured `details`, and `correlationId`.
5. **Correlation Tracking**: Mandate `X-Correlation-Id` across all requests for end-to-end tracing.

## Alternatives Considered
- *gRPC / Protobuf*: Higher performance, but significantly adds build complexity and reduces developer ergonomics for web clients and quick debugging.
- *GraphQL*: Overkill for domain-driven command APIs with fixed operational view contracts.

## Consequences
- **Positive**: Simple debugging with cURL, Postman, or browser tools; strong type-safety via schema libraries; consistent client error handling.
- **Negative**: JSON serialization overhead is slightly higher than binary protocols, but negligible for dark-store operational throughput.
