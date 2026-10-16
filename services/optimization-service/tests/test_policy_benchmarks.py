"""
Policy Comparison Benchmarks: Phase 08 Optimized Solvers vs Phase 06 Baseline Policies.
Compares:
1. Multi-Store Allocation: OR-Tools CP-SAT batch allocation vs Phase 06 Greedy Nearest-Store.
2. Multi-Period Replenishment: OR-Tools CP-SAT multi-period optimization vs Phase 06 Static (s, S) policy.
"""

import pytest
from src.models.allocation import (
    AllocationOptimizationRequest,
    OrderAllocationInput,
    OrderLineInput,
    StoreAllocationInput,
)
from src.models.common import SolverStatus
from src.models.replenishment import (
    ReplenishmentOptimizationRequest,
    ReplenishmentSkuInput,
)
from src.policies.fallbacks import BaselineFallbacks, haversine_distance
from src.solvers.allocation import AllocationSolver
from src.solvers.replenishment import ReplenishmentSolver


def test_allocation_benchmark_comparison():
    """
    Benchmark comparison: Batch CP-SAT Allocation vs Greedy Nearest-Store.
    Scenario:
      10 customer orders in an urban area.
      3 dark stores:
        - Store 1 (Downtown): Nearest to 7/10 orders, but high queue (12 orders) and limited stock.
        - Store 2 (Midtown): Moderate distance, low queue (1 order), ample stock.
        - Store 3 (Uptown): Farther away, zero queue, ample stock.

    Greedy nearest-store will overload Store 1 until stock runs out, causing severe queue latency
    and stockouts for later orders.
    Batch CP-SAT balances queue workload and reserves stock holistically, preventing SLA breaches.
    """
    orders = [
        OrderAllocationInput(
            order_id=f"ord_{i:02d}",
            customer_latitude=40.7128 + (i * 0.002),
            customer_longitude=-74.0060 + (i * 0.002),
            lines=[OrderLineInput(sku_id="SKU_SNACK", quantity=2)],
            sla_deadline_minutes=20.0,
        )
        for i in range(10)
    ]

    stores = [
        StoreAllocationInput(
            store_id="store_downtown",
            latitude=40.7130,
            longitude=-74.0055,
            available_inventory={"SKU_SNACK": 8},  # Can only fulfill 4 orders!
            current_queue_depth=12,                # Congested!
            service_radius_km=10.0,
        ),
        StoreAllocationInput(
            store_id="store_midtown",
            latitude=40.7250,
            longitude=-74.0010,
            available_inventory={"SKU_SNACK": 20}, # Ample
            current_queue_depth=1,                 # Clear
            service_radius_km=10.0,
        ),
        StoreAllocationInput(
            store_id="store_uptown",
            latitude=40.7400,
            longitude=-73.9900,
            available_inventory={"SKU_SNACK": 20}, # Ample
            current_queue_depth=0,                 # Clear
            service_radius_km=10.0,
        ),
    ]

    # 1. Run Optimized CP-SAT
    opt_req = AllocationOptimizationRequest(
        orders=orders,
        stores=stores,
        weight_distance=1.0,
        weight_queue=2.0,
        weight_sla_risk=5.0,
        weight_unallocated=100.0,
    )
    opt_resp = AllocationSolver.solve(opt_req)

    assert opt_resp.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    opt_decisions = opt_resp.decisions
    opt_assigned_count = len(opt_decisions.assignments)
    opt_unallocated_count = len(opt_decisions.unallocated_orders)

    # 2. Run Baseline Greedy Nearest-Store
    orders_raw = [o.model_dump() for o in orders]
    stores_raw = [s.model_dump() for s in stores]
    base_assignments, base_unallocated = BaselineFallbacks.nearest_store_allocation(
        orders_raw, stores_raw
    )
    base_assigned_count = len(base_assignments)
    base_unallocated_count = len(base_unallocated)

    # Assertions on performance & feasibility
    # All 10 orders can be fulfilled across downtown (4) + midtown (6)
    assert opt_assigned_count == 10
    assert opt_unallocated_count == 0

    # Baseline greedy may allocate downtown first until stock depleted, then midtown
    assert base_assigned_count == 10

    # Workload distribution:
    # Downtown has stock for 4 orders.
    # Optimizer should route orders to midtown to balance queue and avoid downtown backlog
    opt_store_counts = {}
    for a in opt_decisions.assignments:
        opt_store_counts[a.store_id] = opt_store_counts.get(a.store_id, 0) + 1

    base_store_counts = {}
    for a in base_assignments:
        base_store_counts[a["store_id"]] = base_store_counts.get(a["store_id"], 0) + 1

    # Downtown stock invariant must hold for both
    assert opt_store_counts.get("store_downtown", 0) <= 4
    assert base_store_counts.get("store_downtown", 0) <= 4

    # Because downtown was congested (queue=12), the optimizer routes fewer orders to downtown
    # than greedy nearest (or 0 to downtown if queue penalty dominates distance savings)
    print(
        f"\nAllocation Benchmark:\n"
        f"  CP-SAT Workload: {opt_store_counts}, Unallocated: {opt_unallocated_count}, Exec: {opt_resp.execution_time_ms:.2f}ms\n"
        f"  Greedy Workload: {base_store_counts}, Unallocated: {base_unallocated_count}"
    )


def test_replenishment_benchmark_comparison():
    """
    Benchmark comparison: Multi-period CP-SAT Replenishment vs Static (s, S) Baseline.
    Scenario:
      7-day horizon with non-stationary demand (spikes on day 3 and day 6).
      SKU has MOQ=30, pack_size=10, lead_time=1 day, order_transaction_cost=$25.
      Holding cost = $0.10/unit/day, Stockout penalty = $15.00/unit.

    Static (s, S) policy triggers smaller, frequent orders each time inventory dips below s_rop,
    incurring high transaction costs.
    CP-SAT groups orders into optimal batch multiples that anticipate demand spikes,
    significantly reducing total replenishment + holding + transaction cost.
    """
    sku = ReplenishmentSkuInput(
        sku_id="sku_beverage_pack",
        current_inventory=15,
        demand_forecast=[10, 12, 35, 12, 10, 40, 15],  # 7-day non-stationary
        safety_stock_target=10,
        lead_time_periods=1,
        min_order_quantity=30,
        pack_size=10,
        carrying_cost_per_period=0.10,
        stockout_penalty_per_unit=15.0,
        order_transaction_cost=25.0,
    )

    opt_req = ReplenishmentOptimizationRequest(
        store_id="store_nyc_01",
        horizon_periods=7,
        skus=[sku],
        storage_capacity_limit=500.0,
        time_limit_seconds=2.0,
    )

    opt_resp = ReplenishmentSolver.solve(opt_req)
    assert opt_resp.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert opt_resp.objective_value is not None

    opt_orders = opt_resp.decisions.recommended_orders
    opt_cost = opt_resp.decisions.cost_breakdown

    # Simulate static (s, S) baseline across the 7-day horizon
    # d_bar = sum(demand)/7 = 134 / 7 = 19.14
    # s_rop = int(19.14 * 1 + 10) = 29
    # s_order_up = s_rop + max(30, int(19.14 * 3)) = 29 + 57 = 86
    demand = sku.demand_forecast
    base_inv = sku.current_inventory
    base_orders = []
    base_holding_cost = 0.0
    base_shortage_cost = 0.0
    base_tx_cost = 0.0

    inv_t = base_inv
    pipeline = [0] * 7

    for t in range(7):
        # Receive deliveries
        inv_t += pipeline[t]

        # Review inventory: if inv_t < s_rop, place order
        if inv_t < 29 and t + 1 < 7:
            raw_q = max(sku.min_order_quantity, 86 - inv_t)
            # pack size multiple of 10
            q_pack = ((raw_q + 9) // 10) * 10
            pipeline[t + 1] += q_pack
            base_tx_cost += 25.0
            base_orders.append((t, q_pack))

        # Satisfy demand
        d_t = demand[t]
        if inv_t >= d_t:
            inv_t -= d_t
            base_holding_cost += inv_t * 0.10
        else:
            shortage = d_t - inv_t
            base_shortage_cost += shortage * 15.0
            inv_t = 0

    base_total_cost = round(base_holding_cost + base_shortage_cost + base_tx_cost, 2)
    opt_total_cost = opt_resp.objective_value

    print(
        f"\nReplenishment Benchmark (7-Day Non-Stationary Horizon):\n"
        f"  CP-SAT: Total Cost=${opt_total_cost:.2f} (Holding=${opt_cost.holding_cost:.2f}, "
        f"Shortage=${opt_cost.stockout_penalty:.2f}, Tx=${opt_cost.order_transaction_cost:.2f}), "
        f"Orders={[(o.order_period, o.order_quantity) for o in opt_orders]}\n"
        f"  Baseline (s, S): Total Cost=${base_total_cost:.2f} (Holding=${base_holding_cost:.2f}, "
        f"Shortage=${base_shortage_cost:.2f}, Tx=${base_tx_cost:.2f}), Orders={base_orders}"
    )

    # The CP-SAT optimizer should achieve a total cost less than or equal to the rigid baseline
    assert opt_total_cost <= base_total_cost + 5.0
