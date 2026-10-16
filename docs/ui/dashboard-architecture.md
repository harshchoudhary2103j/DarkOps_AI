# DarkOps AI Operations Control Tower — Frontend Architecture

## 1. Overview & Architectural Boundaries

The **DarkOps AI Operations Control Tower** (`apps/dashboard`) is an enterprise-grade web application tailored for quick-commerce dark store operations managers, fulfillment supervisors, and supply chain analysts.

### 1.1 Core Principles & Bounded Context

- **Strict Presentation Boundary**: The frontend is strictly a presentation and interaction layer. It **never** calculates authoritative operational state (e.g., available stock = on_hand - reserved), generates synthetic demand, or fabricates optimization KPIs. Every state representation reflects backend domain records.
- **Operator In-the-Loop Governance**: High-impact business mutations (purchase order approval/rejection, order inventory allocation, order cancellation) require explicit confirmation modals with clear impact summaries before dispatching requests.
- **Synthetic Environment Transparency**: Every screen persistently displays the synthetic environment banner: *"Operating in Synthetic Quick-Commerce Environment — All data and metrics are simulated."*
- **Resilient Network Handling**: All asynchronous network calls are managed via TanStack Query with structured query keys, automatic retries with exponential backoff, configurable stale-while-revalidate lifecycles, and typed REST client wrappers.

### 1.2 Component Hierarchy

```mermaid
graph TD
    Root[App Root] --> Providers[ToastProvider + QueryClientProvider + Router]
    Providers --> Shell[AppShell]
    Shell --> Banner[SyntheticBanner (Sticky Top)]
    Shell --> Topbar[Topbar (Store Selector, Health Beacon, Refresh)]
    Shell --> Sidebar[Sidebar (Navigation, Active Route Indicators)]
    Shell --> MainContent[Dynamic Route View]
    MainContent --> Overview[/overview - Control Tower Metrics & Backlog]
    MainContent --> Inventory[/inventory - Stock Table, Movement Ledger]
    MainContent --> Replenishment[/replenishment - Inbound POs, Approval Modals]
    MainContent --> Orders[/orders - Order Fulfillment Lifecycle, Allocation]
    MainContent --> Warehouse[/warehouse - Interactive 2D Layout & TSP Optimizer]
    MainContent --> Stores[/stores - Dark Store Geospatial Catchment Map]
    MainContent --> Evaluations[/evaluations - Simulation & Policy Evaluation Reports]
```

---

## 2. Design System & Styling Conventions

The visual design delivers a high-density, mission-critical SaaS operations terminal using a deep navy/slate palette with calibrated accents.

### 2.1 Surface Elevation & Color Palette

| Token / Layer | Hex Value | Purpose & Usage |
|:---|:---|:---|
| **App Shell Background** | `#060A12` (`navy-950`) | Global backdrop, minimal distraction, deep contrast |
| **Panel / Sidebar / Topbar** | `#0C1220` (`navy-900`) | Main containers, elevated panels, navigation bars |
| **Card / Container Surface** | `#11182B` (`navy-800`) | Data cards, tables, modal dialog surfaces |
| **Card Elevated / Interactive**| `#182238` (`navy-700`) | Card hover states, table header rows, input backgrounds |
| **Borders & Dividers** | `#1E293B` (`navy-600`) | Subtle structural dividing lines |
| **Primary Brand Blue** | `#3B82F6` (`brand-500`) | Primary actions, key indicators, active navigation tabs |
| **Cyan Accent** | `#06B6D4` (`cyan-500`) | Picker route paths, optimizer targets, coordinates |
| **Emerald (Success)** | `#10B981` (`status-success`)| Completed states, approved POs, stock healthy indicators |
| **Amber (Warning)** | `#F59E0B` (`status-warning`)| Low stock alerts, pending approvals, draft states |
| **Rose (Danger)** | `#EF4444` (`status-danger`) | Stockouts, cancelled orders, rejected POs, error states |

### 2.2 Typography & Number Formatting

- **Font Family**: Modern sans-serif stack (`Inter`, system UI font) with high legibility across data-heavy tables.
- **Tabular Figures (`tabular-nums`)**: Applied across all metrics, coordinates, inventory quantities, and timestamps to eliminate visual jitter during auto-refreshes.
- **Formatting Utilities (`src/lib/formatters.ts`)**:
  - `formatNumber(value)`: Formats counts with localized thousands separators.
  - `formatCurrency(cents)`: Converts integer cents to `$XX.XX`.
  - `formatDuration(seconds)`: Formats times into `Xm Ys` or `Xs`.
  - `formatDistance(meters)`: Displays warehouse walking distance as `XX.X m`.
  - `formatPercentage(value)`: Formats rates and deltas as `+X.X%` or `-X.X%`.

---

## 3. Views & Route Structure

| Route | View Name | Purpose & Capabilities | Operational API / Service Endpoints Used |
|:---|:---|:---|:---|
| `/overview` | **Operations Control Tower** | Executive summary of active stores, open orders, stockout risks, picker activity, and recent audit activity. | `GET /stores`<br>`GET /inventory/low-stock`<br>`GET /orders?status=CREATED&limit=10`<br>`GET /audit-logs?limit=8` |
| `/inventory` | **Inventory Positions** | Real-time on-hand and reserved inventory positions, search by SKU/name, low-stock filter, and SKU movement ledger history. | `GET /stores`<br>`GET /inventory/positions?store_id=X`<br>`GET /inventory/movements?sku_id=Y&store_id=X` |
| `/replenishment` | **Inbound Replenishment** | Review PO recommendations generated by optimization policies, filter by status, approve/reject with operator dialog, generate recommendations. | `GET /stores`<br>`GET /replenishment/recommendations?store_id=X`<br>`POST /replenishment/generate`<br>`POST /replenishment/recommendations/:id/approve`<br>`POST /replenishment/recommendations/:id/reject` |
| `/orders` | **Order Fulfillment** | Real-time order lifecycle tracking (Created, Allocated, Picking, Picked, Dispatched, Delivered, Cancelled), item breakdown, picking tasks, order allocation, cancellation. | `GET /stores`<br>`GET /orders?store_id=X&status=Y`<br>`GET /orders/:id`<br>`POST /orders/:id/allocate`<br>`POST /orders/:id/cancel` |
| `/warehouse` | **Warehouse & Picker Routing** | Interactive 2D warehouse viewer with rack grid, depot station, pick targets, TSP solver vs S-Shape heuristic route comparison, animated picker simulation. | `GET /stores`<br>`GET /stores/:id/layout`<br>`POST /api/v1/optimize/picker-routing` (Optimization Service) |
| `/stores` | **Store Network Map** | Geospatial dark store network map with real geographic coordinates, GeoJSON service zone polygons, store health, and store detail inspector. | `GET /stores`<br>`GET /stores/:id/service-zones` |
| `/evaluations` | **Simulation & Policy Lab** | Comparison reports between Baseline and Optimized policies across Fill Rate, Picking Efficiency, Stockouts, and Replenishment Cost. | `POST /evaluations/compare` |

---

## 4. Visualizers & Specialized Visual Components

### 4.1 Warehouse 2D Layout Viewer (`Warehouse2DViewer.tsx`)

The warehouse visualizer renders a 2D digital twin of a quick-commerce dark store layout directly inside an SVG container:

1. **Coordinate System & Dimensions**:
   - The warehouse is defined by width $W$ (meters) and height $H$ (meters).
   - SVG `viewBox="0 0 W H"` maps warehouse metric coordinates directly to vector space with preserving aspect ratio.
2. **Rack Infrastructure**:
   - Storage racks are rendered as dark slate rectangles (`#182238`) with subtle blue borders (`#3B82F6`).
   - Aisle pathways and safety walking corridors are transparent grid lines with low opacity.
3. **Depot & Packing Stations**:
   - The packing/dispatch depot is anchored at $(X_0, Y_0)$ and rendered with a distinct emerald badge and target icon.
4. **Pick Target Markers**:
   - Each pick item is marked with an energetic cyan circle marker displaying its 1-indexed pick sequence number.
5. **Route Visualization & Heuristic Comparison**:
   - **S-Shape Heuristic Route**: Renders as an amber dashed path (`stroke-dasharray="4,4"`).
   - **OR-Tools Optimal TSP Route**: Renders as a solid cyan path with directional arrows and glow filter.
   - **Interactive Comparison**: The metrics panel displays the exact distance difference (e.g., `42.5m` vs `61.0m`, `-30.3%` reduction).
6. **Animated Playback**:
   - When Play is clicked, an animated picker cursor traverses the route path node-by-node using elapsed interval timing, demonstrating picker travel sequence.

### 4.2 Geospatial Dark Store Network Map (`StoreGeoMap.tsx`)

1. **Projection Engine**:
   - Uses an equirectangular flat-projection algorithm mapping longitude $\lambda$ to $X$ and latitude $\phi$ to $Y$:
     $$X = \frac{\lambda - \lambda_{\min}}{\lambda_{\max} - \lambda_{\min}} \cdot W$$
     $$Y = \left(1 - \frac{\phi - \phi_{\min}}{\phi_{\max} - \phi_{\min}}\right) \cdot H$$
2. **GeoJSON Catchment Service Zones**:
   - Polygons and MultiPolygons parsed from store service zones are rendered as semi-transparent colored polygons (`fill="rgba(59, 130, 246, 0.12)"`, `stroke="#3B82F6"`).
3. **Store Markers & Interactive Cards**:
   - Stores are marked with glowing SVG pins color-coded by operational status (`ACTIVE`, `INACTIVE`, `MAINTENANCE`).
   - Clicking a store pin selects it in the global topbar store selector and triggers the detailed store inspection card.

---

## 5. Non-Negotiable Invariants & Safety Rules

1. **No Client-Side Inventory Arithmetic**:
   - Available inventory must **never** be calculated as `on_hand - reserved` on the client. It is rendered directly from `position.available` returned by the Operational API.
2. **No Fabricated KPIs or Metrics**:
   - Every metric on the `/evaluations` and `/overview` pages is retrieved from backend evaluation runs.
   - Simulation estimate disclaimers are prominently displayed above all evaluation comparisons.
3. **Operator Mutation Confirmation**:
   - Mutating actions (order cancellation, order allocation, PO approval/rejection) require confirmation via `ConfirmDialog` before emitting HTTP requests.
4. **Idempotency & Tracing**:
   - Every mutating request includes an `x-correlation-id` and a client-generated UUID `idempotency-key` to prevent duplicate processing on retried requests.
5. **Accessible Controls**:
   - All interactive inputs, buttons, filters, and modal triggers have unique, descriptive `id` attributes and accessible `aria-label` / screen-reader names.

---

## 6. Local Development & Verification

### 6.1 Prerequisites & Environment Setup

Configure environment variables in `.env` or `apps/dashboard/.env`:

```bash
VITE_API_URL=http://localhost:3000
VITE_OPTIMIZATION_API_URL=http://localhost:8000
```

### 6.2 Development Commands

```bash
# In workspace root or apps/dashboard:
cd apps/dashboard

# Install dependencies
npm install

# Run Vite development server (port 5173)
npm run dev

# Run TypeScript type verification
npm run type-check

# Run Vitest automated test suite
npm test

# Build production bundle
npm run build

# Preview production build locally
npm run preview
```

### 6.3 Docker Compose Integration

The dashboard is integrated into the multi-container compose architecture:

```bash
# Build and run the dashboard service container
docker compose build dashboard
docker compose up -d dashboard

# Check container status and logs
docker compose ps dashboard
docker compose logs -f dashboard
```
