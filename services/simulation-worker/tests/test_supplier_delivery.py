import pytest
from datetime import datetime, timedelta, timezone

from src.seeder.config import ScenarioConfig
from src.seeder.generator import generate_world
from src.seeder.models import PurchaseOrderLine, PurchaseOrderSchedule
from src.simulation.engine import SimulationEngine
from src.simulation.events import EventType


def test_supplier_delivery_scheduled_four_hours_ahead():
    config = ScenarioConfig(scenario_id="supplier_test", scenario_name="Supplier Test", seed=42, store_count=1, sku_count=4)
    world = generate_world(config)
    start_time = datetime(2026, 10, 16, 8, 0, 0, tzinfo=timezone.utc)
    end_time = start_time + timedelta(hours=8)
    delivery_time = start_time + timedelta(hours=4)  # Exactly 4 simulated hours in future

    store_id = world.stores[0].id
    sku_id = world.skus[0].id
    delivery_qty = 50

    # Explicit planned PO schedule
    planned_po = PurchaseOrderSchedule(
        po_id="po_4h_ahead",
        store_id=store_id,
        supplier_id=world.suppliers[0].id,
        scheduled_order_date=start_time.isoformat(),
        expected_delivery_date=delivery_time.isoformat(),
        lines=[PurchaseOrderLine(sku_id=sku_id, quantity=delivery_qty, unit_cost=5.0)],
    )

    engine = SimulationEngine(
        run_id="run_po_test",
        world=world,
        start_time=start_time,
        end_time=end_time,
        seed=42,
    )

    # Initial inventory before delivery
    initial_pos = engine.state.get_position(store_id, sku_id)
    assert initial_pos is not None
    initial_physical = initial_pos.physical_on_hand

    # Schedule the planned delivery
    engine.schedule_supplier_deliveries([planned_po])
    assert len(engine.event_queue) == 1

    # 1. Advance virtual time to 3.5 hours (before delivery)
    engine.run_until(start_time + timedelta(hours=3, minutes=30))
    pos_before = engine.state.get_position(store_id, sku_id)
    # Stock must NOT have increased before delivery milestone
    assert pos_before.physical_on_hand == initial_physical

    # 2. Advance virtual time across delivery milestone
    engine.run_until(start_time + timedelta(hours=4, minutes=1))
    pos_after = engine.state.get_position(store_id, sku_id)

    # Stock must have increased exactly by delivery_qty
    assert pos_after.physical_on_hand == initial_physical + delivery_qty

    # Verify event logs record receipt
    events = engine.event_store.get_events()
    receipt_events = [e for e in events if e.event_type == EventType.SUPPLIER_DELIVERY_DUE]
    assert len(receipt_events) == 1
    assert receipt_events[0].virtual_timestamp == delivery_time
    assert receipt_events[0].payload["quantity"] == delivery_qty
