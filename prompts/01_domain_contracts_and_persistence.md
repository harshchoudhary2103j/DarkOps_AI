# Phase 01 — Domain Contracts and Persistence

## Objective
Define the foundational domain models, validation contracts, database migrations, and repository adapters for the core catalog (Stores, Service Zones, Products, SKUs, Suppliers, and Warehouse Layouts) within the Operational API.

## Scope
- Implement domain entities and value objects:
  - `Store`: Store ID, name, status, location (lat/lon), service polygon.
  - `Product` & `SKU`: SKU code, name, category, pack size, shelf life days, storage temperature, unit price.
  - `Supplier`: Supplier ID, name, lead time hours, minimum order quantity, review schedule.
  - `WarehouseLayout`: Store layout graph, aisles, shelf locations (X, Y, Z coordinates), pick zones.
- Implement database migration tooling and initial SQL migrations for PostgreSQL.
- Implement database repositories with connection pooling.
- Expose read and administrative REST endpoints (`/api/v1/stores`, `/api/v1/products`, `/api/v1/warehouse-layouts`) with strict schema validation.

## Dependencies
- Phase 00: Repository Bootstrap (TypeScript build pipeline, PostgreSQL container).

## Business & Engineering Invariants
- Catalog owns structural entities only; it does not own live inventory balances, reservations, or order lifecycle states.
- Shelf locations must belong to a valid warehouse layout and possess unique aisle/shelf identifiers.
- All inbound API payloads must be validated using Zod schemas at controller entry points.
- Entity mutations must maintain referential integrity and emit audit events.

## Acceptance Criteria
1. Database migrations run cleanly from scratch on an empty database.
2. Repositories support CRUD operations with type-safe parameters and query isolation.
3. REST endpoints return standardized JSON envelopes and structured error messages on validation failure.
4. Warehouse layout graphs validate connectivity between shelf nodes and picker dispatch stations.

## Required Tests
- Unit tests: domain entity validation, SKU pack size constraints, layout graph node connectivity.
- Integration tests: database migrations, foreign key constraints, repository query tests against PostgreSQL.
- Contract tests: schema validation for `/api/v1/stores` and `/api/v1/products`.

## Documentation Updates
- Document database schema diagrams in `docs/architecture/catalog-schema.md`.
- Document OpenAPI contract specifications for catalog endpoints.

## Completion Report Format
```markdown
### Phase 01 Completion Report
- **Entities & Tables Created**: [stores, products, skus, warehouse_layouts, etc.]
- **Migrations Verified**: [migration command and execution output]
- **Tests Executed**: [unit and integration test pass results]
- **API Endpoints Exposed**: [route list and sample responses]
- **Next Steps**: [Phase 02 readiness]
```
