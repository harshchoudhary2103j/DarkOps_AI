# Synthetic World Seeder & Generator

## 1. Purpose and Scope

The **Synthetic World Seeder** (located in `services/simulation-worker/src/seeder/`) is a deterministic, offline synthetic environment generator for DarkOps AI. It creates realistic quick-commerce dark store topologies and data payloads, including:

- Multi-facility dark stores and closed GeoJSON delivery polygons.
- Catalog hierarchies with perishable and ambient categories, temperature zones, dimensions, and unit costs.
- 3D warehouse layouts with traversable navigation graphs connecting dispatch/packing stations to picking aisles and shelf racks.
- Deterministic initial stock positions complying with Inventory Core double-entry ledger invariants.
- Multi-supplier registries with lead times, minimum order quantities (MOQ), and purchase order schedules.
- 14 to 30 days of synthetic historical sales observations with day-of-week multipliers.

The generator guarantees 100% reproducible, byte-for-byte identical canonical JSON payloads when given the same random seed and scenario configuration. It produces artifacts that can either be loaded directly by offline simulation workers or imported through the Operational API via standard REST endpoints.

---

## 2. Module Organization

The seeder module is structured under `services/simulation-worker/src/seeder/`:

```
services/simulation-worker/src/seeder/
├── __init__.py               # Package export definition
├── canonical.py              # Canonical JSON formatter (sort_keys=True) & SHA-256 fingerprinting
├── cli.py                    # Unified CLI command suite (generate, validate, import, run-all)
├── config.py                 # ScenarioConfig validated with Pydantic v2
├── generator.py              # WorldGenerator coordinating deterministic domain generators
├── importer.py               # Dependency-aware, retry-safe Operational API import pipeline
├── models.py                 # Domain Pydantic models matching Operational API REST schemas
├── validation.py             # BFS graph reachability & referential integrity validators
└── generators/
    ├── __init__.py
    ├── catalog.py            # Category, SKU, and unit pricing generation
    ├── inventory.py          # Deterministic initial inventory distribution across nodes
    ├── layout.py             # 3D grid, aisle, shelf placement, and Euclidean edge construction
    ├── sales_history.py      # 14–30 day synthetic daily sales observations
    ├── stores.py             # Virtual dark stores and closed polygon service zones
    └── suppliers.py          # Supplier master records, SKU assignments, and PO schedules
```

---

## 3. Scenario Configuration Format

Scenarios are defined in JSON and validated using `ScenarioConfig`:

```json
{
  "scenario_id": "manhattan_baseline",
  "seed": 42,
  "store_count": 2,
  "sku_count": 16,
  "supplier_count": 3,
  "history_days": 30,
  "warehouse_dims": {
    "width_meters": 30.0,
    "depth_meters": 20.0,
    "height_meters": 4.0,
    "num_aisles": 3,
    "shelves_per_aisle": 4
  },
  "sales_profile": {
    "base_daily_sales_min": 5,
    "base_daily_sales_max": 25,
    "weekend_multiplier": 1.4,
    "weekday_multipliers": {
      "0": 0.9,
      "1": 0.85,
      "2": 0.95,
      "3": 1.05,
      "4": 1.25,
      "5": 1.4,
      "6": 1.35
    }
  },
  "initial_stock_range": {
    "min_units": 20,
    "max_units": 80
  }
}
```

### Available Templates

- `scenarios/small_fast.json`: Minimal scenario (1 store, 4 SKUs, 2 suppliers, 14 days history) for rapid local unit testing, CI checks, and quick validation loops.
- `scenarios/default_manhattan.json`: Standard scenario (2 stores, 16 SKUs, 3 suppliers, 30 days history) representing an urban multi-store environment with ambient, chilled, and frozen SKUs.

---

## 4. Determinism Guarantees & Seed Controls

Determinism is strictly preserved through the following invariants:
1. **Isolated Random Instance**: All random decisions draw from a dedicated `random.Random(seed)` instance instantiated per scenario run. The global `random` module state is never modified or relied upon.
2. **Deterministic Sequence Ordering**: Entities are generated in fixed, sorted loops (store indices, category keys, SKU indices, aisle and shelf coordinates).
3. **Canonical JSON Serialization**: The output is serialized using UTF-8, `sort_keys=True`, and 2-space indentation.
4. **SHA-256 Fingerprint**: Every generated world carries a SHA-256 digest computed from its canonical representation. Two generation runs with identical seed and configuration will produce bit-for-bit identical JSON and matching SHA-256 hashes.

---

## 5. Warehouse Coordinates & Graph Invariants

### Coordinate Conventions
The coordinate space is 3D cartesian $(x, y, z)$ measured in meters:
- $x \in [0, \text{width\_meters}]$: Aisle spacing and lateral traversal.
- $y \in [0, \text{depth\_meters}]$: Aisle corridors and shelf depth.
- $z \in [0, \text{height\_meters}]$: Vertical shelf levels (floor traversal occurs at $z = 0.0$; shelf picking occurs at shelf elevation).

### Graph Invariants
1. **Dispatch Station**: Every store has a dispatch station `DS-01` situated near $(x=2.0, y=2.0, z=0.0)$.
2. **Aisle Corridors & Shelves**: Aisle junctions and waypoints connect shelves to main arterial aisles.
3. **Euclidean Distance Weighting**: All edges represent traversable physical corridors with distance $d = \sqrt{\Delta x^2 + \Delta y^2 + \Delta z^2}$.
4. **BFS Reachability**: Before canonical export or API import, a Breadth-First Search (BFS) traverses the layout graph starting from the dispatch station. If any shelf node is unreachable, generation is rejected immediately with a validation error.
5. **Single Connected Component**: The layout graph must consist of exactly one connected component containing all nodes and edges.

---

## 6. Inventory Initialization & Ledger Invariants

Initial inventory positions are imported through the Operational API `POST /api/v1/inventory/initialize` endpoint:
- **Batch Processing**: Initial stock assignments are grouped into an atomic initialization batch with reference `INV-INIT-<SCENARIO_ID>`.
- **Double-Entry Ledger Integrity**: Every placement records an initial ledger movement with zero discrepancies.
- **Idempotency**: Retrying an import with the same batch reference succeeds without duplicating stock or double-crediting balances.
- **Reconciliation Verification**: The importer validates `GET /api/v1/inventory/reconciliation` to verify `is_balanced: true` and 0 discrepancy items.

---

## 7. Historical Sales & Simulation Isolation

Historical sales are pre-generated observations for replenishment baseline calculations:
- Synthesizes 14–30 days of daily sales per SKU/store using base rates and day-of-week demand multipliers.
- **Strict Boundary Invariant**: Historical sales are stored strictly within the simulation scenario payload (`SyntheticWorld.historical_sales`). They are **never** injected into operational order tables or reported as operational revenue/KPIs.

---

## 8. CLI Usage

The seeder CLI is accessible from `services/simulation-worker/`:

```bash
# 1. Generate canonical synthetic world artifact
python -m src.seeder.cli generate \
  --config scenarios/default_manhattan.json \
  --output artifacts/manhattan_world.json

# 2. Validate artifact schema, referential integrity, and graph BFS
python -m src.seeder.cli validate \
  --input artifacts/manhattan_world.json

# 3. Import artifact into Operational API (with optional dry-run)
python -m src.seeder.cli import \
  --input artifacts/manhattan_world.json \
  --api-url http://localhost:4000/api/v1 \
  --dry-run

python -m src.seeder.cli import \
  --input artifacts/manhattan_world.json \
  --api-url http://localhost:4000/api/v1

# 4. End-to-end generate, validate, and import in one step
python -m src.seeder.cli run-all \
  --config scenarios/small_fast.json \
  --output artifacts/small_fast_world.json \
  --api-url http://localhost:4000/api/v1
```

---

## 9. API Import Sequence

When importing into the Operational API, entities are ingested in strict topological dependency order:

1. `POST /api/v1/stores`: Create dark store entities.
2. `POST /api/v1/service-zones`: Create store delivery polygons.
3. `POST /api/v1/products`: Create parent product definitions.
4. `POST /api/v1/skus`: Create sellable SKU records (with unique codes namespaced to the scenario).
5. `POST /api/v1/suppliers`: Register supplier master records and review cadences.
6. `POST /api/v1/suppliers/:id/skus`: Associate suppliers to SKUs with unit costs and lead times.
7. `POST /api/v1/warehouse-layouts`: Register warehouse graph nodes and edges.
8. `POST /api/v1/inventory/initialize`: Seed initial stock and verify ledger balance.

If an entity already exists (HTTP 409 Conflict), the importer skips it safely, ensuring full idempotent re-runnability.

---

## 10. Known Limitations & Deferred Features

- **Dynamic Order Simulation**: Handled in Phase 05 (Discrete-Event Simulation Engine) via SimPy/DES event queues.
- **Route Optimization**: Real-time picker route optimization (TSP/A* routing) is deferred to Phase 06 (OR-Tools integration).
- **Physical Obstacle Meshes**: Warehouse layouts model 3D network topology graphs rather than full geometric collision meshes.
