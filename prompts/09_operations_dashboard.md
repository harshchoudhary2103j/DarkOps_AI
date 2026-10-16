# Phase 09 — Operations Dashboard

## Objective
Build the responsive, modern Operations Dashboard web application in `apps/dashboard` using React, TypeScript, and Tailwind CSS to monitor store workloads, inventory risks, picking routes, and replenishment recommendations.

## Scope
- Implement the Core Dashboard Views:
  - **Operations Overview**: Store status cards, active orders, live picking backlogs, stockout alerts, and real-time operational feeds.
  - **Inventory & Replenishment Manager**: SKU stock table (on-hand, reserved, available, incoming), projected depletion curves, pending replenishment recommendations with interactive Approve / Reject / Edit action buttons.
  - **Warehouse 2D Layout & Route Viewer**: Interactive SVG/Canvas 2D grid rendering store aisles, shelf coordinate bins, product heatmaps, and animated picker paths comparing baseline vs. optimized routes.
  - **Geospatial Store Map**: Leaflet or SVG map rendering dark store locations, service area polygon boundaries, and delivery zones.
- Implement API Client & State Management:
  - Typed API client with React hooks, TanStack Query or SWR, error boundaries, and loading skeletons.
  - Toast notifications and action audit logging.

## Dependencies
- Phase 01: Catalog Endpoints.
- Phase 02: Inventory Endpoints.
- Phase 03: Order & Picking Endpoints.
- Phase 08: Route Optimization Endpoints.

## Business & Engineering Invariants
- Presentation-Only Invariant: The frontend must never compute authoritative inventory balances, calculate stockout risks locally, or fabricate operational KPIs. All rendered values must originate from backend API responses.
- Simulated State Banner: A persistent, prominent banner must indicate: "Operating in Synthetic Quick-Commerce Environment — All data and metrics are simulated."
- Accessibility & Testing: All interactive buttons, forms, and cards must have unique `id` and `aria-label` attributes for automated browser testing.

## Acceptance Criteria
1. Dashboard loads within 1.5 seconds, displaying store cards, inventory balances, and order statuses fetched from the Operational API.
2. Warehouse 2D viewer renders shelf locations accurately and plots picker path coordinates matching the optimizer's route response.
3. Approving a replenishment recommendation sends an authenticated request to the Operational API and updates recommendation status dynamically upon success.
4. UI provides clear error toasts when backend operations fail (e.g., attempting to reserve out-of-stock SKUs).

## Required Tests
- Component unit tests (React Testing Library / Vitest) covering store cards, tables, and route visualizers.
- Mock API integration tests verifying loading, error, and empty states.
- End-to-end browser tests verifying user navigation and recommendation approval.

## Documentation Updates
- Create `docs/ui/dashboard-architecture.md` describing component structure, styling tokens, and view routing.
- Provide instructions for running the dashboard locally with `npm run dev`.

## Completion Report Format
```markdown
### Phase 09 Completion Report
- **UI Views Implemented**: [overview, inventory, warehouse 2d route viewer, store map]
- **API Integration**: [verified data fetching and mutation actions]
- **Visual Design & Accessibility**: [responsiveness and aria attributes]
- **Next Steps**: [Phase 10 readiness]
```
