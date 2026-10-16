"""
Cross-entity, domain, and graph validation for synthetic world datasets.
"""

from collections import deque
from typing import Dict, List, Set
from .models import SyntheticWorld, WarehouseLayoutPayload


class ValidationError(Exception):
    """Raised when synthetic world validation fails."""
    pass


def validate_world(world: SyntheticWorld) -> None:
    """
    Performs comprehensive referential integrity and graph traversability validation.
    Fails fast with actionable messages if any invariant is violated.
    """
    store_ids: Set[str] = {s.id for s in world.stores}
    product_ids: Set[str] = {p.id for p in world.products}
    sku_ids: Set[str] = {s.id for s in world.skus}
    supplier_ids: Set[str] = {s.id for s in world.suppliers}

    if len(store_ids) != len(world.stores):
        raise ValidationError("Duplicate store IDs detected")
    if len(product_ids) != len(world.products):
        raise ValidationError("Duplicate product IDs detected")
    if len(sku_ids) != len(world.skus):
        raise ValidationError("Duplicate SKU IDs detected")
    if len(supplier_ids) != len(world.suppliers):
        raise ValidationError("Duplicate supplier IDs detected")

    # 1. Validate Product references in SKUs
    for sku in world.skus:
        if sku.product_id not in product_ids:
            raise ValidationError(f"SKU '{sku.id}' references nonexistent product '{sku.product_id}'")

    # 2. Validate Store references in Service Zones
    for zone in world.service_zones:
        if zone.store_id not in store_ids:
            raise ValidationError(f"Service zone '{zone.id}' references nonexistent store '{zone.store_id}'")
        _validate_polygon(zone.boundary.coordinates, f"Service zone '{zone.id}'")

    # 3. Validate Polygons in Stores
    for store in world.stores:
        _validate_polygon(store.service_area.coordinates, f"Store '{store.id}'")

    # 4. Validate Warehouse Layouts and Graph Traversability
    layout_store_ids: Set[str] = set()
    for layout in world.warehouse_layouts:
        if layout.store_id not in store_ids:
            raise ValidationError(f"Layout '{layout.id}' references nonexistent store '{layout.store_id}'")
        if layout.store_id in layout_store_ids:
            raise ValidationError(f"Multiple active layouts generated for store '{layout.store_id}'")
        layout_store_ids.add(layout.store_id)
        validate_warehouse_graph(layout)

    # 5. Validate Supplier-SKU references
    for ss in world.supplier_skus:
        if ss.supplier_id not in supplier_ids:
            raise ValidationError(f"SupplierSku references nonexistent supplier '{ss.supplier_id}'")
        if ss.sku_id not in sku_ids:
            raise ValidationError(f"SupplierSku references nonexistent SKU '{ss.sku_id}'")

    # 6. Validate Initial Inventory references and uniqueness
    inv_keys: Set[tuple] = set()
    for inv in world.initial_inventory:
        if inv.store_id not in store_ids:
            raise ValidationError(f"Inventory position references nonexistent store '{inv.store_id}'")
        if inv.sku_id not in sku_ids:
            raise ValidationError(f"Inventory position references nonexistent SKU '{inv.sku_id}'")
        key = (inv.store_id, inv.sku_id)
        if key in inv_keys:
            raise ValidationError(f"Duplicate inventory position for store '{inv.store_id}' and SKU '{inv.sku_id}'")
        inv_keys.add(key)

    # 7. Validate Historical Sales references
    for sale in world.historical_sales:
        if sale.store_id not in store_ids:
            raise ValidationError(f"Historical sale references nonexistent store '{sale.store_id}'")
        if sale.sku_id not in sku_ids:
            raise ValidationError(f"Historical sale references nonexistent SKU '{sale.sku_id}'")

    # 8. Validate Purchase Order references
    for po in world.purchase_orders:
        if po.store_id not in store_ids:
            raise ValidationError(f"Purchase order '{po.po_id}' references nonexistent store '{po.store_id}'")
        if po.supplier_id not in supplier_ids:
            raise ValidationError(f"Purchase order '{po.po_id}' references nonexistent supplier '{po.supplier_id}'")
        for line in po.lines:
            if line.sku_id not in sku_ids:
                raise ValidationError(f"Purchase order line references nonexistent SKU '{line.sku_id}'")


def _validate_polygon(coords: List[List[List[float]]], context: str) -> None:
    if not coords or len(coords) < 1:
        raise ValidationError(f"{context}: Polygon must contain at least one linear ring")
    exterior = coords[0]
    if len(exterior) < 4:
        raise ValidationError(f"{context}: Linear ring must contain at least 4 coordinates")
    # First and last coordinate must be identical
    if exterior[0] != exterior[-1]:
        raise ValidationError(f"{context}: Polygon linear ring must be closed (first and last coordinate identical)")


def validate_warehouse_graph(layout: WarehouseLayoutPayload) -> None:
    """
    Validates warehouse navigation graph:
    1. All edge endpoints exist in nodes.
    2. Dispatch station exists.
    3. Every shelf node is reachable from the dispatch station via BFS.
    """
    node_ids = {n.id for n in layout.nodes}
    dispatch_stations = [n for n in layout.nodes if n.type == "DISPATCH_STATION"]
    shelf_nodes = [n for n in layout.nodes if n.type == "SHELF"]

    if not dispatch_stations:
        raise ValidationError(f"Warehouse layout '{layout.id}' has no DISPATCH_STATION node")

    if not shelf_nodes:
        raise ValidationError(f"Warehouse layout '{layout.id}' has no SHELF nodes")

    adj: Dict[str, List[str]] = {nid: [] for nid in node_ids}

    for edge in layout.edges:
        if edge.from_node not in node_ids:
            raise ValidationError(f"Edge references nonexistent from_node '{edge.from_node}' in layout '{layout.id}'")
        if edge.to_node not in node_ids:
            raise ValidationError(f"Edge references nonexistent to_node '{edge.to_node}' in layout '{layout.id}'")
        if edge.distance < 0:
            raise ValidationError(f"Edge from '{edge.from_node}' to '{edge.to_node}' has negative distance")

        adj[edge.from_node].append(edge.to_node)
        if edge.bidirectional:
            adj[edge.to_node].append(edge.from_node)

    # BFS from the first dispatch station
    start_node = dispatch_stations[0].id
    visited: Set[str] = set()
    queue = deque([start_node])
    visited.add(start_node)

    while queue:
        curr = queue.popleft()
        for neighbor in adj.get(curr, []):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)

    # Check reachability of all shelf nodes
    unreachable_shelves = [s.id for s in shelf_nodes if s.id not in visited]
    if unreachable_shelves:
        raise ValidationError(
            f"Warehouse layout '{layout.id}' has {len(unreachable_shelves)} unreachable shelf nodes from station: {unreachable_shelves[:5]}"
        )
