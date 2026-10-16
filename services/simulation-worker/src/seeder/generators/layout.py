"""
Deterministic warehouse layout and navigation graph generator.
"""

import math
import random
from typing import List, Tuple, Dict
from ..config import ScenarioConfig
from ..models import (
    WarehouseNode,
    WarehouseEdge,
    WarehouseLayoutPayload,
    SkuPayload
)


def euclidean_distance(n1: WarehouseNode, n2: WarehouseNode) -> float:
    dist = math.sqrt((n2.x - n1.x) ** 2 + (n2.y - n1.y) ** 2 + (n2.z - n1.z) ** 2)
    return round(dist, 2)


def generate_warehouse_layout(
    store_id: str,
    skus: List[SkuPayload],
    config: ScenarioConfig,
    rng: random.Random
) -> Tuple[WarehouseLayoutPayload, Dict[str, str]]:
    nodes: List[WarehouseNode] = []
    edges: List[WarehouseEdge] = []
    sku_to_shelf: Dict[str, str] = {}

    # 1. Dispatch station (packing / staging station)
    station_node_id = f"{store_id}-station-dispatch"
    station_node = WarehouseNode(
        id=station_node_id,
        type="DISPATCH_STATION",
        x=0.0,
        y=0.0,
        z=0.0
    )
    nodes.append(station_node)

    num_aisles = config.warehouse_aisles
    shelves_per_aisle = config.warehouse_shelves_per_aisle
    shelf_nodes: List[WarehouseNode] = []

    # 2. Generate aisles and connected shelves
    prev_aisle_entry: WarehouseNode = station_node

    for a_idx in range(1, num_aisles + 1):
        aisle_id = f"AISLE-{a_idx:02d}"
        aisle_x = round(float(a_idx * 4.0), 2)

        # Aisle entry node on main cross-walkway (y=0)
        aisle_entry_id = f"{store_id}-{aisle_id}-entry"
        aisle_entry_node = WarehouseNode(
            id=aisle_entry_id,
            type="AISLE",
            aisle_id=aisle_id,
            x=aisle_x,
            y=0.0,
            z=0.0
        )
        nodes.append(aisle_entry_node)

        # Connect previous entry/station to this aisle entry
        edges.append(
            WarehouseEdge(
                from_node=prev_aisle_entry.id,
                to_node=aisle_entry_node.id,
                distance=euclidean_distance(prev_aisle_entry, aisle_entry_node),
                bidirectional=True
            )
        )
        prev_aisle_entry = aisle_entry_node

        # Walk along aisle in y-direction
        prev_waypoint: WarehouseNode = aisle_entry_node
        for s_idx in range(1, shelves_per_aisle + 1):
            waypoint_y = round(float(s_idx * 2.5), 2)
            waypoint_id = f"{store_id}-{aisle_id}-wp-{s_idx:02d}"
            waypoint_node = WarehouseNode(
                id=waypoint_id,
                type="AISLE",
                aisle_id=aisle_id,
                x=aisle_x,
                y=waypoint_y,
                z=0.0
            )
            nodes.append(waypoint_node)

            # Edge connecting along the aisle
            edges.append(
                WarehouseEdge(
                    from_node=prev_waypoint.id,
                    to_node=waypoint_node.id,
                    distance=euclidean_distance(prev_waypoint, waypoint_node),
                    bidirectional=True
                )
            )
            prev_waypoint = waypoint_node

            # Shelf on the Left (x - 1.2)
            shelf_left_id = f"SHELF-{a_idx:02d}L-{s_idx:02d}"
            node_left_id = f"{store_id}-{shelf_left_id}"
            shelf_left = WarehouseNode(
                id=node_left_id,
                type="SHELF",
                aisle_id=aisle_id,
                shelf_id=shelf_left_id,
                x=round(aisle_x - 1.2, 2),
                y=waypoint_y,
                z=1.0
            )
            nodes.append(shelf_left)
            shelf_nodes.append(shelf_left)
            edges.append(
                WarehouseEdge(
                    from_node=waypoint_node.id,
                    to_node=shelf_left.id,
                    distance=euclidean_distance(waypoint_node, shelf_left),
                    bidirectional=True
                )
            )

            # Shelf on the Right (x + 1.2)
            shelf_right_id = f"SHELF-{a_idx:02d}R-{s_idx:02d}"
            node_right_id = f"{store_id}-{shelf_right_id}"
            shelf_right = WarehouseNode(
                id=node_right_id,
                type="SHELF",
                aisle_id=aisle_id,
                shelf_id=shelf_right_id,
                x=round(aisle_x + 1.2, 2),
                y=waypoint_y,
                z=1.0
            )
            nodes.append(shelf_right)
            shelf_nodes.append(shelf_right)
            edges.append(
                WarehouseEdge(
                    from_node=waypoint_node.id,
                    to_node=shelf_right.id,
                    distance=euclidean_distance(waypoint_node, shelf_right),
                    bidirectional=True
                )
            )

    # 3. Deterministically assign SKUs to shelf nodes
    for idx, sku in enumerate(skus):
        assigned_shelf = shelf_nodes[idx % len(shelf_nodes)]
        sku_to_shelf[sku.id] = assigned_shelf.shelf_id or assigned_shelf.id

    # Stable deterministic sorting of nodes and edges
    nodes.sort(key=lambda n: n.id)
    edges.sort(key=lambda e: (e.from_node, e.to_node))

    layout = WarehouseLayoutPayload(
        id=f"layout-{store_id}-v1",
        store_id=store_id,
        name=f"Primary Layout for {store_id}",
        version=1,
        status="ACTIVE",
        nodes=nodes,
        edges=edges
    )

    return layout, sku_to_shelf
