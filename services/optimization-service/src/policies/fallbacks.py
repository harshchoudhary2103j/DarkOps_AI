import math
from typing import Any, Dict, List, Optional, Tuple

from src.solvers.graph import WarehouseGraph, GraphError


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r_earth = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(r_earth * c, 3)


class BaselineFallbacks:
    """
    Adapters for Phase 06 baseline heuristic policies to serve as comparative benchmarks
    and verified fallback candidates for Phase 08 optimization solvers.
    """

    @classmethod
    def s_shape_picker_route(
        cls,
        layout: Dict[str, Any],
        shelf_ids: List[str],
    ) -> Tuple[List[str], List[str], float]:
        """
        Calculates Phase 06 S-Shape (Serpentine) route.
        Returns (route_nodes, ordered_stops, total_distance_meters).
        """
        graph = WarehouseGraph(layout)
        if not graph.dispatch_station:
            raise GraphError("Layout does not have a DISPATCH_STATION")

        dispatch_id = graph.dispatch_station["id"]

        # Deduplicate required shelf nodes
        unique_shelves = []
        for s in shelf_ids:
            if s in graph.nodes and s not in unique_shelves:
                unique_shelves.append(s)

        if not unique_shelves:
            # Only dispatch
            return [dispatch_id], [], 0.0

        # Group shelves by aisle
        aisle_groups: Dict[str, List[Dict[str, Any]]] = {}
        for s_id in unique_shelves:
            shelf_node = graph.nodes[s_id]
            aisle_id = shelf_node.get("aisle_id", "AISLE-01")
            if aisle_id not in aisle_groups:
                aisle_groups[aisle_id] = []
            aisle_groups[aisle_id].append(shelf_node)

        # Sort aisles by average x coordinate
        sorted_aisles = sorted(
            aisle_groups.keys(),
            key=lambda a_id: (
                aisle_groups[a_id][0].get("x", 0.0),
                a_id,
            )
        )

        # Sort shelves within each aisle: odd aisle ascending y, even aisle descending y
        ordered_stops: List[str] = []
        for idx, a_id in enumerate(sorted_aisles, 1):
            shelves_in_aisle = aisle_groups[a_id]
            reverse_y = (idx % 2 == 0)
            sorted_in_aisle = sorted(shelves_in_aisle, key=lambda s: float(s.get("y", 0.0)), reverse=reverse_y)
            for s in sorted_in_aisle:
                ordered_stops.append(s["id"])

        all_stops = [dispatch_id] + ordered_stops + [dispatch_id]

        full_route_nodes: List[str] = []
        total_dist = 0.0

        for i in range(len(all_stops) - 1):
            curr_stop = all_stops[i]
            next_stop = all_stops[i + 1]
            seg_path, seg_dist = graph.shortest_path_dijkstra(curr_stop, next_stop)
            total_dist += seg_dist

            if not full_route_nodes:
                full_route_nodes.extend(seg_path)
            else:
                full_route_nodes.extend(seg_path[1:])

        graph.validate_route(full_route_nodes, dispatch_id, unique_shelves)
        return full_route_nodes, ordered_stops, round(total_dist, 2)

    @classmethod
    def nearest_store_allocation(
        cls,
        orders: List[Dict[str, Any]],
        stores: List[Dict[str, Any]],
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Greedy nearest-eligible-store baseline allocation with sequential inventory deduction.
        """
        assignments: List[Dict[str, Any]] = []
        unallocated: List[Dict[str, Any]] = []

        # Local mutable copy of available inventory
        current_inventory: Dict[str, Dict[str, int]] = {}
        for s in stores:
            s_id = s["store_id"]
            current_inventory[s_id] = dict(s.get("available_inventory", {}))

        for order in orders:
            o_id = order["order_id"]
            c_lat = order["customer_latitude"]
            c_lon = order["customer_longitude"]
            lines = order["lines"]

            # Find candidates with serviceability and stock
            candidates = []
            for s in stores:
                s_id = s["store_id"]
                if s.get("status") != "ACTIVE":
                    continue

                dist = haversine_distance(c_lat, c_lon, s["latitude"], s["longitude"])
                if dist > s.get("service_radius_km", 15.0):
                    continue

                # Check complete basket
                has_stock = True
                for l in lines:
                    sku = l["sku_id"]
                    qty = l["quantity"]
                    avail = current_inventory[s_id].get(sku, 0)
                    if avail < qty:
                        has_stock = False
                        break

                if has_stock:
                    candidates.append((dist, s_id))

            if not candidates:
                unallocated.append({
                    "order_id": o_id,
                    "reason": "No store has complete basket inventory within service radius"
                })
                continue

            # Sort by distance, tie-break on store_id
            candidates.sort(key=lambda x: (x[0], x[1]))
            chosen_dist, chosen_store_id = candidates[0]

            # Reserve stock
            for l in lines:
                sku = l["sku_id"]
                qty = l["quantity"]
                current_inventory[chosen_store_id][sku] -= qty

            assignments.append({
                "order_id": o_id,
                "store_id": chosen_store_id,
                "distance_km": chosen_dist,
                "estimated_fulfillment_minutes": round(10.0 + chosen_dist * 2.0, 2),
            })

        return assignments, unallocated
