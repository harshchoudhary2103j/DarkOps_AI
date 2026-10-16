"""
Schema conformity tests validating generated attributes match Operational API contracts.
"""

from src.seeder.config import ScenarioConfig
from src.seeder.generator import generate_world


def test_schema_attributes_conformity():
    config = ScenarioConfig(
        scenario_id="schema-test",
        scenario_name="Schema Test",
        seed=101,
        num_stores=1,
        num_skus=6,
        num_suppliers=2,
        history_horizon_days=14
    )

    world = generate_world(config)

    # 1. Store attributes
    for store in world.stores:
        assert -90.0 <= store.latitude <= 90.0
        assert -180.0 <= store.longitude <= 180.0
        assert store.service_area.type == "Polygon"
        # Closed polygon ring
        coords = store.service_area.coordinates[0]
        assert len(coords) >= 4
        assert coords[0] == coords[-1]

    # 2. SKU attributes
    for sku in world.skus:
        assert sku.pack_size > 0
        assert sku.shelf_life_days > 0
        assert sku.storage_temp.min <= sku.storage_temp.max
        assert sku.unit_price > 0.0
        assert sku.currency == "USD"
        assert sku.status in ("ACTIVE", "DISCONTINUED")

    # 3. Supplier attributes
    for sup in world.suppliers:
        assert sup.default_lead_time_hours > 0
        assert sup.default_moq > 0
        assert sup.review_schedule.cadence in ("DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY")
