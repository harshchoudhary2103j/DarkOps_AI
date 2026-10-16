# Phase 04 — Deterministic Synthetic World Seeder

## 1. Objective

Implement a deterministic Synthetic World Seeder in Python within `services/simulation-worker`.

The seeder must generate a realistic, configurable synthetic quick-commerce environment for DarkOps AI, including:

- Virtual dark stores and service areas
- Product catalog and SKU attributes
- Warehouse layouts and navigation graphs
- Initial inventory positions
- Suppliers and initial purchase-order schedules
- Historical sales and demand observations
- A validated export/import pipeline into the existing Operational API

This is a data-generation and initialization phase. It must not implement the simulation engine, forecasting engine, order-generation engine, or optimization policies.

## 2. Mandatory Repository Reconnaissance

Before writing code, inspect the existing repository and identify:

- `AGENTS.md` and applicable `.agents/rules/`
- Relevant `.agents/skills/`
- `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`, and relevant ADRs
- Existing implementation prompts and Phase 01–03 documentation
- Operational API catalog routes, request schemas, and response schemas
- Inventory Core initialization and stock-movement interfaces
- Existing database constraints and foreign-key relationships
- Existing Python package configuration, tests, Docker setup, and API base URL configuration

Use the repository's actual paths if they differ from those listed above.

### Contract-first implementation

Before implementing the seeder, create a concise mapping of each generated entity to its existing domain contract and import endpoint.

Reuse the existing schemas and APIs wherever they exist. Do not create duplicate domain models, modify previous phases' contracts merely to simplify seeding, or invent API endpoints without first establishing that the existing API cannot support the required operation.

If a required operation has no existing supported endpoint, document the exact gap and implement the smallest compatible extension only when necessary. Keep the change backward-compatible and update its tests and OpenAPI specification.

Do not reimplement or re-audit previously completed phases unless a concrete dependency issue is discovered.

## 3. Scope and Module Boundaries

Organize the implementation into small, cohesive modules. Follow existing repository conventions where possible.

Suggested responsibilities:

- `config`: scenario configuration loading and validation
- `models`: typed generation models and internal scenario structures
- `generators/stores`: store locations, service areas, and operating hours
- `generators/catalog`: categories, products, SKU attributes, and pricing
- `generators/layout`: warehouse coordinates, shelves, stations, and navigation graph
- `generators/inventory`: initial physical stock and stock distributions
- `generators/suppliers`: suppliers, lead times, and purchase-order schedules
- `generators/sales_history`: historical sales observations
- `validation`: cross-entity, graph, and domain validation
- `export`: deterministic JSON serialization and API payload adapters
- `importer`: dependency-aware, retry-safe API import
- `cli`: command-line entry point

This is a suggested structure, not a requirement to create every file. Keep the implementation simple and avoid unnecessary interfaces, factories, wrappers, and abstractions.

## 4. Configuration and Scenario Management

Create validated scenario configuration files under:

`services/simulation-worker/scenarios/`

Include at least one practical default scenario and one smaller scenario suitable for fast tests.

Configuration must support:

- Integer random seed
- Number of stores
- Number of SKUs and category distribution
- Number of suppliers
- Warehouse aisle and shelf dimensions
- Number and placement of dispatch/packing stations
- Historical data horizon, configurable between 14 and 30 days
- Initial stock distribution parameters
- Product price ranges and pack sizes
- Perishable and non-perishable shelf-life profiles
- Storage requirements
- Store operating hours and geographic distribution
- Supplier lead-time ranges
- Optional initial purchase-order schedules

Validate all configuration before generation. Reject invalid dimensions, impossible distributions, invalid date ranges, negative counts, and inconsistent settings with actionable error messages.

Do not scatter unexplained constants throughout generator code.

## 5. Deterministic Randomness and Serialization

Determinism is a mandatory correctness property.

Given identical configuration and seed, the generated world must have identical logical contents and identical canonical JSON bytes.

Requirements:

1. Use an explicitly seeded, dedicated random-number generator. Do not depend on global random state.
2. Pass the random generator or a deterministic random-generation context explicitly to components that require randomness.
3. Ensure all generated collections have stable ordering.
4. Use stable generated identifiers derived from scenario identity, seed, and entity identity, or another deterministic scheme.
5. Use fixed precision for generated coordinates and prices.
6. Serialize using a documented canonical JSON convention: stable key ordering, consistent separators, UTF-8 encoding, and consistent numeric representation.
7. Do not include generation timestamps, random UUIDs, machine-specific paths, environment-dependent values, or other nondeterministic metadata in the canonical world payload.
8. If generated-at metadata is useful for logs, keep it outside the deterministic artifact.
9. Do not rely on a Python `hash()` result for persistent artifact hashes. Use SHA-256 over canonical serialized bytes.

Changing the seed must be capable of producing a different world. Identical seeds and configuration must produce identical output.

Document whether deterministic output is guaranteed within the supported Python/runtime version. Do not claim cross-version or cross-platform byte-for-byte reproducibility unless the implementation and tests establish it.

## 6. Store Generation

Generate virtual dark stores with:

- Stable identifiers and valid names
- Geographic coordinates
- Valid service polygon boundaries
- Operating hours
- Any additional attributes required by the existing Catalog contract

Ensure that generated coordinates lie within their intended geographic bounds and that service polygons are valid, non-degenerate, and represented in the format expected by the Operational API.

Avoid requiring a geospatial library unless the repository already uses one or it materially simplifies reliable validation.

If service polygons overlap, document the intended behavior. Do not silently create invalid or ambiguous service areas.

## 7. SKU and Catalog Generation

Generate a configurable product catalog with:

- Stable SKU/product identifiers
- Product names and category assignments
- Category distribution controlled by configuration
- Pack sizes and units
- Prices with fixed precision
- Shelf-life profiles for perishable goods
- Storage requirements
- Any mandatory attributes defined by existing domain schemas

Generated data must conform to the existing Catalog contract and its validation rules.

Use plausible, internally consistent values. Perishable products must have valid shelf-life values; non-perishable products must not receive nonsensical expiration settings.

Do not add unsupported fields to API payloads simply because they are convenient for the generator.

## 8. Warehouse Layout and Navigation Graph

Generate warehouse layouts for each store using stable X, Y, and Z coordinates.

Include:

- Aisles and walkable paths
- Shelves and shelf locations
- Product-to-shelf assignments
- Packing/dispatch station nodes
- Navigation graph nodes and edges
- Any storage-zone information required by the existing domain model

### Graph construction

Construct a connected walkable backbone first, then attach shelf access nodes and stations to it.

The graph must represent physically meaningful traversal, rather than connecting every node to every other node without regard to layout.

Define and document the coordinate system and the meaning of each axis. Ensure shelf locations are valid within the generated warehouse dimensions.

### Graph invariants

For every generated store:

- Every referenced shelf location must exist.
- Every product-to-shelf assignment must reference a valid product and shelf.
- Every navigation edge must reference two existing nodes.
- Edge weights or traversal costs must be valid and nonnegative.
- The packing station must exist and be a valid graph node.
- Every shelf node must be reachable from the packing station.
- The graph must not contain references to missing nodes.

Use a graph traversal algorithm such as BFS or DFS to validate connectivity.

If a layout is invalid, fail generation with a useful diagnostic rather than silently producing an invalid world.

Do not implement picker route optimization in this phase.

## 9. Initial Inventory and Suppliers

Generate initial physical inventory positions for each applicable store/SKU combination using configurable distributions.

Requirements:

- Nonnegative physical stock
- Zero initial reserved stock unless a scenario explicitly requires otherwise
- Available stock consistent with the Inventory Core definition
- Stable identifiers and references
- No duplicate store/SKU positions
- No references to nonexistent stores or SKUs

Reuse the existing Inventory Core initialization interface and standard stock-movement mechanisms.

Do not bypass database constraints or insert inventory snapshots directly through an alternate path merely to avoid API validation.

Where the existing inventory model requires ledger movements to establish initial stock, initialize stock through the supported mechanism and verify that ledger reconciliation succeeds.

### Suppliers and purchase orders

Generate suppliers with stable identifiers, valid lead times, and compatible product/store relationships where required.

Generate optional initial purchase-order schedules with deterministic order dates, expected delivery dates, supplier references, and line items.

These schedules represent planned supply, not completed receipts. Do not increase physical inventory merely because a purchase order has been scheduled.

If purchase-order functionality is not yet supported by the existing domain contracts, generate a validated scenario-level schedule and document the limitation rather than inventing operational endpoints or database records.

## 10. Historical Sales and Demand Observations

Generate 14–30 days of deterministic historical sales observations.

Each record should contain the fields required by the project's agreed history model, such as:

- Store and SKU identifiers
- Business date or timestamp
- Units sold
- Optional price or other supported demand attributes

Use reproducible, configurable distributions. Demand may vary by category, SKU, weekday, and other explicitly configured factors.

Requirements:

- All store/SKU references must be valid.
- Quantities and dates must be valid.
- Records must have stable ordering.
- The historical date range must be configurable.
- Zero-demand observations must be handled consistently.
- The generator must not create operational KPIs or pretend historical observations came from a real retailer.
- Generated history must be clearly labeled synthetic.

Keep historical sales separate from actual inventory movements unless the existing domain model explicitly defines a supported relationship. Do not automatically subtract historical sales from the initial stock snapshot unless the scenario's time semantics explicitly require that behavior.

Document the relationship between the end of the historical period and the initial simulation state.

The output of this phase is demand history, not a forecasting model.

## 11. Cross-Entity Validation

Before exporting or importing the world, validate the entire generated dataset.

At minimum, check:

- Unique entity identifiers
- Valid store, product, supplier, shelf, and station references
- Valid service polygons and store attributes
- Valid catalog fields and types
- Valid shelf coordinates and product assignments
- Valid graph connectivity
- Valid stock quantities
- Valid purchase-order references and schedules
- Valid historical dates and quantities
- Consistency with existing Pydantic and Zod schemas where applicable

Fail fast with actionable validation errors. Do not continue to API import after validation failure.

Prefer reusing the repository's existing models and validators rather than maintaining separate copies of the same rules.

## 12. Export Adapter and Operational API Import

Implement a deterministic export adapter that transforms the generated world into the existing Operational API request schemas.

Provide a CLI that supports the following conceptual operations:

- Generate a world from a scenario file and seed.
- Validate a previously generated world artifact.
- Export the world as canonical JSON.
- Import a generated world through the Operational API.
- Produce a concise import summary.

Use CLI flags and conventions consistent with the repository.

The importer must:

1. Import parent entities before dependent entities.
2. Use existing catalog and inventory endpoints.
3. Respect API validation and authorization.
4. Use stable identifiers where supported.
5. Handle HTTP errors and timeouts with actionable messages.
6. Avoid logging credentials or secrets.
7. Make retries safe using existing idempotency support where available.
8. Detect and report partial imports.
9. Avoid silently overwriting unrelated existing records.
10. Support a validation/dry-run mode that performs no writes.

If an import fails partway through, report which entities succeeded and which failed. Make reruns safe without requiring manual database cleanup.

Do not write directly to operational tables. Do not bypass the Operational API's foreign-key, validation, or business-rule enforcement.

Keep the generated artifact separate from the import result so an API response or runtime-generated identifier cannot contaminate the deterministic generator output.

## 13. Required Tests

Add tests using the existing Python testing conventions and dependencies.

### A. Determinism tests

- Generate a world twice with seed `42` and the same configuration.
- Assert identical canonical JSON bytes and identical SHA-256 hashes.
- Compare store coordinates, SKU counts and assignments, warehouse layouts, inventory positions, supplier schedules, and historical sales.
- Verify that changing the seed changes at least part of the generated world.
- Verify that running the generator does not depend on previous global random state.

### B. Graph validation tests

- Verify the graph is connected where the scenario requires a single connected warehouse.
- Verify the packing station can reach every shelf node.
- Verify all edge endpoints exist.
- Verify all shelf coordinates are valid.
- Test that deliberately malformed or disconnected graphs are rejected.

### C. Schema conformity tests

- Validate generated payloads using the existing Pydantic models.
- Validate API payloads against the actual Operational API contracts.
- Validate against the existing Zod schemas through the repository's established TypeScript test mechanism, or use a contract/integration test that exercises the actual API validators.
- Do not copy schemas into the Python service and call that sufficient proof of compatibility.

### D. Referential integrity tests

- Verify every generated reference resolves.
- Verify every product-to-shelf assignment resolves.
- Verify stock positions refer to valid stores and SKUs.
- Verify supplier schedules and historical sales reference valid entities.
- Verify no duplicate identifiers or duplicate store/SKU positions exist.

### E. API integration tests

Using the existing Operational API and database:

- Import a small generated scenario.
- Verify the import succeeds through standard endpoints.
- Verify imported entities can be retrieved through the API.
- Verify inventory initialization follows existing business rules.
- Verify ledger reconciliation passes where applicable.
- Retry the import and verify no duplicate records or stock movements are created.
- Test a validation failure and a partial API failure.
- Verify dry-run mode does not mutate operational state.

Integration tests must exercise the actual application workflow. Do not replace them with mocked success responses.

Use the existing test framework and add only necessary dependencies.

## 14. Documentation

Create:

`docs/simulation/world-generator.md`

Document:

- Purpose and scope
- Module organization
- Scenario configuration format
- Available scenario templates
- Distribution parameters and defaults
- Seed controls and determinism guarantees
- Warehouse coordinate conventions
- Graph invariants
- Historical sales generation and time semantics
- Inventory initialization behavior
- CLI usage with practical examples
- Export and API import workflow
- Validation and troubleshooting
- Known limitations and deferred features

Add example scenario configuration files under:

`services/simulation-worker/scenarios/`

Include a small scenario for fast development/testing and a more representative scenario for local demonstrations.

Update other documentation only where needed to keep architecture, implementation plans, API contracts, and phase status accurate.

## 15. Engineering Constraints

- Follow `AGENTS.md`, workspace rules, and applicable skills.
- Follow the existing architecture and module ownership boundaries.
- Keep the implementation simple, readable, and testable.
- Use explicit types and validated configuration.
- Avoid unnecessary dependencies and abstractions.
- Keep generation logic independent of network/API calls.
- Keep export and import logic separate from generation.
- Do not hardcode performance metrics or fake API success.
- Do not introduce a new database schema or bypass existing operational interfaces without documented justification.
- Do not modify previously completed phases except for necessary, backward-compatible integration fixes.
- Do not start Phase 05.
- Do not automatically commit changes.

## 16. Implementation Workflow

Work in this order:

1. Inspect repository and existing domain contracts.
2. Identify any missing integration interfaces.
3. Propose the module structure and scenario configuration.
4. Implement deterministic generation.
5. Implement graph and cross-entity validation.
6. Implement canonical export.
7. Implement the API importer and CLI.
8. Add unit, schema, determinism, graph, and integration tests.
9. Run formatting, linting, type checks, and all relevant existing regression tests.
10. Build and verify the simulation-worker container.
11. Update documentation.
12. Review the final diff for unintended changes and secrets.

Do not report success for checks that were not actually executed. If a check cannot run, state the reason and provide the exact command needed to run it.

## 17. Acceptance Criteria

Phase 04 is complete only when:

1. Two runs using seed `42` and the same configuration produce byte-for-byte identical canonical JSON output.
2. Changing the seed can produce a different world.
3. Generated warehouse graphs are valid and every shelf is reachable from the packing station.
4. Generated records conform to existing domain schemas.
5. Cross-entity references are valid.
6. A small scenario imports through the existing Operational API without schema or foreign-key errors.
7. Retrying an import does not create duplicate entities or inventory movements.
8. Initial inventory satisfies existing Inventory Core invariants.
9. Historical sales are deterministic, synthetic, and clearly separated from operational KPIs.
10. Required tests and relevant regression tests pass.
11. Documentation and example scenarios are present.
12. The final report distinguishes verified results from unverified assumptions.

## 18. Completion Report

Return a report in this format:

### Phase 04 Completion Report

- **World Seeder Capabilities:** Stores, SKUs, layouts, inventory, suppliers, purchase-order schedules, and historical sales implemented.
- **Repository Integration:** Existing contracts/endpoints reused; any required extensions documented.
- **Determinism Verification:** Seed/configuration, canonical output hashes, repeated-run comparison, and changed-seed test results.
- **Graph Validation:** Node/edge counts, connectedness checks, packing-station reachability, and invalid-graph tests.
- **Schema Conformity:** Pydantic, Zod/API contract, and referential integrity test results.
- **Operational API Integration:** Commands executed, import results, retry behavior, and ledger reconciliation results.
- **Test Results:** Exact commands, passed/failed counts, and any skipped tests with reasons.
- **Files Changed:** Summary of important files and modules.
- **Known Limitations:** Explicitly list anything deferred or not verified.
- **Git Status:** Modified, staged, and untracked files; do not commit automatically.
- **Next Steps:** Whether the repository is ready for Phase 05 and any blockers that must be resolved first.