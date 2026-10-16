import pytest
from datetime import datetime, timezone

from src.policies.allocation import (
    AllocationStatus,
    BaselineOrderAllocationPolicy,
    haversine_distance,
)
from src.policies.config import BaselinePolicyConfig
from src.simulation.run_state import RunState


def _build_test_run_state() -> RunState:
    state = RunState(run_id="run_alloc_test")
    # Store A at (40.7100, -74.0050)
    state.stores["store_A"] = {"id": "store_A", "latitude": 40.7100, "longitude": -74.0050}
    # Store B at (40.7300, -74.0050) (farther north)
    state.stores["store_B"] = {"id": "store_B", "latitude": 40.7300, "longitude": -74.0050}
    # Store C far away (40.9000, -74.0050) (outside radius)
    state.stores["store_C"] = {"id": "store_C", "latitude": 40.9000, "longitude": -74.0050}

    # Initial inventory
    state.receive_stock("store_A", "sku_apple", 50, "INIT", datetime.now(timezone.utc))
    state.receive_stock("store_A", "sku_bread", 50, "INIT", datetime.now(timezone.utc))

    state.receive_stock("store_B", "sku_apple", 50, "INIT", datetime.now(timezone.utc))
    state.receive_stock("store_B", "sku_bread", 50, "INIT", datetime.now(timezone.utc))

    state.receive_stock("store_C", "sku_apple", 50, "INIT", datetime.now(timezone.utc))
    return state


def test_haversine_distance_calculation():
    # NYC to Philadelphia is ~130 km
    d = haversine_distance(40.7128, -74.0060, 39.9526, -75.1652)
    assert 128.0 < d < 135.0
    # Same point is 0.0
    assert haversine_distance(40.7128, -74.0060, 40.7128, -74.0060) == 0.0


def test_nearest_eligible_store_selection():
    state = _build_test_run_state()
    policy = BaselineOrderAllocationPolicy(BaselinePolicyConfig(max_service_distance_km=10.0))

    # Customer at (40.7110, -74.0050) - closer to store_A
    basket = [
        {"sku_id": "sku_apple", "quantity": 2},
        {"sku_id": "sku_bread", "quantity": 1},
    ]

    res = policy.evaluate_and_allocate(
        run_state=state,
        order_id="ord_001",
        customer_latitude=40.7110,
        customer_longitude=-74.0050,
        delivery_zone_id=None,
        lines=basket,
        virtual_timestamp=datetime.now(timezone.utc),
    )

    assert res.status == AllocationStatus.ALLOCATED
    assert res.selected_store_id == "store_A"
    assert res.distance_km is not None


def test_complete_basket_inventory_requirement():
    state = _build_test_run_state()
    # Deplete sku_bread in store_A
    pos_a = state.get_position("store_A", "sku_bread")
    state.consume_stock("store_A", "sku_bread", pos_a.physical_on_hand, "DEPLETE", datetime.now(timezone.utc))

    policy = BaselineOrderAllocationPolicy(BaselinePolicyConfig(max_service_distance_km=10.0))
    basket = [
        {"sku_id": "sku_apple", "quantity": 2},
        {"sku_id": "sku_bread", "quantity": 1},
    ]

    # Even though store_A is closer, store_B must be selected because it has the complete basket
    res = policy.evaluate_and_allocate(
        run_state=state,
        order_id="ord_002",
        customer_latitude=40.7110,
        customer_longitude=-74.0050,
        delivery_zone_id=None,
        lines=basket,
        virtual_timestamp=datetime.now(timezone.utc),
    )

    assert res.status == AllocationStatus.ALLOCATED
    assert res.selected_store_id == "store_B"


def test_unfulfillable_when_no_store_has_stock_or_coverage():
    state = _build_test_run_state()
    policy = BaselineOrderAllocationPolicy(BaselinePolicyConfig(max_service_distance_km=5.0))

    # Customer out of coverage area (41.5000)
    res = policy.evaluate_and_allocate(
        run_state=state,
        order_id="ord_out_of_reach",
        customer_latitude=41.5000,
        customer_longitude=-74.0050,
        delivery_zone_id=None,
        lines=[{"sku_id": "sku_apple", "quantity": 1}],
        virtual_timestamp=datetime.now(timezone.utc),
    )
    assert res.status == AllocationStatus.UNFULFILLABLE
    assert res.selected_store_id is None


def test_partial_reservation_rollback_on_failure():
    state = _build_test_run_state()
    # store_A has 5 apples, but 0 milk
    state.receive_stock("store_A", "sku_apple", 5, "ADD", datetime.now(timezone.utc))
    apple_before = state.get_position("store_A", "sku_apple").reserved_stock

    policy = BaselineOrderAllocationPolicy(BaselinePolicyConfig())
    basket = [
        {"sku_id": "sku_apple", "quantity": 2},
        {"sku_id": "sku_nonexistent_milk", "quantity": 1},
    ]

    res = policy.evaluate_and_allocate(
        run_state=state,
        order_id="ord_fail",
        customer_latitude=40.7110,
        customer_longitude=-74.0050,
        delivery_zone_id=None,
        lines=basket,
        virtual_timestamp=datetime.now(timezone.utc),
    )

    assert res.status == AllocationStatus.UNFULFILLABLE
    # Assert partial reservations were strictly rolled back and not left behind
    apple_after = state.get_position("store_A", "sku_apple").reserved_stock
    assert apple_after == apple_before
