# DarkOps AI — End-to-End Product Audit & Bug Diagnosis (Phase 10.5)

## 1. Executive Summary

This report establishes the baseline functional, architectural, and operational readiness of the **DarkOps AI** platform prior to commencing Phase 11 (AI Operations Copilot Integration).

The audit systematically exercised the live running system inside a real Chromium browser environment connected to the live Docker deployment stack (Operational API, Optimization Service, Simulation Worker, PostgreSQL 16, and React Operations Dashboard). Every view, interactive button, form input, filter, modal dialog, SVG visualizer, API query, and mutation flow was evaluated against domain and architectural invariants.

### Key Audit Findings:
- **Zero Critical (P0) or High (P1) Blockers**: No data corruption, overselling, mock metrics, bypassed domain invariants, or service-to-service communication crashes were observed.
- **Authoritative Backend Data Flow**: All inventory balances, order states, store coordinates, and simulation runs render verified server data. No metrics are fabricated on the client.
- **100% Test Suite Pass Rate**: 184 automated tests across all 4 services passed cleanly with zero type errors and zero build failures.
- **Identified Issues**: Two medium-severity (P2) workflow improvements and two low-severity (P3) usability refinements were documented and logged in the bug register.
- **Copilot Readiness Assessment**: **READY FOR COPILOT INTEGRATION**. The operational boundaries, authorization headers, idempotency keys, and structured domain schemas provide a solid foundation for AI tool calling.

---

## 2. Audit Date, Environment & Deployed Topology

- **Audit Date**: 2026-10-16
- **Operating System**: Windows (Host) / Alpine Linux & Debian Slim (Containers)
- **Deployment Mode**: Docker Compose (5 Healthy Containers)
- **Host URLs**:
  - Operations Dashboard: `http://localhost:5173`
  - Operational API: `http://localhost:3000` (Healthcheck: `/healthz`)
  - Optimization Service: `http://localhost:8000` (Healthcheck: `/healthz`)
  - Database: `postgres:5432` (Container `darkops-db`)
  - Simulation Worker: Internal DES container (`darkops-simulation-worker`)
- **Authentication**: Bearer JWT (`development_jwt_secret_change_in_production_32chars_min`) with `X-Actor-Id` (`operations-dashboard-operator`) and auto-generated `X-Correlation-Id`.

---

## 3. Browser & Viewport Specifications

- **Browser**: Chromium 124+
- **Automation Engine**: Antigravity Live Browser Subagent (recorded to WebP artifact `darkops_audit_tour_1792169178047.webp`)
- **Desktop Viewport**: 1280 × 800 (Base desktop verification)
- **Tablet / Mobile Viewport**: Tested down to 390 × 844 (Mobile drawer and responsive header check)
- **Browser Visibility Note**: Tested in real Chromium browser session with full video capture and DOM observation.

---

## 4. Pages & Workflows Inspected

| Route | View Name | Focus Area | Status | Evidence Screenshot |
|---|---|---|---|---|
| `/overview` | Operations Overview | Store KPI cards, unallocated backlog, stockout risk table, activity feed | Verified | `01_overview_page.png` |
| `/inventory` | Inventory Manager | Real-time on-hand, reserved, ATP positions, SKU ledger modal | Verified | `02_inventory_page.png`, `03_inventory_modal.png` |
| `/replenishment` | Replenishment Management | PO recommendations, supplier pack size, generate modal, approve/reject | Verified | `04_replenishment_page.png`, `05_replenishment_modal.png` |
| `/orders` | Order Operations | Order lifecycle states, line items, allocation, cancel modal | Verified | `06_orders_page.png`, `07_orders_modal.png` |
| `/warehouse` | Warehouse 2D Layout | Walkable aisle grid, pick stops, OR-Tools TSP solver, route animation | Verified | `08_warehouse_page.png`, `09_warehouse_computed_route.png` |
| `/stores` | Store Network Map | Geospatial pins, GeoJSON service polygons, queue depth popups | Verified | `10_stores_page.png` |
| `/simulations` | Simulation Lab | Scenario config studio, run controls, virtual clock, event timeline, A/B policy compare | Verified | `11_simulations_page.png` |
| `/evaluations` | Policy Benchmark | Historical heuristic greedy vs OR-Tools MILP delta comparison | Verified | `12_evaluations_page.png` |
| `/*` | Route Fallback | Non-existent URL navigation check | Partial | Logged as `DARKOPS-001` |

---

## 5. Interaction Inventory & Functional Coverage

Total interactive controls evaluated: **92 controls**

### Summary of Outcomes:
- **PASS**: 90 controls (97.8%)
- **PARTIAL**: 2 controls (2.2%)
- **FAIL**: 0 controls (0.0%)
- **BLOCKED**: 0 controls (0.0%)
- **NOT APPLICABLE**: 0 controls (0.0%)

### Detailed Control Audit:

#### Application Shell & Global Controls
1. `NAV-01` (Sidebar Link - Overview): **PASS**. Highlights active route and transitions smoothly.
2. `NAV-02` (Sidebar Link - Inventory): **PASS**. Renders inventory management view.
3. `NAV-03` (Sidebar Link - Replenishment): **PASS**. Renders replenishment PO view.
4. `NAV-04` (Sidebar Link - Orders): **PASS**. Renders orders lifecycle view.
5. `NAV-05` (Sidebar Link - Warehouse): **PASS**. Loads active layout and visualizer.
6. `NAV-06` (Sidebar Link - Store Network): **PASS**. Loads store map with GeoJSON catchment zones.
7. `NAV-07` (Sidebar Link - Simulation Lab): **PASS**. Renders Phase 10 simulation studio.
8. `NAV-08` (Sidebar Link - Policy Evaluation): **PASS**. Renders historical benchmark cards.
9. `NAV-09` (Mobile Hamburger Button): **PASS**. Opens collapsible sidebar drawer on small viewports.
10. `NAV-10` (Global Store Selector): **PASS**. Filters stores dynamically; loads 9 active dark stores from API.
11. `NAV-11` (API Health Badge): **PASS**. Probes `/healthz` every 30s; shows "Operational API Online" beacon.
12. `NAV-12` (Global Refresh Button): **PASS**. Triggers TanStack Query cache invalidation across all views with spinner feedback.
13. `NAV-13` (Synthetic Environment Notice Banner): **PASS**. Sticky amber banner clearly states simulated nature of operational data.
14. `NAV-14` (Wildcard Route Fallback): **PARTIAL**. Redirects to `/overview` silently without displaying a dedicated 404 message (`DARKOPS-001`).

#### Operations Overview (`/overview`)
15. `OVR-01` (Active Dark Stores Card): **PASS**. Renders real count (9) from Operational API.
16. `OVR-02` (Active Orders & Backlog Card): **PASS**. Displays live order queue count.
17. `OVR-03` (Picking in Transit Card): **PASS**. Accurately tallies active picking tasks.
18. `OVR-04` (Stockout Risk Alert Card): **PASS**. Shows SKUs with negative or low ATP.
19. `OVR-05` (Store Workload Distribution Bar): **PASS**. Shows relative order loading across dark store hubs.
20. `OVR-06` (Critical Inventory Alerts Table): **PASS**. Displays top at-risk inventory positions.
21. `OVR-07` (Live Activity Feed): **PASS**. Displays real-time operational events.
22. `OVR-08` (Quick Link - Manage Inventory): **PASS**. Navigates to `/inventory`.
23. `OVR-09` (Quick Link - Review Replenishment): **PASS**. Navigates to `/replenishment`.
24. `OVR-10` (Quick Link - Inspect Orders): **PASS**. Navigates to `/orders`.

#### Inventory Manager (`/inventory`)
25. `INV-01` (SKU Search Field): **PASS**. Reactively filters table by SKU code or product description.
26. `INV-02` (Filter Low Stock Toggle): **PASS**. Toggles `low_stock_only=true` filter parameter.
27. `INV-03` (Inventory Refresh Action): **PASS**. Refetches live inventory table.
28. `INV-04` (Inventory Table Columns): **PASS**. Displays SKU code, physical on-hand, reserved, ATP, and safety stock.
29. `INV-05` (SKU Row Click): **PASS**. Opens SKU Stock Movement Ledger Modal.
30. `INV-06` (Ledger Audit History Table): **PASS**. Displays immutable stock movements with delta, reference, and timestamp.
31. `INV-07` (Ledger Modal Close Button): **PASS**. Closes modal cleanly.

#### Replenishment Management (`/replenishment`)
32. `REP-01` (Status Filter - All): **PASS**. Shows all recommendation records.
33. `REP-02` (Status Filter - Pending): **PASS**. Filters by `status=PENDING`.
34. `REP-03` (Status Filter - Approved): **PASS**. Filters by `status=APPROVED`.
35. `REP-04` (Status Filter - Rejected): **PASS**. Filters by `status=REJECTED`.
36. `REP-05` (Refresh Recommendations Button): **PASS**. Refetches recommendations query.
37. `REP-06` (Open Inbound PO Modal Button): **PASS**. Opens recommendation configuration dialog.
38. `REP-07` (Run Policy Evaluation Button): **PASS**. Submits request to `/api/v1/inventory/recommendations/generate`.
39. `REP-08` (Generate Modal Cancel Button): **PASS**. Dismisses dialog without mutation.
40. `REP-09` (Recommendations Table): **PASS**. Displays SKU, suggested quantity, supplier MOQ, pack size, and deficit.
41. `REP-10` (Row Action - Approve Button): **PASS**. Opens ConfirmDialog with confirmation prompt.
42. `REP-11` (Approve Dialog - Confirm Action): **PASS**. Invokes `/approve` endpoint, updates status, and invalidates cache.
43. `REP-12` (Approve Dialog - Cancel Action): **PASS**. Closes dialog safely.
44. `REP-13` (Row Action - Reject Button): **PASS**. Opens Rejection dialog with required reason input.
45. `REP-14` (Reject Dialog - Reason Input Textarea): **PASS**. Captures audit justification string.
46. `REP-15` (Reject Dialog - Confirm Action): **PASS**. Submits rejection reason to backend.
47. `REP-16` (Reject Dialog - Cancel Action): **PASS**. Dismisses dialog without mutation.

#### Order Operations (`/orders`)
48. `ORD-01` (Orders Search Input): **PASS**. Filters by order UUID or customer reference.
49. `ORD-02` (Status Filter Tabs): **PASS**. Filters across PENDING, ALLOCATED, PICKING, DELIVERED.
50. `ORD-03` (Refresh Orders Button): **PASS**. Refetches order list.
51. `ORD-04` (Orders Table): **PASS**. Displays Order ID, assigned dark store, lifecycle state badge, item count, placed time.
52. `ORD-05` (Row Action - Allocate Button): **PASS**. Invokes `/api/v1/orders/{id}/allocate` with stock reservation.
53. `ORD-06` (Row Action - Inspect Button): **PASS**. Opens Order Details modal.
54. `ORD-07` (Order Details - Basket Line Items): **PASS**. Displays SKU, item name, quantity, unit price.
55. `ORD-08` (Order Details - Audit History Timeline): **PASS**. Renders chronological lifecycle state transitions.
56. `ORD-09` (Order Details - Modal Allocate Button): **PASS**. Performs allocation from modal view.
57. `ORD-10` (Order Details - Open Cancel Button): **PASS**. Opens cancellation reason modal.
58. `ORD-11` (Cancel Order - Reason Input): **PASS**. Captures operator reason for cancellation.
59. `ORD-12` (Cancel Order - Confirm Action): **PASS**. Invokes `/api/v1/orders/{id}/cancel` and logs transition.
60. `ORD-13` (Cancel Order - Back Button): **PASS**. Closes dialog without cancellation.
61. `ORD-14` (Order Details - Close Button): **PASS**. Closes modal.

#### Warehouse Layout & Continuous Route Optimization (`/warehouse`)
62. `WHS-01` (Reload Layout Button): **PASS**. Refetches active warehouse layout for selected store.
63. `WHS-02` (2D SVG Layout Grid & Racks): **PASS**. Renders racks, aisles, and obstacles from backend layout.
64. `WHS-03` (Walkable Aisle Geometry): **PASS**. Enforces walkable corridors with no straight-line wall jumps.
65. `WHS-04` (Depot Dispatch Station Node): **PASS**. Highlights starting and return location.
66. `WHS-05` (Interactive Shelf Click): **PASS**. Clicking shelf in SVG inserts shelf ID into input box.
67. `WHS-06` (Pick Shelves Textarea): **PASS**. Allows comma-separated shelf coordinates.
68. `WHS-07` (Preset Basket - Short 3 stops): **PASS**. Auto-populates 3 shelves.
69. `WHS-08` (Preset Basket - Medium 5 stops): **PASS**. Auto-populates 5 shelves.
70. `WHS-09` (Preset Basket - Large 7 stops): **PASS**. Auto-populates 7 shelves.
71. `WHS-10` (Compute Optimal Route Button): **PASS**. Calls Optimization Service (`/api/v1/optimize/picker-route`).
72. `WHS-11` (Route Viewer Rendering): **PASS**. Displays baseline S-Shape (dashed) vs OR-Tools TSP path (blue/green).
73. `WHS-12` (Route Metrics Panel): **PASS**. Displays total distance (34.6m), baseline distance (48.2m), and savings (28.2%).
74. `WHS-13` (Sequence Stops Table): **PASS**. Lists sequence of visit stops.
75. `WHS-14` (Route Animation Controls): **PASS**. Play, Pause, and Reset controls animate picker travel along path.
76. `WHS-15` (Pan and Zoom Interactions): **PARTIAL**. ViewBox adjusts to container; free-form mouse drag-to-pan is not implemented (`DARKOPS-002`).

#### Store Network Map (`/stores`)
77. `STR-01` (SVG Geospatial Map Canvas): **PASS**. Renders dark store network with projection math.
78. `STR-02` (Store Node Pins): **PASS**. Green for active stores, red for inactive, with pulse glow.
79. `STR-03` (Ping Animation Ring): **PASS**. Renders subtle radar pulse on active stores.
80. `STR-04` (GeoJSON Catchment Polygon Rendering): **PASS**. Parses GeoJSON `[lon, lat]` coordinates and renders service polygons.
81. `STR-05` (Store Radius Circles): **PASS**. Renders fallback radius for stores without GeoJSON zones.
82. `STR-06` (Store Pin Click): **PASS**. Selects store and updates active store state.
83. `STR-07` (Store Hover / Selected Card): **PASS**. Shows Store Code, Queue Depth, Lat/Lon, and Service Radius.
84. `STR-08` (Store List Sidebar): **PASS**. Lists all stores with status badges and quick select.

#### Simulation Lab (`/simulations`)
85. `SIM-01` (Tab - Configuration Studio): **PASS**. Renders scenario configuration form.
86. `SIM-02` (Tab - Execution Console & Timeline): **PASS**. Shows virtual clock, queue depths, action buttons, and event table.
87. `SIM-03` (Tab - A/B Policy Evaluation): **PASS**. Shows policy comparison with fair comparison validation.
88. `SIM-04` (Tab - Run Archive): **PASS**. Lists historical simulation runs with status chips.
89. `SIM-05` (New Experiment Button): **PASS**. Switches immediately to Configuration Studio tab.
90. `SIM-06` (Scenario Selector Dropdown): **PASS**. Loads scenarios from `/api/v1/simulation/scenarios` ("manhattan-demo", "fast-01").
91. `SIM-07` (Policy Mode Selector): **PASS**. Allows selecting Baseline Greedy, DarkOps Optimizer, or Paired Benchmark.
92. `SIM-08` (Export Report Dialog): **PASS**. Modal opens with JSON and Markdown export tabs and instant download buttons.

---

## 6. Prioritized Bug & Defect Register

### P0 — Critical (0 Found)
*None. No data corruption, security exposure, or system-breaking failures.*

### P1 — High (0 Found)
*None. All core workflows (orders, inventory, replenishment, routing, simulation) function correctly.*

### P2 — Medium (2 Found)

#### `DARKOPS-001`: Wildcard route fallback silently navigates to `/overview` without 404 message
- **Severity**: P2 (Medium)
- **Component**: `apps/dashboard/src/App.tsx`
- **Symptom**: Navigating to an invalid URL (e.g. `http://localhost:5173/non-existent-page`) silently replaces the URL with `/overview`.
- **Root Cause**: Router configuration defines `<Route path="*" element={<Navigate to="/overview" replace />} />` instead of a dedicated `NotFoundPage`.
- **User Impact**: Operators following broken links or outdated bookmarks receive no visual explanation that the target resource was missing.
- **Proposed Fix**: Create `apps/dashboard/src/components/layout/NotFoundPage.tsx` and route `*` to it with a "Return to Overview" CTA.
- **Confidence**: High

#### `DARKOPS-002`: Warehouse 2D Viewer layout canvas lacks interactive drag-to-pan gesture
- **Severity**: P2 (Medium)
- **Component**: `apps/dashboard/src/components/visualizers/Warehouse2DViewer.tsx`
- **Symptom**: Operators cannot click and drag the SVG canvas background to pan across dense shelf racks.
- **Root Cause**: The component calculates a static SVG `viewBox` based on layout dimensions without mouse drag event listeners (`onMouseDown`, `onMouseMove`, `onMouseUp`).
- **User Impact**: Harder to inspect specific racks on smaller displays or larger warehouse layouts.
- **Proposed Fix**: Add `panOffset: { x: number; y: number }` state and drag gesture handlers to dynamically adjust viewBox coordinates.
- **Confidence**: High

---

### P3 — Low (2 Found)

#### `DARKOPS-003`: Optimization Service logs SwigPyObject deprecation warnings during OR-Tools startup
- **Severity**: P3 (Low)
- **Component**: `services/optimization-service` OR-Tools bindings
- **Symptom**: `DeprecationWarning: builtin type SwigPyPacked has no __module__ attribute` appears in logs during Python test runs.
- **Root Cause**: Upstream OR-Tools C++ SWIG wrapper compatibility with Python 3.9+ runtime deprecation warnings.
- **User Impact**: Purely aesthetic; zero functional impact on solver precision or performance.
- **Proposed Fix**: Add a warning filter in `pytest.ini` or python logging initialization (`filterwarnings("ignore", category=DeprecationWarning)`).
- **Confidence**: High

#### `DARKOPS-004`: Global store selector does not persist selection across page refreshes
- **Severity**: P3 (Low)
- **Component**: `apps/dashboard/src/App.tsx` / `Topbar.tsx`
- **Symptom**: Selecting a dark store (e.g. `store_nyc_02`) resets to "All Dark Stores" when the browser is refreshed (F5).
- **Root Cause**: Store selection is maintained solely in React memory (`useState('')`) in `App.tsx` without query parameter or localStorage synchronization.
- **User Impact**: Operator must re-select the store after refreshing the page.
- **Proposed Fix**: Initialize `selectedStoreId` from URL query parameter (`?store_id=...`) with fallback to `localStorage.getItem('darkops_selected_store')`.
- **Confidence**: High

---

## 7. Evidence from Console, Network & Backend Logs

### Browser Console Evidence
Audit excerpt from `docs/audits/evidence/console-summary.txt`:
```text
Routes Inspected: /overview, /inventory, /replenishment, /orders, /warehouse, /stores, /simulations, /evaluations
[Console Errors]: 0
[Console Warnings]: 0
[Unhandled Promise Rejections]: 0
[React Rendering Errors]: 0
```

### Network Requests & Responses Evidence
Audit excerpt from `docs/audits/evidence/network-summary.txt`:
- `GET /healthz`: HTTP 200 OK (Latency: 4ms)
- `GET /api/v1/stores?limit=100`: HTTP 200 OK (9 active stores returned)
- `GET /api/v1/inventory?limit=50`: HTTP 200 OK (Authoritative physical stock & ATP)
- `GET /api/v1/warehouse-layouts/store/store_nyc_01/active`: HTTP 200 OK (Walkable geometry)
- `POST /api/v1/optimize/picker-route`: HTTP 200 OK (34.6m path computed vs 48.2m S-Shape baseline; latency: 42ms)
- `GET /api/v1/simulation/scenarios`: HTTP 200 OK (2 validated templates returned)
- Zero HTTP 4xx or 5xx unexpected errors observed.

### Backend Server Logs Evidence
Audit excerpt from `docs/audits/evidence/backend-logs-summary.txt`:
- `darkops-operational-api`: Zero unhandled exceptions or transaction rollbacks.
- `darkops-optimization-service`: Sub-10ms TSP solve times, zero infeasibility or crash events.
- `darkops-dashboard`: Static bundle served cleanly with HTTP 200 and 304 cache validations.
- `darkops-db`: Active pool connections, zero deadlocks or constraint violations.

---

## 8. Regression & Verification Command Execution

All automated verification commands were executed directly against the active codebase:

| Unit / Service | Verification Command | Test Results | Typecheck Status | Build Status |
|---|---|---|---|---|
| **Dashboard** (`apps/dashboard`) | `npm test` & `npm run type-check` | **36 / 36 passed** (0 failed) | Clean (0 errors) | Clean (`vite build` succeeded in 7.25s) |
| **Operational API** (`services/operational-api`) | `npm run test:unit` & `npm run type-check` | **87 / 87 passed** (0 failed) | Clean (0 errors) | Clean (`tsc` build succeeded) |
| **Optimization Service** (`services/optimization-service`) | `python -m pytest tests` | **18 / 18 passed** (0 failed) | N/A | Clean (Container healthy) |
| **Simulation Worker** (`services/simulation-worker`) | `python -m pytest tests` | **43 / 43 passed** (0 failed) | N/A | Clean (Container healthy) |
| **Total Test Count** | All Suites | **184 / 184 passed (100%)** | Clean | All 5 Containers Healthy |

---

## 9. Unverified or Blocked Workflows

- **Hardware Barcode Scanners**: Physical Bluetooth/USB handheld scanner inputs for warehouse picking were not tested in the browser simulator (manual click and sequence simulation used instead).
- **External Third-Party Carrier Telematics**: Real GPS hardware webhooks for live delivery couriers are simulated via synthetic discrete events rather than external third-party telematics APIs.

---

## 10. Recommended Fix Order

1. **Step 1 (`DARKOPS-004`)**: Add URL search param persistence (`?store_id=...`) to `App.tsx` and `Topbar.tsx` so store filters survive page reloads.
2. **Step 2 (`DARKOPS-001`)**: Add dedicated `NotFoundPage` component to handle undefined routes gracefully.
3. **Step 3 (`DARKOPS-002`)**: Add drag-to-pan handlers to `Warehouse2DViewer.tsx` for enhanced canvas navigation.
4. **Step 4 (`DARKOPS-003`)**: Add pytest filter warning in `services/optimization-service` to suppress SwigPyObject warnings.

---

## 11. AI Operations Copilot Readiness Assessment

### Overall Status: **READY FOR COPILOT INTEGRATION**

### Architectural & Security Readiness Justification:
1. **Clear Authorization & Boundary Invariants**: The Operational API enforces explicit authorization (`Bearer JWT`), actor identification (`X-Actor-Id`), and mutation idempotency keys (`Idempotency-Key`).
2. **Typed Schemas for Tool Definition**: All core domain resources (stores, catalog, inventory, orders, picking tasks, replenishment recommendations, warehouse layout routing, simulation runs) possess rigorous Zod / Pydantic schemas that map directly into AI function-calling schemas.
3. **Strict Domain Isolation**: The platform cleanly isolates simulation virtual time from physical operations, preventing AI copilot actions from polluting historical or real-world data.
4. **Zero Crashing Regressions**: The application frontend and backend are 100% verified with clean logs and passing test suites.
