from src.models.allocation import (
    AllocationOptimizationRequest,
    OrderAllocationInput,
    OrderLineInput,
    StoreAllocationInput,
)
from src.models.common import SolverStatus
from src.solvers.allocation import AllocationSolver


def test_allocation_batch_inventory_contention():
    """
    Two orders arrive simultaneously, each requesting 10 units of SKU_A.
    Store 1 has 15 units available.
    Store 2 has 20 units available, but is farther away.
    The solver must NOT allocate both orders to Store 1 (which would oversell 20 > 15).
    One must be allocated to Store 1 and one to Store 2.
    """
    ord_1 = OrderAllocationInput(
        order_id="ord_01",
        customer_latitude=40.7128,
        customer_longitude=-74.0060,
        lines=[OrderLineInput(sku_id="SKU_A", quantity=10)],
    )
    ord_2 = OrderAllocationInput(
        order_id="ord_02",
        customer_latitude=40.7130,
        customer_longitude=-74.0058,
        lines=[OrderLineInput(sku_id="SKU_A", quantity=10)],
    )

    store_near = StoreAllocationInput(
        store_id="store_near",
        latitude=40.7135,
        longitude=-74.0055,
        available_inventory={"SKU_A": 15},  # Only enough for 1 order
        current_queue_depth=0,
    )
    store_far = StoreAllocationInput(
        store_id="store_far",
        latitude=40.7250,
        longitude=-74.0150,
        available_inventory={"SKU_A": 20},  # Enough for 1 order
        current_queue_depth=0,
    )

    req = AllocationOptimizationRequest(
        orders=[ord_1, ord_2],
        stores=[store_near, store_far],
    )

    resp = AllocationSolver.solve(req)

    assert resp.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert len(resp.decisions.assignments) == 2
    assert len(resp.decisions.unallocated_orders) == 0

    assigned_stores = {a.store_id for a in resp.decisions.assignments}
    assert assigned_stores == {"store_near", "store_far"}

    # Assert remaining inventory is non-negative everywhere
    assert resp.decisions.remaining_inventory["store_near"]["SKU_A"] == 5
    assert resp.decisions.remaining_inventory["store_far"]["SKU_A"] == 10


def test_allocation_queue_balancing():
    """
    When distances to two stores are almost identical,
    the optimizer favors the store with lower queue depth to minimize SLA risk.
    """
    ord_1 = OrderAllocationInput(
        order_id="ord_single",
        customer_latitude=40.7128,
        customer_longitude=-74.0060,
        lines=[OrderLineInput(sku_id="SKU_B", quantity=2)],
    )

    store_busy = StoreAllocationInput(
        store_id="store_busy",
        latitude=40.7130,
        longitude=-74.0060,
        available_inventory={"SKU_B": 50},
        current_queue_depth=15,  # Heavy backlog
    )
    store_idle = StoreAllocationInput(
        store_id="store_idle",
        latitude=40.7131,
        longitude=-74.0060,
        available_inventory={"SKU_B": 50},
        current_queue_depth=0,   # No backlog
    )

    req = AllocationOptimizationRequest(
        orders=[ord_1],
        stores=[store_busy, store_idle],
    )

    resp = AllocationSolver.solve(req)
    assert resp.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert len(resp.decisions.assignments) == 1
    assert resp.decisions.assignments[0].store_id == "store_idle"


def test_allocation_unallocated_when_out_of_radius():
    """
    An order located 50km away from all dark stores cannot be served
    and must be explicitly marked unallocated.
    """
    ord_remote = OrderAllocationInput(
        order_id="ord_remote",
        customer_latitude=41.5000,
        customer_longitude=-75.0000,
        lines=[OrderLineInput(sku_id="SKU_1", quantity=1)],
    )
    store = StoreAllocationInput(
        store_id="store_local",
        latitude=40.7128,
        longitude=-74.0060,
        service_radius_km=15.0,
        available_inventory={"SKU_1": 100},
    )

    req = AllocationOptimizationRequest(orders=[ord_remote], stores=[store])
    resp = AllocationSolver.solve(req)

    assert len(resp.decisions.unallocated_orders) == 1
    assert resp.decisions.unallocated_orders[0].order_id == "ord_remote"
