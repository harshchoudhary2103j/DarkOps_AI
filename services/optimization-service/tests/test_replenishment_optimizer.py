from src.models.common import SolverStatus
from src.models.replenishment import (
    ReplenishmentOptimizationRequest,
    ReplenishmentSkuInput,
)
from src.solvers.replenishment import ReplenishmentSolver


def test_replenishment_moq_and_pack_size_enforcement():
    """
    Verifies that generated purchase orders strictly respect:
    1. Pack size multiples: order_quantity % pack_size == 0
    2. Minimum Order Quantity: order_quantity >= MOQ
    """
    sku = ReplenishmentSkuInput(
        sku_id="sku_milk_01",
        current_inventory=5,
        demand_forecast=[10, 15, 20, 15, 10],
        safety_stock_target=5,
        lead_time_periods=1,
        min_order_quantity=24,  # MOQ of 24
        pack_size=6,            # Pack size of 6
        carrying_cost_per_period=0.05,
        stockout_penalty_per_unit=10.0,
        order_transaction_cost=20.0,
    )

    req = ReplenishmentOptimizationRequest(
        store_id="store_nyc_01",
        horizon_periods=5,
        skus=[sku],
        time_limit_seconds=2.0,
    )

    resp = ReplenishmentSolver.solve(req)

    assert resp.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert resp.objective_value is not None
    assert resp.constraint_status["moq_constraints_respected"] is True
    assert resp.constraint_status["pack_size_multiples_respected"] is True

    orders = resp.decisions.recommended_orders
    assert len(orders) > 0

    for po in orders:
        assert po.order_quantity >= 24, f"Order {po.order_quantity} violates MOQ 24"
        assert po.order_quantity % 6 == 0, f"Order {po.order_quantity} not multiple of pack size 6"


def test_replenishment_storage_capacity_constraint():
    """
    Verifies that total end-of-period inventory never violates storage capacity limit.
    """
    sku_a = ReplenishmentSkuInput(
        sku_id="sku_bulky_a",
        current_inventory=10,
        demand_forecast=[5, 5, 5, 5],
        unit_volume=2.0,
        min_order_quantity=1,
        pack_size=1,
        lead_time_periods=0,
    )
    sku_b = ReplenishmentSkuInput(
        sku_id="sku_bulky_b",
        current_inventory=10,
        demand_forecast=[5, 5, 5, 5],
        unit_volume=2.0,
        min_order_quantity=1,
        pack_size=1,
        lead_time_periods=0,
    )

    # Total capacity limit: 50.0 volume units
    req = ReplenishmentOptimizationRequest(
        store_id="store_compact_01",
        horizon_periods=4,
        skus=[sku_a, sku_b],
        storage_capacity_limit=50.0,
        time_limit_seconds=2.0,
    )

    resp = ReplenishmentSolver.solve(req)

    assert resp.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    inv = resp.decisions.projected_inventory

    for t in range(4):
        total_vol = inv["sku_bulky_a"][t] * 2.0 + inv["sku_bulky_b"][t] * 2.0
        assert total_vol <= 50.0 + 1e-4, f"Storage exceeded at t={t}: {total_vol} > 50.0"


def test_replenishment_deterministic_repeated_solves():
    """
    Solving the exact same formulation twice must yield identical objective values and orders.
    """
    sku = ReplenishmentSkuInput(
        sku_id="sku_cereal",
        current_inventory=12,
        demand_forecast=[8, 12, 10, 14, 16],
        safety_stock_target=6,
        lead_time_periods=1,
        min_order_quantity=10,
        pack_size=5,
    )
    req = ReplenishmentOptimizationRequest(
        store_id="store_test_01",
        horizon_periods=5,
        skus=[sku],
    )

    resp_1 = ReplenishmentSolver.solve(req)
    resp_2 = ReplenishmentSolver.solve(req)

    assert resp_1.status == resp_2.status
    assert resp_1.objective_value == resp_2.objective_value
    assert len(resp_1.decisions.recommended_orders) == len(resp_2.decisions.recommended_orders)

    for o1, o2 in zip(resp_1.decisions.recommended_orders, resp_2.decisions.recommended_orders):
        assert o1.order_period == o2.order_period
        assert o1.order_quantity == o2.order_quantity
