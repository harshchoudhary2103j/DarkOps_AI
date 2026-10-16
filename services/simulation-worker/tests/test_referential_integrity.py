"""
Referential integrity and foreign key validation tests.
"""

from src.seeder.config import ScenarioConfig
from src.seeder.generator import generate_world


def test_referential_integrity_all_entities():
    config = ScenarioConfig(
        scenario_id="ref-test",
        scenario_name="Referential Integrity Test",
        seed=42,
        num_stores=2,
        num_skus=12,
        num_suppliers=3,
        history_horizon_days=14
    )

    world = generate_world(config)

    store_ids = {s.id for s in world.stores}
    sku_ids = {s.id for s in world.skus}
    product_ids = {p.id for p in world.products}
    supplier_ids = {s.id for s in world.suppliers}

    # All service zones map to valid stores
    for zone in world.service_zones:
        assert zone.store_id in store_ids

    # All SKUs map to valid products
    for sku in world.skus:
        assert sku.product_id in product_ids

    # All warehouse layouts map to valid stores
    for layout in world.warehouse_layouts:
        assert layout.store_id in store_ids

    # All supplier SKUs map to valid suppliers and SKUs
    for ss in world.supplier_skus:
        assert ss.supplier_id in supplier_ids
        assert ss.sku_id in sku_ids

    # All initial inventory positions map to valid stores and SKUs
    for inv in world.initial_inventory:
        assert inv.store_id in store_ids
        assert inv.sku_id in sku_ids
        assert inv.initial_physical_on_hand >= config.initial_stock_min
        assert inv.initial_physical_on_hand <= config.initial_stock_max

    # All purchase orders map to valid stores and suppliers
    for po in world.purchase_orders:
        assert po.store_id in store_ids
        assert po.supplier_id in supplier_ids
        for line in po.lines:
            assert line.sku_id in sku_ids

    # All historical sales map to valid stores and SKUs
    for sale in world.historical_sales:
        assert sale.store_id in store_ids
        assert sale.sku_id in sku_ids
        assert sale.units_sold >= 0
