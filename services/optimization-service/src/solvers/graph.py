import heapq
import math
from typing import Any, Dict, List, Optional, Set, Tuple


class GraphError(Exception):
    pass


class NodeNotFoundError(GraphError):
    pass


class NodeUnreachableError(GraphError):
    pass


class WarehouseGraph:
    """
    Authoritative representation of warehouse physical walkable space.
    Strictly forbids imaginary edges or obstacle-crossing jumps.
    """

    def __init__(self, layout: Dict[str, Any]):
        self.layout_id = layout.get("id", "unknown")
        self.store_id = layout.get("store_id", "unknown")
        self.nodes: Dict[str, Dict[str, Any]] = {n["id"]: n for n in layout.get("nodes", [])}
        self.edges_dict: Dict[Tuple[str, str], float] = {}
        self.adjacency: Dict[str, List[Tuple[str, float]]] = {nid: [] for nid in self.nodes}

        for edge in layout.get("edges", []):
            u = edge.get("from_node") or edge.get("source") or edge.get("source_node")
            v = edge.get("to_node") or edge.get("target") or edge.get("target_node")
            dist_val = edge.get("distance") if edge.get("distance") is not None else edge.get("distance_meters")
            if dist_val is None:
                dist_val = edge.get("length") or edge.get("cost") or 1.0
            dist = float(dist_val)

            if u and v and u in self.nodes and v in self.nodes:
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

    def shortest_path_dijkstra(self, start_id: str, target_id: str) -> Tuple[List[str], float]:
        """
        Dijkstra shortest path algorithm between two layout nodes.
        Returns (node_path, total_distance_meters).
        """
        if start_id == target_id:
            return [start_id], 0.0

        if start_id not in self.nodes:
            raise NodeNotFoundError(f"Start node '{start_id}' not found in layout graph")
        if target_id not in self.nodes:
            raise NodeNotFoundError(f"Target node '{target_id}' not found in layout graph")

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
            raise NodeUnreachableError(f"Target node '{target_id}' is unreachable from '{start_id}'")

        path: List[str] = []
        curr: Optional[str] = target_id
        while curr is not None:
            path.append(curr)
            curr = previous.get(curr)
        path.reverse()

        return path, round(distances[target_id], 3)

    def shortest_path_astar(self, start_id: str, target_id: str) -> Tuple[List[str], float]:
        """
        A* algorithm with Euclidean distance heuristic.
        The Euclidean heuristic h(n) is admissible because straight-line distance
        is always <= graph edge distance, preserving optimal shortest path guarantees.
        """
        if start_id == target_id:
            return [start_id], 0.0

        if start_id not in self.nodes or target_id not in self.nodes:
            raise NodeNotFoundError(f"Node '{start_id}' or '{target_id}' not found in graph")

        target_node = self.nodes[target_id]
        tx = float(target_node.get("x", 0.0))
        ty = float(target_node.get("y", 0.0))

        def heuristic(nid: str) -> float:
            n = self.nodes[nid]
            nx = float(n.get("x", 0.0))
            ny = float(n.get("y", 0.0))
            return math.sqrt((nx - tx) ** 2 + (ny - ty) ** 2)

        g_score: Dict[str, float] = {start_id: 0.0}
        previous: Dict[str, Optional[str]] = {start_id: None}
        pq: List[Tuple[float, str]] = [(heuristic(start_id), start_id)]
        visited: Set[str] = set()

        while pq:
            _, curr_node = heapq.heappop(pq)
            if curr_node == target_id:
                break

            if curr_node in visited:
                continue
            visited.add(curr_node)

            for neighbor, weight in self.adjacency.get(curr_node, []):
                tentative_g = g_score[curr_node] + weight
                if neighbor not in g_score or tentative_g < g_score[neighbor]:
                    g_score[neighbor] = tentative_g
                    previous[neighbor] = curr_node
                    f_score = tentative_g + heuristic(neighbor)
                    heapq.heappush(pq, (f_score, neighbor))

        if target_id not in g_score:
            raise NodeUnreachableError(f"Target node '{target_id}' is unreachable from '{start_id}'")

        path: List[str] = []
        curr: Optional[str] = target_id
        while curr is not None:
            path.append(curr)
            curr = previous.get(curr)
        path.reverse()

        return path, round(g_score[target_id], 3)

    def validate_route(
        self,
        route_nodes: List[str],
        dispatch_id: str,
        required_shelves: List[str],
    ) -> float:
        """
        Validates path continuity and shelf coverage invariants.
        Returns the recomputed exact total route distance.
        """
        if not route_nodes:
            raise GraphError("Picker route is empty")

        if route_nodes[0] != dispatch_id:
            raise GraphError(f"Route must start at dispatch '{dispatch_id}', got '{route_nodes[0]}'")

        if route_nodes[-1] != dispatch_id:
            raise GraphError(f"Route must end at dispatch '{dispatch_id}', got '{route_nodes[-1]}'")

        total_distance = 0.0
        for i in range(len(route_nodes) - 1):
            u = route_nodes[i]
            v = route_nodes[i + 1]
            if not self.has_edge(u, v):
                raise GraphError(f"Invalid path traversal: no graph edge exists between '{u}' and '{v}'")
            total_distance += self.get_edge_distance(u, v)

        node_set = set(route_nodes)
        for shelf in required_shelves:
            if shelf not in node_set:
                raise GraphError(f"Route omitted required pick shelf node: '{shelf}'")

        return round(total_distance, 3)
