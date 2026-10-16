from src.models.common import SolverStatus
from src.models.routing import PickerRouteOptimizationRequest, PickItemInput
from src.solvers.graph import WarehouseGraph
from src.solvers.routing import PickerRouteSolver


def _sample_layout():
    return {
        "id": "layout_test_01",
        "store_id": "store_test",
        "nodes": [
            {"id": "DISPATCH", "type": "DISPATCH_STATION", "x": 0.0, "y": 0.0},
            {"id": "N1", "type": "AISLE_NODE", "x": 5.0, "y": 0.0},
            {"id": "SHELF_1", "type": "SHELF", "x": 5.0, "y": 10.0, "aisle_id": "A1"},
            {"id": "SHELF_2", "type": "SHELF", "x": 10.0, "y": 10.0, "aisle_id": "A2"},
            {"id": "N2", "type": "AISLE_NODE", "x": 10.0, "y": 0.0},
        ],
        "edges": [
            {"from_node": "DISPATCH", "to_node": "N1", "distance": 5.0, "bidirectional": True},
            {"from_node": "N1", "to_node": "SHELF_1", "distance": 10.0, "bidirectional": True},
            {"from_node": "N1", "to_node": "N2", "distance": 5.0, "bidirectional": True},
            {"from_node": "N2", "to_node": "SHELF_2", "distance": 10.0, "bidirectional": True},
            {"from_node": "SHELF_1", "to_node": "SHELF_2", "distance": 5.0, "bidirectional": True},
        ],
    }


def test_shortest_path_dijkstra_and_astar():
    layout = _sample_layout()
    graph = WarehouseGraph(layout)

    path_d, dist_d = graph.shortest_path_dijkstra("DISPATCH", "SHELF_2")
    path_a, dist_a = graph.shortest_path_astar("DISPATCH", "SHELF_2")

    # Path should be DISPATCH -> N1 -> N2 -> SHELF_2 (dist 5 + 5 + 10 = 20)
    # or DISPATCH -> N1 -> SHELF_1 -> SHELF_2 (dist 5 + 10 + 5 = 20)
    assert dist_d == 20.0
    assert dist_a == 20.0


def test_picker_route_optimization_and_validation():
    layout = _sample_layout()
    req = PickerRouteOptimizationRequest(
        task_id="task_01",
        store_id="store_test",
        layout=layout,
        pick_items=[
            PickItemInput(item_id="i1", sku_id="s1", shelf_node_id="SHELF_1"),
            PickItemInput(item_id="i2", sku_id="s2", shelf_node_id="SHELF_2"),
        ],
    )

    resp = PickerRouteSolver.solve(req)

    assert resp.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert resp.objective_value is not None

    route_nodes = resp.decisions.route_nodes
    assert route_nodes[0] == "DISPATCH"
    assert route_nodes[-1] == "DISPATCH"
    assert "SHELF_1" in route_nodes
    assert "SHELF_2" in route_nodes

    # Total distance must match sum of edge weights:
    # DISPATCH -> N1 (5) -> SHELF_1 (10) -> SHELF_2 (5) -> N2 (10) -> N1 (5) -> DISPATCH (5) = 40m
    assert resp.decisions.total_distance_meters == 40.0


def test_disconnected_shelf_infeasibility():
    layout = _sample_layout()
    # Add disconnected shelf
    layout["nodes"].append({"id": "DISCONNECTED_SHELF", "type": "SHELF", "x": 100.0, "y": 100.0})

    req = PickerRouteOptimizationRequest(
        task_id="task_fail",
        store_id="store_test",
        layout=layout,
        pick_items=[PickItemInput(item_id="i1", sku_id="s1", shelf_node_id="DISCONNECTED_SHELF")],
    )

    resp = PickerRouteSolver.solve(req)
    assert resp.status == SolverStatus.INFEASIBLE
    assert "unreachable" in resp.explanations[0].lower()
