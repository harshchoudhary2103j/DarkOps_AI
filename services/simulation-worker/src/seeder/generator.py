"""
Main orchestrator for DarkOps AI Synthetic World Generation.
"""

import random
from typing import Dict
from .config import ScenarioConfig
from .models import SyntheticWorld
from .generators.stores import generate_stores
from .generators.catalog import generate_catalog
from .generators.layout import generate_warehouse_layout
from .generators.inventory import generate_initial_inventory
from .generators.suppliers import generate_suppliers
from .generators.sales_history import generate_sales_history
from .validation import validate_world


def generate_world(config: ScenarioConfig) -> SyntheticWorld:
    """
    Generates a complete, deterministic synthetic world according to the scenario configuration.
    Uses an isolated random.Random(config.seed) instance to guarantee byte-for-byte reproducibility.
    """
    rng = random.Random(config.seed)

    # 1. Stores and service areas
    stores, service_zones = generate_stores(config, rng)

    # 2. Products and SKUs
    products, skus = generate_catalog(config, rng)

    # 3. Warehouse layouts and SKU shelf assignments per store
    layouts = []
    combined_sku_to_shelf: Dict[str, str] = {}
    for store in stores:
        layout, sku_map = generate_warehouse_layout(store.id, skus, config, rng)
        layouts.append(layout)
        # Store primary layout mapping
        for sku_id, shelf_id in sku_map.items():
            combined_sku_to_shelf[f"{store.id}:{sku_id}"] = shelf_id

    layouts.sort(key=lambda l: l.id)

    # 4. Initial inventory positions
    initial_inventory = generate_initial_inventory(stores, skus, config, rng)

    # 5. Suppliers, supplier-SKU linkages, and planned PO schedules
    suppliers, supplier_skus, purchase_orders = generate_suppliers(stores, skus, config, rng)

    # 6. Historical sales demand observations (14-30 days)
    historical_sales = generate_sales_history(stores, skus, config, rng)

    world = SyntheticWorld(
        scenario_id=config.scenario_id,
        seed=config.seed,
        stores=stores,
        service_zones=service_zones,
        products=products,
        skus=skus,
        suppliers=suppliers,
        supplier_skus=supplier_skus,
        warehouse_layouts=layouts,
        initial_inventory=initial_inventory,
        historical_sales=historical_sales,
        purchase_orders=purchase_orders,
        sku_to_shelf_mapping=combined_sku_to_shelf
    )

    # 7. Validate cross-entity referential integrity and graph connectivity
    validate_world(world)

    return world
