import pytest
from src.policies.config import BaselinePolicyConfig
from src.policies.routing import (
    BaselinePickerRoutingPolicy,
    NodeUnreachableError,
    PickerRoute,
    RoutingError,
    ShelfNotFoundError,
    WarehouseGraph,
)
from src.seeder.config import ScenarioConfig
from src.seeder.generator import generate_world


def _get_test_layout():
    config = ScenarioConfig(
        scenario_id="routing_test",
        scenario_name="Routing Test",
        seed=42,
        store_count=1,
        sku_count=8,
    )
    world = generate_world(config)
    layout = world.warehouse_layouts[0].model_dump()
    return layout, world.stores[0].id, world.skus


def test_picker_route_structure_and_graph_invariants():
    layout, store_id, skus = _get_test_layout()
    policy = BaselinePickerRoutingPolicy(BaselinePolicyConfig())

    # Request 3 items located on different shelves
    items = [
        {"sku_id": skus[0].id, "requested_quantity": 2},
        {"sku_id": skus[1].id, "requested_quantity": 1},
        {"sku_id": skus[2].id, "requested_quantity": 3},
    ]

    route = policy.plan_picker_route(
        task_id="task_route_001",
        store_id=store_id,
        layout=layout,
        items=items,
    )

    # 1. Assert route starts and ends at dispatch station
    graph = WarehouseGraph(layout)
    dispatch_id = graph.dispatch_station["id"]
    assert route.route_nodes[0] == dispatch_id
    assert route.route_nodes[-1] == dispatch_id

    # 2. Assert every single edge in the route exists in layout graph
    accumulated_distance = 0.0
    for i in range(len(route.route_nodes) - 1):
        u = route.route_nodes[i]
        v = route.route_nodes[i + 1]
        assert graph.has_edge(u, v), f"Edge ({u}, {v}) does not exist in graph!"
        accumulated_distance += graph.get_edge_distance(u, v)

    # 3. Assert total distance matches edge sum
    assert round(accumulated_distance, 2) == route.total_distance_meters
    assert route.total_distance_meters > 0.0

    # 4. Assert all requested shelves were visited
    node_set = set(route.route_nodes)
    for shelf in route.visited_shelves:
        assert shelf in node_set

    # 5. Assert travel duration derives consistently from walking speed
    expected_travel = round(route.total_distance_meters / 1.2, 2)
    assert route.travel_duration_seconds == expected_travel

    # 6. Assert pick duration accounts for total units (2 + 1 + 3 = 6 units * 10s = 60s)
    assert route.pick_duration_seconds == 60.0
    assert route.total_duration_seconds == round(expected_travel + 60.0, 2)


def test_routing_determinism():
    layout, store_id, skus = _get_test_layout()
    policy = BaselinePickerRoutingPolicy(BaselinePolicyConfig())

    items = [
        {"sku_id": skus[0].id, "requested_quantity": 1},
        {"sku_id": skus[3].id, "requested_quantity": 2},
    ]

    route_a = policy.plan_picker_route("task_a", store_id, layout, items)
    route_b = policy.plan_picker_route("task_a", store_id, layout, items)

    assert route_a.route_nodes == route_b.route_nodes
    assert route_a.total_distance_meters == route_b.total_distance_meters
    assert route_a.total_duration_seconds == route_b.total_duration_seconds


def test_routing_error_on_missing_shelf():
    layout, store_id, _ = _get_test_layout()
    policy = BaselinePickerRoutingPolicy(BaselinePolicyConfig())

    # Empty layout nodes
    empty_layout = {"id": "layout_bad", "store_id": store_id, "nodes": [], "edges": []}
    with pytest.raises(RoutingError):
        policy.plan_picker_route("task_err", store_id, empty_layout, [{"sku_id": "nonexistent"}])
