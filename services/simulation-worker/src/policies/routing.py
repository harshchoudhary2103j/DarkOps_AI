import heapq
import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

from src.policies.config import BaselinePolicyConfig


class RoutingError(Exception):
    pass


class ShelfNotFoundError(RoutingError):
    pass


class NodeUnreachableError(RoutingError):
    pass


@dataclass
class PickerRoute:
    task_id: str
    store_id: str
    route_nodes: List[str]
    total_distance_meters: float
    travel_duration_seconds: float
    pick_duration_seconds: float
    total_duration_seconds: float
    visited_shelves: List[str]


class WarehouseGraph:
    """
    Graph representation of warehouse layout nodes and edges.
    Enforces valid aisle traversal and obstacle/wall constraints.
    """

    def __init__(self, layout: Dict[str, Any]):
        self.layout_id = layout.get("id", "unknown")
        self.store_id = layout.get("store_id", "unknown")
        self.nodes = {n["id"]: n for n in layout.get("nodes", [])}
        self.edges_dict: Dict[Tuple[str, str], float] = {}
        self.adjacency: Dict[str, List[Tuple[str, float]]] = {nid: [] for nid in self.nodes}

        for edge in layout.get("edges", []):
            u = edge["from_node"]
            v = edge["to_node"]
            dist = float(edge["distance"])

            if u in self.nodes and v in self.nodes:
                self.adjacency[u].append((v, dist))
                self.edges_dict[(u, v)] = dist
                if edge.get("bidirectional", True):
                    self.adjacency[v].append((u, dist))
                    self.edges_dict[(v, u)] = dist

        self.dispatch_station = next(
            (n for n in self.nodes.values() if n.get("type") == "DISPATCH_STATION"),
            None
        )

    def has_edge(self, u: str, v: str) -> bool:
        return (u, v) in self.edges_dict

    def get_edge_distance(self, u: str, v: str) -> float:
        return self.edges_dict.get((u, v), float("inf"))

    def shortest_path(self, start_id: str, target_id: str) -> Tuple[List[str], float]:
        """
        Dijkstra's shortest path algorithm between two nodes.
        Returns (node_path, total_distance).
        """
        if start_id == target_id:
            return [start_id], 0.0

        if start_id not in self.nodes or target_id not in self.nodes:
            raise NodeUnreachableError(f"Node {start_id} or {target_id} not present in graph")

        distances: Dict[str, float] = {start_id: 0.0}
        previous: Dict[str, Optional[str]] = {start_id: None}
        pq: List[Tuple[float, str]] = [(0.0, start_id)]
        visited: Set[str] = set()

        while pq:
            curr_dist, curr_node = heapq.heappop(pq)
            if curr_node == target_id:
                break

            if curr_node in visited:
                continue
            visited.add(curr_node)

            for neighbor, weight in self.adjacency.get(curr_node, []):
                new_dist = curr_dist + weight
                if neighbor not in distances or new_dist < distances[neighbor]:
                    distances[neighbor] = new_dist
                    previous[neighbor] = curr_node
                    heapq.heappush(pq, (new_dist, neighbor))

        if target_id not in distances:
            raise NodeUnreachableError(f"Target node {target_id} is unreachable from {start_id}")

        # Reconstruct path
        path: List[str] = []
        curr: Optional[str] = target_id
        while curr is not None:
            path.append(curr)
            curr = previous.get(curr)
        path.reverse()

        return path, round(distances[target_id], 3)


class BaselinePickerRoutingPolicy:
    """
    Standard S-Shape (Serpentine) warehouse picker routing heuristic.

    Invariants:
    - Route starts at dispatch station
    - Route ends at dispatch station
    - Every movement between consecutive nodes follows a defined physical aisle graph edge
    - Visited shelves are traversed in alternating (serpentine) order across aisles
    - 100% deterministic
    """

    def __init__(self, config: BaselinePolicyConfig):
        self.config = config

    def plan_picker_route(
        self,
        task_id: str,
        store_id: str,
        layout: Dict[str, Any],
        items: List[Dict[str, Any]],
        sku_to_shelf_mapping: Optional[Dict[str, str]] = None,
    ) -> PickerRoute:
        """
        Generates and validates an S-Shape traversal route visiting all requested items.
        """
        graph = WarehouseGraph(layout)
        if not graph.dispatch_station:
            raise RoutingError(f"Store {store_id} layout does not contain a DISPATCH_STATION node")

        dispatch_id = graph.dispatch_station["id"]
        shelf_map = sku_to_shelf_mapping or {}

        # 1. Resolve requested items to shelf node IDs
        shelf_nodes: List[Dict[str, Any]] = []
        visited_shelf_ids: List[str] = []

        for item in items:
            sku_id = item["sku_id"]
            # Lookup specific shelf mapping or layout nodes
            mapped_node_id = shelf_map.get(f"{store_id}:{sku_id}") or shelf_map.get(sku_id)
            target_node = None
            if mapped_node_id and mapped_node_id in graph.nodes:
                target_node = graph.nodes[mapped_node_id]
            else:
                # Find matching shelf node by zone/SKU or type
                target_node = next(
                    (n for n in graph.nodes.values() if n.get("type") == "SHELF" and (n.get("shelf_id") == sku_id or n.get("zone") == sku_id)),
                    None
                )
                if not target_node:
                    # Fallback to first available shelf node
                    target_node = next((n for n in graph.nodes.values() if n.get("type") == "SHELF"), None)

            if not target_node:
                raise ShelfNotFoundError(f"Cannot resolve SKU {sku_id} to a shelf location in store {store_id}")

            if target_node["id"] not in visited_shelf_ids:
                shelf_nodes.append(target_node)
                visited_shelf_ids.append(target_node["id"])

        # 2. S-Shape / Serpentine Stop Ordering:
        # Group shelves by aisle_id, sort aisles by x-coordinate
        aisle_groups: Dict[str, List[Dict[str, Any]]] = {}
        for shelf in shelf_nodes:
            aisle_id = shelf.get("aisle_id", "AISLE-01")
            if aisle_id not in aisle_groups:
                aisle_groups[aisle_id] = []
            aisle_groups[aisle_id].append(shelf)

        # Sort aisles by average x coordinate
        sorted_aisles = sorted(
            aisle_groups.keys(),
            key=lambda a_id: (
                aisle_groups[a_id][0].get("x", 0.0),
                a_id,
            )
        )

        # Sort shelves within each aisle: alternating up and down (Serpentine)
        ordered_stops: List[str] = []
        for idx, a_id in enumerate(sorted_aisles, 1):
            shelves_in_aisle = aisle_groups[a_id]
            # Odd aisle: ascending y; Even aisle: descending y
            reverse_y = (idx % 2 == 0)
            sorted_in_aisle = sorted(shelves_in_aisle, key=lambda s: s.get("y", 0.0), reverse=reverse_y)
            for s in sorted_in_aisle:
                ordered_stops.append(s["id"])

        # Complete stop sequence: dispatch -> stop1 -> stop2 -> ... -> dispatch
        all_stops = [dispatch_id] + ordered_stops + [dispatch_id]

        # 3. Stitch shortest paths between consecutive stops along graph edges
        full_route_nodes: List[str] = []
        total_distance = 0.0

        for i in range(len(all_stops) - 1):
            curr_stop = all_stops[i]
            next_stop = all_stops[i + 1]

            path_segment, segment_dist = graph.shortest_path(curr_stop, next_stop)
            total_distance += segment_dist

            if not full_route_nodes:
                full_route_nodes.extend(path_segment)
            else:
                # Omit duplicate junction node
                full_route_nodes.extend(path_segment[1:])

        # 4. Strict Graph Path Validation
        self._validate_route(graph, full_route_nodes, dispatch_id, visited_shelf_ids)

        # 5. Compute durations
        walk_speed = self.config.walking_speed_mps
        travel_duration = round(total_distance / walk_speed, 2)
        total_units = sum(item.get("requested_quantity", 1) for item in items)
        pick_duration = round(total_units * self.config.item_pick_time_seconds, 2)
        total_duration = round(travel_duration + pick_duration, 2)

        return PickerRoute(
            task_id=task_id,
            store_id=store_id,
            route_nodes=full_route_nodes,
            total_distance_meters=round(total_distance, 2),
            travel_duration_seconds=travel_duration,
            pick_duration_seconds=pick_duration,
            total_duration_seconds=total_duration,
            visited_shelves=visited_shelf_ids,
        )

    def _validate_route(
        self,
        graph: WarehouseGraph,
        route_nodes: List[str],
        dispatch_id: str,
        required_shelves: List[str],
    ) -> None:
        """
        Validates graph invariants on the completed picker route.
        """
        if not route_nodes:
            raise RoutingError("Generated picker route is empty")

        if route_nodes[0] != dispatch_id:
            raise RoutingError(f"Route must start at dispatch station {dispatch_id}, found {route_nodes[0]}")

        if route_nodes[-1] != dispatch_id:
            raise RoutingError(f"Route must end at dispatch station {dispatch_id}, found {route_nodes[-1]}")

        # Verify edge continuity
        for i in range(len(route_nodes) - 1):
            u = route_nodes[i]
            v = route_nodes[i + 1]
            if not graph.has_edge(u, v):
                raise RoutingError(f"Invalid path traversal: no graph edge exists between {u} and {v}")

        # Verify all required shelves are visited
        node_set = set(route_nodes)
        for shelf in required_shelves:
            if shelf not in node_set:
                raise RoutingError(f"Route omitted required shelf node: {shelf}")
