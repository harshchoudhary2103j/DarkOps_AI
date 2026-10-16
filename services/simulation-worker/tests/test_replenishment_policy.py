import pytest
from src.policies.config import BaselinePolicyConfig
from src.policies.replenishment import BaselineReplenishmentPolicy
from src.seeder.models import HistoricalSaleObservation


def test_moving_average_demand_calculation():
    cfg = BaselinePolicyConfig(moving_average_window_days=7)
    # 7 days of 10 units sold per day
    history = [
        HistoricalSaleObservation(
            store_id="store_01",
            sku_id="sku_01",
            date=f"2026-09-{i:02d}",
            units_sold=10,
            unit_price=5.0,
        )
        for i in range(1, 8)
    ]
    policy = BaselineReplenishmentPolicy(config=cfg, historical_sales=history)

    d_bar = policy.get_demand_rate("store_01", "sku_01")
    assert d_bar == 10.0

    # Unobserved SKU returns fallback
    d_fallback = policy.get_demand_rate("store_01", "sku_unseen")
    assert d_fallback == cfg.default_daily_demand_fallback


def test_reorder_parameters_and_safety_stock():
    cfg = BaselinePolicyConfig(
        moving_average_window_days=14,
        safety_stock_factor=1.5,
        default_lead_time_days=1.0,
        order_up_to_multiplier=2.0,
    )
    history = [
        HistoricalSaleObservation(
            store_id="store_01",
            sku_id="sku_01",
            date="2026-09-15",
            units_sold=20,
            unit_price=3.0,
        )
    ]
    policy = BaselineReplenishmentPolicy(config=cfg, historical_sales=history)

    s, S, L = policy.calculate_reorder_levels("store_01", "sku_01")
    # d_bar = 20, L = 1.0
    # SS = ceil(1.5 * 20 * sqrt(1.0)) = ceil(30) = 30
    # s = ceil(20 * 1.0 + 30) = 50
    # S = 50 + max(5, ceil(2.0 * 20 * 1.0)) = 50 + 40 = 90
    assert s == 50
    assert S == 90
    assert S > s >= 0
    assert L == 1.0


def test_no_order_when_inventory_position_at_or_above_s():
    cfg = BaselinePolicyConfig()
    history = [
        HistoricalSaleObservation(store_id="store_01", sku_id="sku_01", date="2026-09-15", units_sold=10, unit_price=2.0)
    ]
    policy = BaselineReplenishmentPolicy(config=cfg, historical_sales=history)
    s, S, _ = policy.calculate_reorder_levels("store_01", "sku_01")

    # IP = physical - reserved + incoming = 60 - 5 + 0 = 55 >= s
    decision = policy.evaluate_replenishment(
        store_id="store_01",
        sku_id="sku_01",
        physical_on_hand=60,
        reserved_stock=5,
        incoming_units=0,
    )
    assert decision is None


def test_correct_order_quantity_and_pack_size_rounding():
    cfg = BaselinePolicyConfig(default_lead_time_days=1.0)
    history = [
        HistoricalSaleObservation(store_id="store_01", sku_id="sku_01", date="2026-09-15", units_sold=10, unit_price=2.0)
    ]
    # Supplier metadata with MOQ=20 and pack_size=6
    supplier_skus = [
        {
            "sku_id": "sku_01",
            "supplier_id": "supplier_fresh",
            "lead_time_days": 1.0,
            "min_order_quantity": 20,
            "pack_size": 6,
        }
    ]
    policy = BaselineReplenishmentPolicy(config=cfg, historical_sales=history, supplier_skus=supplier_skus)
    s, S, L = policy.calculate_reorder_levels("store_01", "sku_01")

    # IP = physical - reserved + incoming = 5 - 0 + 0 = 5 < s
    decision = policy.evaluate_replenishment(
        store_id="store_01",
        sku_id="sku_01",
        physical_on_hand=5,
        reserved_stock=0,
        incoming_units=0,
    )
    assert decision is not None
    assert decision.supplier_id == "supplier_fresh"
    assert decision.order_quantity >= 20  # Satisfies MOQ
    assert decision.order_quantity % 6 == 0  # Rounded to pack size multiple
    assert decision.order_quantity >= (S - 5)


def test_no_duplicate_orders_when_order_is_in_flight():
    cfg = BaselinePolicyConfig(default_lead_time_days=1.0)
    history = [
        HistoricalSaleObservation(store_id="store_01", sku_id="sku_01", date="2026-09-15", units_sold=10, unit_price=2.0)
    ]
    policy = BaselineReplenishmentPolicy(config=cfg, historical_sales=history)
    s, S, _ = policy.calculate_reorder_levels("store_01", "sku_01")

    # When incoming_units is already 50, IP = 5 - 0 + 50 = 55 >= s
    decision = policy.evaluate_replenishment(
        store_id="store_01",
        sku_id="sku_01",
        physical_on_hand=5,
        reserved_stock=0,
        incoming_units=50,
    )
    # No duplicate order created!
    assert decision is None
