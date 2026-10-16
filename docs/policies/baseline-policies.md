# Baseline Heuristic Policies Specification

This document details the operational baseline heuristics implemented in the DarkOps AI simulation and decision-support engine (`services/simulation-worker/src/policies/`).

> **Note**: These baseline heuristics provide transparent, deterministic, and domain-valid reference implementations for quick-commerce dark store operations. They serve as the comparative benchmark against which advanced mathematical optimization models (OR-Tools MILP, multi-commodity flow, VRP solvers) are evaluated in subsequent phases. They are **not** claimed to be globally optimal.

---

## 1. Architectural Overview & Configuration Versioning

All baseline policies are encapsulated under `src/policies/` and adhere to immutable domain boundaries:
- Pure calculations and decision evaluations decoupled from operational persistence tables.
- Synchronous, deterministic execution without wall-clock sleeps or nondeterministic calls.
- Integrated into the discrete-event simulation engine via [SimulationPolicyAdapter](file:///c:/Users/harsh/Desktop/DarkOps_AI/services/simulation-worker/src/policies/adapters.py#L26-L282).

### 1.1 Policy Configuration: `BaselinePolicyConfig`

Policies are configured via the immutable [BaselinePolicyConfig](file:///c:/Users/harsh/Desktop/DarkOps_AI/services/simulation-worker/src/policies/config.py#L5-L28) schema:

| Parameter | Type | Default | Unit | Description |
| :--- | :--- | :--- | :--- | :--- |
| `replenishment_enabled` | bool | `True` | boolean | Enables automatic replenishment evaluation on inventory movements |
| `moving_average_window_days` | int | `14` | days | Historical sales observation window for demand estimation |
| `safety_stock_factor` | float | `1.5` | unitless ($Z$) | Multiplier for safety stock sizing ($Z \cdot \bar{d} \cdot \sqrt{L}$) |
| `default_lead_time_days` | float | `0.167` | days (~4h) | Fallback supplier delivery lead time when supplier metadata is absent |
| `default_daily_demand_fallback`| float | `5.0` | units/day | Fallback daily demand $\bar{d}$ when history is absent |
| `order_up_to_multiplier` | float | `3.0` | unitless ($M$) | Multiplier for order-up-to level buffer |
| `min_order_quantity_default` | int | `10` | units | Default minimum order quantity (MOQ) |
| `pack_size_default` | int | `1` | units | Default supplier case pack size rounding increment |
| `max_service_distance_km` | float | `15.0` | km | Maximum delivery radius from dark store |
| `walking_speed_mps` | float | `1.2` | m/s | Picker transit velocity across warehouse graph edges |
| `item_pick_time_seconds` | float | `10.0` | seconds | Handling duration to scan and pick an item at shelf |
| `dispatch_delay_seconds` | float | `60.0` | seconds | Buffer between order allocation and picker assignment |

---

## 2. Baseline Replenishment: Static Reorder Point $(s, S)$ Policy

Implemented in [BaselineReplenishmentPolicy](file:///c:/Users/harsh/Desktop/DarkOps_AI/services/simulation-worker/src/policies/replenishment.py#L22-L161).

### 2.1 Mathematical Definitions

For each store $j$ and SKU $k$:

1. **Moving Average Demand Rate ($\bar{d}_{j,k}$)**:
   Computed over the $W = 14$ most recent historical sales observations:
   $$\bar{d}_{j,k} = \max\left(0.1, \frac{1}{\min(N, W)} \sum_{t=N-W+1}^{N} \text{units\_sold}_{j,k,t}\right)$$
   If no historical sales exist for $(j, k)$, fallback value $\bar{d} = 5.0$ units/day is applied.

2. **Lead Time ($L_k$)**:
   Supplier lead time in days. Default is $L = 0.167$ days (4 virtual hours).

3. **Safety Stock ($SS_{j,k}$)**:
   Buffers against lead-time and demand variability:
   $$SS_{j,k} = \left\lceil Z \cdot \bar{d}_{j,k} \cdot \sqrt{\max(0.01, L_k)} \right\rceil \quad \text{where } Z = 1.5$$

4. **Reorder Point ($s_{j,k}$)**:
   The threshold triggering a purchase order:
   $$s_{j,k} = \left\lceil \bar{d}_{j,k} \cdot L_k + SS_{j,k} \right\rceil$$

5. **Order-Up-To Level ($S_{j,k}$)**:
   Target post-replenishment inventory position:
   $$S_{j,k} = s_{j,k} + \max\left(5, \left\lceil M \cdot \bar{d}_{j,k} \cdot \max(0.5, L_k) \right\rceil\right) \quad \text{where } M = 3.0$$

6. **Inventory Position ($IP_{j,k}$)**:
   Strictly tracks on-hand, commitments, and pipeline stock:
   $$IP_{j,k} = \text{physical\_on\_hand}_{j,k} - \text{reserved\_stock}_{j,k} + \text{incoming\_units}_{j,k}$$

7. **Replenishment Trigger & Order Quantity ($Q$)**:
   Replenishment is triggered if and only if:
   $$IP_{j,k} < s_{j,k}$$
   The initial deficit is:
   $$Q_{\text{raw}} = S_{j,k} - IP_{j,k}$$
   Applying Minimum Order Quantity (MOQ) and Case Pack Size ($P$):
   $$Q = \left\lceil \frac{\max(\text{MOQ}, Q_{\text{raw}})}{P} \right\rceil \cdot P$$

### 2.2 In-Flight Purchase Order Semantics
To prevent duplicate reorders while a PO is in transit, $\text{incoming\_units}$ is immediately incremented in the inventory position upon PO generation. When the virtual clock advances to $t + L$, the `SUPPLIER_DELIVERY_DUE` event triggers `STOCK_RECEIVED`, which decrements $\text{incoming\_units}$ by $Q$ and increments $\text{physical\_on\_hand}$ by $Q$, maintaining invariant stability throughout.

---

## 3. Baseline Allocation: Greedy Nearest-Eligible Store Policy

Implemented in [BaselineOrderAllocationPolicy](file:///c:/Users/harsh/Desktop/DarkOps_AI/services/simulation-worker/src/policies/allocation.py#L57-L207).

### 3.1 Eligibility Invariants

For an incoming customer order with latitude $\phi_c$, longitude $\lambda_c$, and item basket $B = \{(k_i, q_i)\}$:

1. **Geographic Coverage**:
   - If `delivery_zone_id` is specified, the store assigned to that zone must match.
   - Otherwise, the Haversine distance $D(c, j)$ between customer $(\phi_c, \lambda_c)$ and dark store $(\phi_j, \lambda_j)$ must satisfy:
     $$D(c, j) \le \text{max\_service\_distance\_km} = 15.0 \text{ km}$$
   - Haversine equation ($R = 6371.0\text{ km}$):
     $$a = \sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_c)\cos(\phi_j)\sin^2\left(\frac{\Delta \lambda}{2}\right)$$
     $$D(c, j) = 2 R \cdot \text{atan2}(\sqrt{a}, \sqrt{1 - a})$$

2. **Complete Basket Inventory Availability**:
   Store $j$ must have sufficient unreserved inventory across **all** basket lines simultaneously:
   $$\forall (k_i, q_i) \in B: \quad \text{available\_stock}_{j, k_i} \ge q_i$$
   where $\text{available\_stock} = \text{physical\_on\_hand} - \text{reserved\_stock}$.
   **Split orders across multiple stores are strictly prohibited.**

3. **Deterministic Tie-Breaking**:
   Eligible candidate stores are sorted by:
   $$\text{sort\_key} = (D(c, j), \text{store\_id})$$
   The store with the minimal Haversine distance is selected. In the event of an exact distance tie, alphabetical `store_id` guarantees deterministic resolution.

4. **Atomic Reservation with Rollback**:
   The policy attempts to reserve stock line by line on the winning store. If any line fails due to concurrent depletion, all reservations made for preceding lines in the order are immediately rolled back (`release_stock`), and the policy attempts the next eligible candidate store. If all eligible stores fail, the order transitions to `FAILED` with explicit code `RESERVATION_FAILED`.

---

## 4. Baseline Routing: S-Shape (Serpentine) Picker Policy

Implemented in [BaselinePickerRoutingPolicy](file:///c:/Users/harsh/Desktop/DarkOps_AI/services/simulation-worker/src/policies/routing.py#L115-L276).

### 4.1 Routing Algorithm

1. **Dispatch Station Anchors**:
   Every picking route begins and ends at the store's designated `DISPATCH_STATION` node.

2. **Aisle Sorting & Serpentine Direction**:
   - Item shelf locations are resolved to graph nodes.
   - Shelf nodes are grouped by `aisle_id`.
   - Aisles are ordered by average horizontal coordinate $x$.
   - Along alternating aisles, pick stops are sorted in serpentine order:
     - Odd aisle index: ascending $y$ (forward traversal)
     - Even aisle index: descending $y$ (backward traversal)

3. **Graph-Edge Shortest Path Stitching**:
   Consecutive stops in the sequence $[\text{dispatch}, s_1, s_2, \dots, s_n, \text{dispatch}]$ are connected using **Dijkstra's Shortest Path Algorithm** on the layout adjacency graph. No straight-line/Euclidean jumps through shelves or walls are permitted.

4. **Duration & Metric Calculation**:
   - Total travel distance: sum of edge weights traversed ($d_{\text{total}}$ in meters).
   - Travel duration: $t_{\text{travel}} = d_{\text{total}} / v_{\text{walk}}$ where $v_{\text{walk}} = 1.2\text{ m/s}$.
   - Pick duration: $t_{\text{pick}} = \sum_{i} q_i \cdot 10.0\text{ seconds}$.
   - Total picking duration: $t_{\text{total}} = t_{\text{travel}} + t_{\text{pick}}$.

5. **Path Validation Guarantees**:
   The route is validated against strict topological invariants prior to dispatch:
   - First node is `DISPATCH_STATION`.
   - Last node is `DISPATCH_STATION`.
   - Every consecutive pair of nodes $(u, v)$ has an active physical graph edge.
   - All requested shelf nodes are visited.
   - Missing or disconnected shelves raise explicit domain errors ([ShelfNotFoundError](file:///c:/Users/harsh/Desktop/DarkOps_AI/services/simulation-worker/src/policies/routing.py#L13-L14) or [NodeUnreachableError](file:///c:/Users/harsh/Desktop/DarkOps_AI/services/simulation-worker/src/policies/routing.py#L17-L18)).

---

## 5. End-to-End Operating-Day Scenario & Reproduction

A complete 24-hour simulated operating day is verified in [test_end_to_end_operating_day.py](file:///c:/Users/harsh/Desktop/DarkOps_AI/services/simulation-worker/tests/test_end_to_end_operating_day.py).

### 5.1 Reproduction Command

To reproduce the exact deterministic simulation run:

```bash
cd services/simulation-worker
python -m pytest tests/test_end_to_end_operating_day.py -v
```

### 5.2 Observed Operational Metrics (Seed 42)

| Metric | Measured Value | Acceptance Threshold |
| :--- | :--- | :--- |
| **Virtual Runtime** | 24 virtual hours | 24 hours |
| **Wall-Clock Duration** | 0.207 seconds | $< 10.0$ seconds |
| **Customer Orders Generated** | 269 orders | $\approx 200$ target |
| **Orders Successfully Fulfilled (`READY`)** | 247 orders (91.8%) | — |
| **Orders Terminal Out-of-Stock (`FAILED`)**| 22 orders (8.2%) | — |
| **Orders in Non-Terminal State** | 0 (0.0%) | 0 (100% terminal) |
| **Total Operational Events Emitted** | 2,101 events | $\ge 500$ events |
| **Stock Reserved Events** | 247 events | — |
| **Item Picked Events** | 784 events | — |
| **Replenishment Deliveries Processed** | 19 PO receipts | $\ge 1$ |
| **Ledger / Physical Stock Reconciled** | 100% invariant compliance | $0 \le \text{reserved} \le \text{physical}$ |
| **Deterministic SHA256 Fingerprint** | `56a18b22aa7f185d5e8836b789e68eb9892c1ad0845682bb952185e7ee910730` | Bitwise identical |

---

## 6. Known Limitations & Deferred Work

1. **Greedy Nearest Store vs. Global Capacity**:
   - Nearest-store heuristic does not consider picker queue saturation, vehicle availability, or batch replenishment consolidation across stores.
   - Phase 08 will introduce multi-store MIP/OR-Tools order allocation.
2. **S-Shape Routing vs. TSP / Aisle Skip**:
   - The S-shape serpentine heuristic enters every aisle containing a pick, traversing it completely even for single-item visits near the end-caps.
   - Phase 08 will introduce picker routing graph solvers (TSP/VRP with capacity).
3. **Static $(s, S)$ vs. Dynamic Multi-Echelon Replenishment**:
   - The reorder point uses static historical moving averages and does not anticipate peak demand surges or vendor volume discounts.
   - Advanced replenishment models will be added in optimization service iterations.
