# Phase 09 — DarkOps AI Operations Control Tower
## Production-Quality SaaS Dashboard Implementation

## 1. Objective

Build a polished, responsive, enterprise-grade Operations Dashboard for **DarkOps AI**, a synthetic quick-commerce operations and optimization platform.

Implement the frontend inside `apps/dashboard` using the existing project architecture, React, TypeScript, and Tailwind CSS.

The dashboard should feel like a serious B2B SaaS product used by operations managers to monitor dark stores, inspect inventory risks, manage replenishment recommendations, track order fulfillment, and compare warehouse picking routes.

This is an implementation phase, not a design-only exercise. Build working pages, connect them to real backend endpoints, implement meaningful loading/error/empty states, and verify the complete user workflows.

### Product design direction

Create a modern **Operations Control Tower** with:

- A sophisticated dark navy/slate application shell with a high-contrast content area.
- A restrained accent palette for interactive elements and operational status.
- Information-dense but readable tables, charts, maps, and operational cards.
- Clear visual hierarchy, consistent spacing, thoughtful typography, and subtle motion.
- Desktop-first operational workflows with genuinely usable tablet and mobile layouts.
- A coherent design system instead of individually styled pages.

Use professional enterprise SaaS products as quality inspiration, but do not copy a specific product or introduce unnecessary visual gimmicks.

**Quality bar:** The application must look credible in a live product demonstration, not like a generic admin template or a static Figma mockup.

---

## 2. Mandatory Pre-Implementation Discovery

Before writing components:

1. Inspect `apps/dashboard` and identify the existing framework, dependencies, scripts, entry points, routing, styling, and test setup.
2. Read the existing operational API OpenAPI specification at `docs/api/catalog-openapi.json` and locate the API contracts for inventory, orders, picking, replenishment, simulation, evaluation, and optimization.
3. Inspect the actual server routes, request schemas, response envelopes, authentication middleware, and error handling for endpoints required by the dashboard.
4. Inspect the warehouse layout and route response schemas, including coordinate systems, graph nodes, edges, stop sequences, and route segments.
5. Inspect the existing Docker Compose configuration and API base URL conventions.
6. Identify which data is available from the Operational API, which is exposed by the optimization service, and which requires a new read-only operational endpoint.
7. Create a short implementation plan based on verified contracts.

Do not assume that a frontend dependency, endpoint, response field, or API capability exists merely because it is mentioned in this specification.

Reuse existing infrastructure and conventions. Do not rewrite working backend services or modify earlier migrations simply to accommodate a preferred UI implementation.

If an essential dashboard data source does not exist, document the gap and implement the smallest justified, backward-compatible backend addition only if necessary. Keep any such addition within the existing service architecture and document it.

**Never invent API responses, fabricate production data, or silently substitute hardcoded values for unavailable backend data.**

---

## 3. Technology and Architecture

Use the existing stack wherever possible.

### Required frontend foundation

- React and TypeScript with strict typing.
- Tailwind CSS using the existing configuration.
- React Router or the existing routing solution.
- TanStack Query for server-state fetching, caching, invalidation, and mutations, unless an established equivalent already exists.
- A typed API client built around the existing Operational API contracts.
- React Hook Form and Zod for validated forms, if compatible with the existing setup.
- Recharts or an equivalent existing charting library for operational charts.
- Lucide React or the existing icon library for consistent icons.
- Vitest and React Testing Library for unit and component integration tests.
- Playwright or the repository's existing E2E framework for browser workflows.

Use Leaflet with an appropriate map tile provider if a real geographic map is required and the dependency/configuration is available. Otherwise, implement a clearly labeled geographic SVG visualization using actual store coordinates and service-area geometry.

Use native SVG for the warehouse layout unless the existing project already includes a suitable canvas-based rendering system.

Avoid adding multiple libraries that solve the same problem. Keep dependencies minimal and compatible with the existing build.

### Suggested component structure

Adapt this structure to the existing repository rather than forcing a wholesale reorganization.

```text
apps/dashboard/src/
├── app/
│   ├── App.tsx
│   ├── router.tsx
│   └── providers.tsx
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Topbar.tsx
│   │   └── PageHeader.tsx
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Badge.tsx
│   │   ├── DataTable.tsx
│   │   ├── Dialog.tsx
│   │   ├── Skeleton.tsx
│   │   ├── EmptyState.tsx
│   │   └── ErrorState.tsx
│   ├── feedback/
│   │   ├── ToastProvider.tsx
│   │   └── ConfirmDialog.tsx
│   └── charts/
├── features/
│   ├── overview/
│   ├── inventory/
│   ├── replenishment/
│   ├── orders/
│   ├── warehouse/
│   ├── stores/
│   └── evaluations/
├── hooks/
├── lib/
│   ├── api-client.ts
│   ├── query-client.ts
│   ├── errors.ts
│   └── formatters.ts
├── types/
├── styles/
└── main.tsx
```

Each feature should own its relevant components, hooks, types, and tests where practical. Keep reusable presentation components independent of business-specific logic.

---

## 4. Application Shell and Navigation

Build a persistent, responsive application shell.

### Sidebar navigation

Include these routes:

- `/overview` — Operations Overview
- `/inventory` — Inventory Manager
- `/replenishment` — Replenishment Management
- `/orders` — Order Operations
- `/warehouse` — Warehouse Layout & Routes
- `/stores` — Store Network Map
- `/evaluations` — Simulation & Policy Evaluation

Only show a page as implemented when it has a functional view. The evaluations page must consume existing Phase 07 data rather than invent metrics. If the existing contracts cannot support it, provide an explicit, documented unavailable state instead of fabricated charts.

The sidebar should support:

- Active-route highlighting.
- Collapsible desktop navigation if appropriate.
- An accessible mobile navigation drawer.
- Consistent icons and concise labels.
- Keyboard navigation and visible focus indicators.

### Top navigation

Include:

- Current page title and optional breadcrumbs.
- A global store selector if supported by the available APIs.
- A manual refresh control.
- Last successful data refresh time.
- An API connection status indicator based on actual request outcomes.
- A user/session indicator only when supported by the existing authentication system.

Do not create fake user accounts, fake notifications, or pretend that an unsupported authentication flow exists.

### Persistent synthetic-environment banner

Display this exact message prominently across all application routes:

**"Operating in Synthetic Quick-Commerce Environment — All data and metrics are simulated."**

It must remain visible at common viewport sizes and be accessible to assistive technologies. Do not make the banner dismissible.

---

## 5. View A — Operations Overview

Build the main operations landing page as a high-quality operational control tower.

### A. Summary cards

Display the most useful available backend-derived summaries, such as:

- Active stores.
- Active orders.
- Orders awaiting allocation.
- Orders currently being picked.
- Inventory risk or stockout indicators.
- Pending replenishment recommendations.

Use the real available domain fields and statuses. If a metric cannot be derived from an authoritative backend response or endpoint, omit it or show a clearly explained unavailable state.

Every metric should have:

- A clear label.
- A formatted value.
- A meaningful status indicator where appropriate.
- An optional explanatory caption.
- A skeleton while loading.
- A proper empty/error state.

Do not fabricate percentage changes, historical comparisons, or trend indicators.

### B. Store operations table

Show available information such as:

- Store name and identifier.
- Operational status.
- Active order workload, if provided.
- Relevant inventory or serviceability status, if provided.
- A navigation action to inspect the store.

Use a proper table on larger screens and a readable responsive representation on small screens.

### C. Order and picking backlog

Display order counts by authoritative lifecycle status and provide a useful order table.

Where supported, show:

- Order identifier.
- Store.
- Order lifecycle status.
- Creation time.
- Allocation or picking state.
- Relevant exception indicators.

Use the actual order lifecycle contracts. Do not infer a lifecycle transition from a UI click.

### D. Inventory risk panel

Show backend-provided stockout alerts, inventory exceptions, or replenishment recommendations.

Clearly distinguish confirmed backend risks from missing or unavailable data. Do not compute stockout risk in the browser.

### E. Recent operational activity

Render an activity feed from real audit events or event history when available.

Include a timestamp, event description, affected entity, and status where the backend supports them.

If there is no suitable feed endpoint, document the limitation and avoid generating fictional events.

### F. Refresh behavior

Implement refresh controls and query invalidation. Use polling only for endpoints that benefit from it, with a reasonable interval and cleanup.

Do not label ordinary periodic HTTP polling as a WebSocket or live event stream.

---

## 6. View B — Inventory Manager

Create an inventory workspace for inspecting stock positions and understanding replenishment needs.

### A. Inventory table

Display, where available:

- SKU code.
- Product name.
- Store.
- Physical on-hand quantity.
- Reserved quantity.
- Available quantity.
- Incoming quantity or expected receipts.
- Unit of measure.
- Inventory status or backend-provided risk classification.
- Last updated timestamp.

All quantities and risk classifications must come from backend responses.

The frontend must never calculate authoritative available stock by subtracting reserved units, recompute stockout risk, or independently project depletion.

Support:

- Search by SKU code or product name.
- Filtering by store and supported status fields.
- Sorting.
- Pagination for large datasets.
- Clear filter-reset behavior.
- Responsive layouts.
- Explicit empty results when filters match nothing.

If incoming inventory is not exposed by the API, display it as unavailable or omit the column. Do not substitute zero for unknown data.

### B. SKU detail panel

Where the API supports it, clicking a SKU should open a detail panel or detail page with:

- Current inventory position.
- Inventory movement history.
- Reservations and incoming receipts.
- Backend-provided demand or depletion projections.
- Related replenishment recommendations.

Charts must render the data supplied by the server. If historical or projected series are missing, explain that the chart is unavailable.

### C. Inventory movement history

Use the actual movement types and their authoritative quantities. Format timestamps and signed quantities consistently.

Avoid presenting a client-generated history as if it were a persisted inventory ledger.

---

## 7. View C — Replenishment Management

Build a dedicated workflow for reviewing and managing replenishment recommendations.

### A. Recommendation list

Display available fields such as:

- Recommendation identifier.
- Store and SKU.
- Recommended quantity.
- Current stock position.
- Expected delivery or lead time.
- Supplier.
- Estimated costs.
- Recommendation status.
- Creation timestamp.

Only show fields supported by the real API contract.

Support status filters, search, sorting, and detail inspection.

### B. Recommendation details

Open a side panel or dialog with the available recommendation inputs, quantities, supplier details, relevant forecast information, and cost breakdown.

Distinguish between:

- Backend-generated recommendation.
- User-proposed edit.
- Persisted operational decision.
- Purchase order or other downstream action, if supported.

### C. Approve, reject, and edit workflows

Implement working actions using the actual authenticated Operational API endpoints.

**Approve**
1. Confirm the selected recommendation and show relevant details.
2. Send the correct authenticated request.
3. Show a pending state and prevent accidental duplicate submissions.
4. On success, invalidate affected queries and display the persisted status.
5. Show a success toast only after confirmed success.

**Reject**
1. Ask for confirmation and collect a rejection reason if the backend contract supports one.
2. Submit the actual request.
3. Update the interface only after success or through a properly reversible optimistic update.
4. Display the persisted result.

**Edit**
1. Open a validated form.
2. Use server-compatible fields and Zod validation.
3. Apply the backend's quantity, pack-size, supplier, and business constraints.
4. Submit through the supported update endpoint.
5. Refresh affected data after success.

If an approval or rejection endpoint does not exist, do not create a fake frontend-only success. Document the missing contract and implement the smallest justified backend addition if required for the workflow.

If approval creates a purchase order, represent that transition accurately. Do not claim that a supplier has received or fulfilled an order merely because an approval request succeeded.

---

## 8. View D — Order Operations

Provide a functional operational view for order monitoring and supported order actions.

### Order list

Show:

- Order identifier.
- Store.
- Lifecycle status.
- Number of lines, if available.
- Creation timestamp.
- Picking status.
- Exception or failure information when available.

Support search, status filtering, sorting, and navigation to order details.

### Order detail

Show the order's persisted lifecycle, line items, allocation, picking task, and relevant history wherever the backend exposes these fields.

Use a readable status timeline based on actual state transitions.

### Supported actions

Expose actions such as allocate, cancel, start picking, confirm picked quantities, or report an exception only when the corresponding backend endpoint and authorization rules exist.

Every action must use the real API, display pending/error/success states, and refresh affected queries.

A failed inventory reservation or other domain failure must produce a clear message derived from the server's error response.

Never mutate order state only in React to simulate a successful backend operation.

---

## 9. View E — Warehouse 2D Layout and Route Viewer

This is a flagship visualization. It should be visually impressive while remaining geometrically accurate.

Implement an interactive warehouse layout using SVG, or another existing rendering solution where justified.

### A. Warehouse layout rendering

Render the actual warehouse layout response, including supported:

- Nodes and graph edges.
- Aisles and shelf locations.
- Shelf/bin coordinates.
- Dispatch or depot station.
- Relevant store/layout identifiers.
- Active layout version.

Preserve the coordinate system and transformations defined by the backend. Do not invent shelf locations or infer graph connectivity from visual proximity.

If a layout has no usable geometry, show an explanatory empty state.

### B. Navigation and interaction

Support:

- Pan and zoom.
- Fit-to-layout.
- Reset view.
- Selection of supported nodes or shelf locations.
- Hover/focus details.
- A legend for the displayed node and route types.
- Accessible alternatives for essential interactions.

Use SVG `viewBox` and coordinate transformations appropriately. Avoid hardcoding a single warehouse size or screen resolution.

### C. Picker route visualization

Consume the actual Phase 08 route optimizer response.

Render:

- Start/dispatch station.
- Requested pick stops.
- Route segments.
- Ordered stops.
- Total distance when provided.
- Optimization status and runtime when provided.
- Any warnings or fallback indicators returned by the optimizer.

The plotted route must correspond to the optimizer's returned path and coordinate system. Use returned graph paths/edges where available; do not draw arbitrary straight lines through walls or unrelated shelves.

### D. Baseline versus optimized comparison

Where both route responses are available, provide a comparison mode:

- Baseline route.
- Optimized route.
- Toggle or overlay between the two.
- Separate legend entries.
- Distance comparison using the returned values.
- Optimization status and runtime.

Do not claim an improvement percentage unless it is correctly supported by comparable baseline and optimized response data.

If the optimizer endpoint requires input, create a validated form for the relevant store, layout, and pick stops. Send the request to the optimization service through the configured API boundary. Keep the optimization service stateless and do not perform operational inventory mutations from the dashboard.

### E. Animation

Add optional, subtle route animation that follows the actual returned path.

Animation must:

- Be pausable and restartable.
- Respect reduced-motion preferences.
- Never alter route geometry.
- Avoid implying that a real picker is being tracked.

Label it as a route simulation or playback.

---

## 10. View F — Geospatial Store Network

Implement an interactive store map using Leaflet with an appropriately configured tile provider, or a geographic SVG fallback.

### Requirements

- Plot stores using actual latitude and longitude.
- Render service-area polygons from the stored GeoJSON geometry where available.
- Render service zones only when the relevant API exposes them.
- Distinguish stores using actual status fields.
- Support store selection and a linked store detail panel.
- Show available workload and inventory summaries.
- Fit the map to valid returned geometry.
- Handle missing coordinates, invalid polygons, and empty store collections safely.

Validate GeoJSON geometry before rendering it. Respect coordinate order: GeoJSON coordinates use longitude, latitude, while many mapping APIs accept latitude, longitude.

Do not place markers at arbitrary coordinates or silently use fabricated service areas.

If a map tile provider requires credentials, document the environment variable and provide a clear fallback when the key is missing.

---

## 11. View G — Simulation and Policy Evaluation

Create a useful evaluation view using the existing Phase 07 evaluation and comparison contracts.

Show only the KPIs and comparisons returned by the backend, including applicable service, fulfillment, routing, cost, and workload metrics.

Where supported, show:

- Simulation run identifier.
- Scenario and policy configuration.
- Run status and duration.
- Formula/evaluator version.
- KPI values and data-quality warnings.
- Baseline-versus-optimized comparisons.
- Cost breakdowns and metric directionality.
- The exact simulated-data disclaimer.

Preserve backend metric statuses such as `AVAILABLE`, `ZERO`, `NOT_APPLICABLE`, `INSUFFICIENT_DATA`, and `INVALID_EVENT_STREAM` if those are the actual contract values.

Do not turn unavailable metrics into zero, treat invalid event streams as trustworthy, or display incompatible comparisons as fair comparisons.

Clearly identify synthetic results and avoid claims of real-world business impact.

If a required endpoint is missing, provide an explicit unavailable state and document the dependency rather than inventing data.

---

## 12. Typed API Client and Server State

Create a central typed API layer.

### API client requirements

- Read the API base URL from environment configuration.
- Reuse the existing authentication mechanism.
- Preserve correlation IDs and existing JSON envelope conventions.
- Parse successful and unsuccessful responses safely.
- Convert domain errors into typed, displayable application errors.
- Support request cancellation where appropriate.
- Avoid logging secrets, credentials, or sensitive request payloads.
- Handle network failures, server failures, malformed responses, and expired authentication correctly.

Use the real API response types. Do not use `any` to bypass contract problems.

### TanStack Query requirements

Use stable, feature-oriented query keys and centralize query configuration.

Implement:

- Appropriate stale times and cache behavior.
- Query invalidation after successful mutations.
- Loading, error, empty, and populated states.
- Request deduplication.
- Cancellation where useful.
- Controlled retries only for suitable transient failures.
- Manual refresh.
- Reasonable polling for operational data where appropriate.

Do not retry failed mutations blindly. Do not use optimistic updates for irreversible or safety-critical operations unless rollback behavior is explicitly correct.

### Environment configuration

Provide an example environment file with non-secret placeholders, such as:

```dotenv
VITE_API_BASE_URL=http://localhost:5000
VITE_OPTIMIZATION_API_BASE_URL=http://localhost:8000
```

Use these as examples only. Verify actual service ports, route prefixes, proxy behavior, and authentication configuration before finalizing them.

Never put secret credentials in Vite environment variables. Variables prefixed with `VITE_` are exposed to the browser.

Configure CORS or a development proxy only where needed, preserving existing security controls.

---

## 13. Visual Design System

Create reusable design tokens for:

- Backgrounds and surfaces.
- Text and muted text.
- Borders and separators.
- Primary and secondary actions.
- Success, warning, error, and informational states.
- Spacing.
- Border radius.
- Typography.
- Shadows and elevation.
- Focus rings.
- Animation durations.

### Design principles

1. Use consistent card and table styling across the application.
2. Use status colors consistently and pair them with text or icons.
3. Use tabular numerals for quantities, prices, and KPIs.
4. Format currency using the backend-provided currency rather than assuming a universal currency.
5. Use consistent date/time formatting and clearly handle missing timestamps.
6. Avoid excessive gradients, oversized decorative graphics, unnecessary glassmorphism, and excessive animation.
7. Keep dense operational tables scannable.
8. Ensure charts have labels, legends, tooltips, and readable empty states.
9. Provide both light and dark themes only if they can be implemented consistently without compromising the core views. A polished single theme is preferable to two incomplete themes.

### Responsive behavior

Verify at minimum:

- 1440 × 900 desktop.
- 1024 × 768 tablet/small laptop.
- 768 × 1024 tablet portrait.
- 390 × 844 mobile.

The desktop should support efficient operations workflows. Smaller screens should preserve essential information and actions without overflowing the viewport or forcing the entire application into a tiny desktop layout.

---

## 14. Accessibility and Automated Testing

Every interactive control must have a stable, unique, meaningful `id` and an appropriate accessible name.

Use `aria-label` for icon-only controls or controls whose accessible name is not already supplied by visible text or an associated label. Do not add redundant or misleading ARIA attributes.

Use semantic HTML and accessible component patterns.

### Accessibility requirements

- Keyboard-accessible navigation and dialogs.
- Visible focus states.
- Correct labels and descriptions for form inputs.
- Appropriate dialog focus management.
- Escape-key dismissal where appropriate.
- Accessible status and error announcements.
- Sufficient color contrast.
- No status communication by color alone.
- Reduced-motion support.
- Accessible tables and chart alternatives.
- Unique IDs generated consistently for repeated components.

### A. Component tests

Use Vitest and React Testing Library.

Test at minimum:

- Store status cards.
- Inventory tables and filters.
- Replenishment recommendation rows.
- Approve, reject, and edit dialogs.
- Order status rendering.
- Warehouse graph and route rendering.
- Baseline/optimized route switching.
- Store map empty/invalid geometry handling.
- Loading skeletons.
- Empty states.
- Error states.
- API error messages.
- Accessible labels and IDs.

### B. API integration tests

Mock HTTP requests at the network boundary rather than replacing the components' business logic.

Verify:

- Correct query parameters and request payloads.
- Authentication handling where applicable.
- Loading, success, empty, and error states.
- Query invalidation after mutations.
- No false success when the server rejects an action.
- Duplicate submissions are prevented.
- Backend domain errors are translated into understandable messages.
- Invalid or missing data does not crash the UI.

Use deterministic fixtures based on the actual API contracts. Label fixtures as test data.

### C. End-to-end browser tests

Use Playwright or the existing E2E framework.

Implement at least these flows:

1. Load the dashboard and navigate between the primary views.
2. Inspect inventory and filter by SKU/store.
3. Open a replenishment recommendation, edit or review it, and approve it against a controlled test API.
4. Verify a failed mutation displays an error and does not falsely change persisted status.
5. Open a warehouse layout and verify route coordinates match the returned optimizer path.
6. Open the store map and inspect a store's details.
7. Verify the synthetic-environment banner remains visible.

Do not make E2E tests dependent on an uncontrolled external API, real supplier integrations, or unpredictable live data.

---

## 15. Performance Requirements

The target is a dashboard that feels responsive under realistic development and demonstration conditions.

- Target initial meaningful dashboard content within 1.5 seconds on the agreed local test environment and representative fixture size.
- Measure the result; do not claim the target is met without evidence.
- Avoid fetching every large dataset at initial page load.
- Use route-level code splitting where beneficial.
- Load detailed data when a user opens the corresponding view or panel.
- Avoid unnecessary React re-renders and expensive SVG updates.
- Memoize costly transformations only when justified.
- Paginate large tables rather than rendering unlimited records.
- Use appropriate query caching.
- Prevent duplicate requests where practical.
- Clean up polling, event listeners, and animation resources.

The frontend must not delay the initial dashboard because an unrelated route, map tile, or optional optimization endpoint is unavailable.

If the performance target cannot be met, report the measured result and the bottleneck.

---

## 16. Error Handling and User Feedback

Use a consistent toast and inline-error system.

Every mutation must support:

- Pending state.
- Disabled repeat submission.
- Success feedback after confirmed success.
- Understandable failure feedback.
- Recovery or retry guidance when appropriate.

Examples:

- `INSUFFICIENT_STOCK`: Explain that the requested operation could not be completed because stock was insufficient.
- `409 Conflict`: Explain that the server rejected the action because of a conflict.
- `401 Unauthorized`: Explain that authentication is required or has expired.
- `403 Forbidden`: Explain that the action is not permitted.
- Network error: Explain that the backend could not be reached.

Map these examples to the actual error envelope and error codes returned by the services.

Do not expose stack traces, internal SQL details, secret values, or raw server exception dumps to users.

Use confirmation dialogs for consequential actions, and never show success before the backend confirms the mutation.

---

## 17. Security and Data Integrity

- Reuse existing authentication and authorization.
- Do not hardcode tokens or credentials.
- Do not place privileged API credentials in frontend bundles.
- Never trust frontend validation as a replacement for backend validation.
- Treat server responses as untrusted input and handle malformed data safely.
- Do not create operational side effects by calling optimization endpoints.
- Do not fabricate inventory balances, operational KPIs, store coordinates, route distances, or persisted status transitions.
- Do not introduce a second source of truth in browser state.
- Do not store sensitive authentication material in local storage without an explicit, reviewed architectural requirement.
- Preserve correlation IDs and useful diagnostics where supported.
- Keep the frontend compatible with the existing modular-monolith architecture.

---

## 18. Documentation

Create `docs/ui/dashboard-architecture.md`.

Include:

1. Frontend architecture and component boundaries.
2. Route/view structure.
3. Design tokens and styling conventions.
4. API client and authentication behavior.
5. Query keys, caching, polling, and invalidation.
6. API endpoints used by each view.
7. Any missing endpoints or backend changes introduced.
8. Warehouse coordinate transformations and route rendering.
9. Map/GeoJSON handling and map provider configuration.
10. Synthetic data disclaimer and metric-trust rules.
11. Testing commands.
12. Performance measurement methodology and results.
13. Known limitations.

Update the dashboard's local-development instructions and environment example.

Document the exact commands needed to install dependencies, run the frontend, run tests, and launch the relevant backend services through Docker Compose.

Ensure the documented commands match the repository's actual package scripts.

---

## 19. Implementation Order

Complete the work in the following sequence.

### Step 1 — Discovery and foundation
Inspect existing contracts, configure the app shell, routing, design tokens, API client, query provider, and global error handling.

### Step 2 — Core operational workflows
Implement the overview, inventory, replenishment, and order views using verified API contracts.

### Step 3 — Advanced visualizations
Implement the warehouse layout and route viewer, store map, and evaluation view using real response schemas.

### Step 4 — Interaction polish
Add filters, sorting, dialogs, validated forms, toast feedback, skeletons, empty states, and responsive behavior.

### Step 5 — Verification
Run unit tests, API integration tests, E2E tests, type checking, and production build. Launch the dashboard with the existing development environment and resolve integration failures.

### Step 6 — Documentation and report
Write the architecture documentation, record measured performance, list remaining limitations, and produce the completion report.

Do not stop after creating the app shell or a visually attractive overview page. Finish the complete scoped workflow.

Do not introduce unrelated features or change the existing architecture.

---

## 20. Definition of Done

Phase 09 is complete only when:

- [ ] The application builds successfully.
- [ ] TypeScript checks pass.
- [ ] The dashboard shell and all scoped views are implemented or have explicit, documented contract-based unavailable states.
- [ ] The persistent synthetic-environment banner is visible on every route.
- [ ] Store, inventory, order, picking, and replenishment data are fetched from the appropriate real backend endpoints.
- [ ] No authoritative inventory balance, stockout risk, or operational KPI is invented or computed in the frontend.
- [ ] Replenishment actions call authenticated backend endpoints and display persisted outcomes.
- [ ] Warehouse rendering uses actual layout geometry and returned optimizer route data.
- [ ] Store markers and service areas use actual coordinates and valid geometry.
- [ ] Loading, empty, error, and mutation states are implemented.
- [ ] Interactive controls have unique IDs and appropriate accessible names.
- [ ] Component and API integration tests pass.
- [ ] Critical E2E workflows pass against a controlled test environment.
- [ ] Responsive behavior is verified at the specified viewport sizes.
- [ ] Performance measurements are documented.
- [ ] `docs/ui/dashboard-architecture.md` is complete.
- [ ] Local development instructions and environment configuration are accurate.
- [ ] Existing backend behavior and earlier phase contracts remain compatible.
- [ ] All known failures, missing contracts, and limitations are disclosed.

---

## 21. Completion Report

Return the following report only after executing the relevant verification steps.

### Phase 09 Completion Report

- **UI Views Implemented:** List the completed views and any unavailable states.
- **Visual Design:** Describe the application shell, design system, responsive behavior, and major interactions.
- **API Integration:** List the verified endpoints, queries, and mutations.
- **Warehouse Visualization:** Explain coordinate handling, route rendering, and baseline/optimized comparison.
- **Store Map:** Describe store and service-area rendering and any provider configuration.
- **Accessibility:** Summarize keyboard behavior, accessible names, unique IDs, and reduced-motion support.
- **Tests:** Report actual passing/failing component, integration, and E2E test counts.
- **Type Checking and Build:** Include actual command results.
- **Performance:** Report measured initial-load performance, test conditions, and any remaining bottlenecks.
- **Documentation:** List files created or updated.
- **Backend Changes:** Identify any justified API additions and their compatibility.
- **Known Limitations:** Explicitly list unsupported workflows and missing data sources.
- **Phase 10 Readiness:** Explain whether the frontend is ready for end-to-end integration and demonstration.

Do not report tests as passing unless they were actually run. Do not describe a mock workflow as a verified backend integration.

**Final instruction:** Build a cohesive, reliable SaaS operations product—not a collection of disconnected demo pages. Prioritize operational correctness, clear visual hierarchy, trustworthy data, and working end-to-end interactions over decorative complexity.