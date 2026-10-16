"""
Warehouse navigation graph validation and reachability tests.
"""

import pytest
from src.seeder.config import ScenarioConfig
from src.seeder.generator import generate_world
from src.seeder.models import WarehouseNode, WarehouseEdge, WarehouseLayoutPayload
from src.seeder.validation import validate_warehouse_graph, ValidationError


def test_generated_layout_is_fully_connected():
    config = ScenarioConfig(
        scenario_id="graph-test",
        scenario_name="Graph Test",
        seed=42,
        num_stores=1,
        num_skus=10,
        warehouse_aisles=3,
        warehouse_shelves_per_aisle=4
    )
    world = generate_world(config)
    layout = world.warehouse_layouts[0]

    # Must pass validation without error
    validate_warehouse_graph(layout)

    # Count nodes
    stations = [n for n in layout.nodes if n.type == "DISPATCH_STATION"]
    shelves = [n for n in layout.nodes if n.type == "SHELF"]

    assert len(stations) == 1
    # 3 aisles * 4 shelves per aisle * 2 sides (L & R) = 24 shelves
    assert len(shelves) == 24
    assert len(layout.edges) > 0


def test_rejects_disconnected_orphan_shelf():
    layout = WarehouseLayoutPayload(
        id="layout-invalid",
        store_id="store-1",
        name="Invalid Disconnected Layout",
        version=1,
        status="ACTIVE",
        nodes=[
            WarehouseNode(id="station-1", type="DISPATCH_STATION", x=0, y=0, z=0),
            WarehouseNode(id="shelf-reachable", type="SHELF", shelf_id="S1", x=2, y=0, z=1),
            WarehouseNode(id="shelf-orphan", type="SHELF", shelf_id="S2", x=10, y=10, z=1)
        ],
        edges=[
            WarehouseEdge(from_node="station-1", to_node="shelf-reachable", distance=2.0)
            # shelf-orphan has no connected edge!
        ]
    )

    with pytest.raises(ValidationError) as exc_info:
        validate_warehouse_graph(layout)

    assert "unreachable shelf nodes" in str(exc_info.value)


def test_rejects_missing_edge_endpoint():
    layout = WarehouseLayoutPayload(
        id="layout-missing-endpoint",
        store_id="store-1",
        name="Missing Endpoint Layout",
        version=1,
        status="ACTIVE",
        nodes=[
            WarehouseNode(id="station-1", type="DISPATCH_STATION", x=0, y=0, z=0),
            WarehouseNode(id="shelf-1", type="SHELF", shelf_id="S1", x=2, y=0, z=1)
        ],
        edges=[
            WarehouseEdge(from_node="station-1", to_node="nonexistent-node-99", distance=5.0)
        ]
    )

    with pytest.raises(ValidationError) as exc_info:
        validate_warehouse_graph(layout)

    assert "nonexistent to_node" in str(exc_info.value)
