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
from src.models.routing import PickerRouteOptimizationRequest, PickItemInput
from src.solvers.allocation import AllocationSolver
from src.solvers.replenishment import ReplenishmentSolver
from src.solvers.routing import PickerRouteSolver


def test_allocation_zero_inventory_fallback():
    """
    When available inventory is strictly 0 across all stores,
    orders cannot be fulfilled and must be returned as unallocated.
    """
    ord_1 = OrderAllocationInput(
        order_id="ord_fail",
        customer_latitude=40.7128,
        customer_longitude=-74.0060,
        lines=[OrderLineInput(sku_id="SKU_EMPTY", quantity=5)],
    )
    store = StoreAllocationInput(
        store_id="store_empty",
        latitude=40.7130,
        longitude=-74.0060,
        available_inventory={"SKU_EMPTY": 0},
    )

    req = AllocationOptimizationRequest(orders=[ord_1], stores=[store])
    resp = AllocationSolver.solve(req)

    assert len(resp.decisions.unallocated_orders) == 1
    assert resp.decisions.unallocated_orders[0].order_id == "ord_fail"


def test_routing_invalid_layout_without_dispatch():
    """
    Submitting a layout without a dispatch station returns INVALID_INPUT.
    """
    bad_layout = {
        "id": "bad_layout",
        "nodes": [{"id": "S1", "type": "SHELF", "x": 0, "y": 0}],
        "edges": [],
    }
    req = PickerRouteOptimizationRequest(
        task_id="task_no_dispatch",
        store_id="store_01",
        layout=bad_layout,
        pick_items=[PickItemInput(item_id="i1", sku_id="s1", shelf_node_id="S1")],
    )
    resp = PickerRouteSolver.solve(req)
    assert resp.status == SolverStatus.INVALID_INPUT
