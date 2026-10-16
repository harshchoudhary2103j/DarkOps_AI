import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from src.seeder.models import SyntheticWorld


@dataclass
class InventoryPosition:
    store_id: str
    sku_id: str
    physical_on_hand: int
    reserved_stock: int = 0
    incoming_units: int = 0

    @property
    def available_stock(self) -> int:
        return self.physical_on_hand - self.reserved_stock


@dataclass
class InventoryMovementRecord:
    id: str
    store_id: str
    sku_id: str
    movement_type: str  # 'INITIAL_RECEIPT' | 'SUPPLIER_RECEIPT' | 'RESERVATION_CONSUMED' | 'ADJUSTMENT'
    quantity: int
    delta_physical: int
    delta_reserved: int
    delta_incoming: int
    resulting_physical: int
    resulting_reserved: int
    resulting_available: int
    reference: str
    virtual_timestamp: datetime


class RunState:
    """
    Run-scoped isolated operational state for a single simulation run.

    Guarantees:
    - 100% boundary isolation: mutating RunState has zero side effects on concurrent runs or operational database
    - Strict adherence to Inventory Core invariants (available = physical - reserved; physical >= 0)
    - Full order lifecycle and picking state tracking
    """

    def __init__(self, run_id: str, world: Optional[SyntheticWorld] = None):
        self.run_id = run_id
        self.stores: Dict[str, Dict[str, Any]] = {}
        self.service_zones: Dict[str, Dict[str, Any]] = {}
        self.skus: Dict[str, Dict[str, Any]] = {}
        self.suppliers: Dict[str, Dict[str, Any]] = {}
        self.supplier_skus: List[Dict[str, Any]] = []
        self.warehouse_layouts: Dict[str, Dict[str, Any]] = {}
        self.inventory: Dict[Tuple[str, str], InventoryPosition] = {}
        self.ledger_movements: List[InventoryMovementRecord] = []

        self.orders: Dict[str, Dict[str, Any]] = {}
        self.order_lines: Dict[str, List[Dict[str, Any]]] = {}
        self.picking_tasks: Dict[str, Dict[str, Any]] = {}
        self.pick_items: Dict[str, List[Dict[str, Any]]] = {}

        if world is not None:
            self.initialize_from_world(world)

    def initialize_from_world(self, world: SyntheticWorld) -> None:
        """
        Populates run state from a synthetic world snapshot.
        """
        for store in world.stores:
            self.stores[store.id] = store.model_dump()

        for zone in world.service_zones:
            self.service_zones[zone.id] = zone.model_dump()

        for sku in world.skus:
            self.skus[sku.id] = sku.model_dump()

        for supplier in world.suppliers:
            self.suppliers[supplier.id] = supplier.model_dump()

        for ss in world.supplier_skus:
            self.supplier_skus.append(ss.model_dump())

        for layout in world.warehouse_layouts:
            self.warehouse_layouts[layout.store_id] = layout.model_dump()

        for inv in world.initial_inventory:
            pos = InventoryPosition(
                store_id=inv.store_id,
                sku_id=inv.sku_id,
                physical_on_hand=inv.initial_physical_on_hand,
                reserved_stock=0,
                incoming_units=0,
            )
            self.inventory[(inv.store_id, inv.sku_id)] = pos
            # Record initial balance ledger movement
            self.ledger_movements.append(
                InventoryMovementRecord(
                    id=f"mov_init_{self.run_id}_{inv.store_id}_{inv.sku_id}",
                    store_id=inv.store_id,
                    sku_id=inv.sku_id,
                    movement_type="INITIAL_RECEIPT",
                    quantity=inv.initial_physical_on_hand,
                    delta_physical=inv.initial_physical_on_hand,
                    delta_reserved=0,
                    delta_incoming=0,
                    resulting_physical=inv.initial_physical_on_hand,
                    resulting_reserved=0,
                    resulting_available=pos.available_stock,
                    reference=f"INIT-{world.scenario_id}",
                    virtual_timestamp=datetime.now(timezone.utc),
                )
            )

    # -------------------------------------------------------------------------
    # Inventory Core Operations
    # -------------------------------------------------------------------------

    def get_position(self, store_id: str, sku_id: str) -> Optional[InventoryPosition]:
        return self.inventory.get((store_id, sku_id))

    def reserve_stock(
        self,
        store_id: str,
        sku_id: str,
        quantity: int,
        reference: str,
        virtual_timestamp: datetime,
    ) -> bool:
        """
        Attempts to atomically reserve stock.
        Returns True if reservation succeeded, False if insufficient available stock.
        """
        pos = self.inventory.get((store_id, sku_id))
        if not pos or pos.available_stock < quantity:
            return False

        pos.reserved_stock += quantity
        self.ledger_movements.append(
            InventoryMovementRecord(
                id=f"mov_res_{self.run_id}_{len(self.ledger_movements)+1}",
                store_id=store_id,
                sku_id=sku_id,
                movement_type="STOCK_RESERVED",
                quantity=quantity,
                delta_physical=0,
                delta_reserved=quantity,
                delta_incoming=0,
                resulting_physical=pos.physical_on_hand,
                resulting_reserved=pos.reserved_stock,
                resulting_available=pos.available_stock,
                reference=reference,
                virtual_timestamp=virtual_timestamp,
            )
        )
        return True

    def release_stock(
        self,
        store_id: str,
        sku_id: str,
        quantity: int,
        reference: str,
        virtual_timestamp: datetime,
    ) -> None:
        pos = self.inventory.get((store_id, sku_id))
        if not pos:
            return
        actual_release = min(quantity, pos.reserved_stock)
        pos.reserved_stock -= actual_release
        self.ledger_movements.append(
            InventoryMovementRecord(
                id=f"mov_rel_{self.run_id}_{len(self.ledger_movements)+1}",
                store_id=store_id,
                sku_id=sku_id,
                movement_type="STOCK_RELEASED",
                quantity=actual_release,
                delta_physical=0,
                delta_reserved=-actual_release,
                delta_incoming=0,
                resulting_physical=pos.physical_on_hand,
                resulting_reserved=pos.reserved_stock,
                resulting_available=pos.available_stock,
                reference=reference,
                virtual_timestamp=virtual_timestamp,
            )
        )

    def consume_stock(
        self,
        store_id: str,
        sku_id: str,
        quantity: int,
        reference: str,
        virtual_timestamp: datetime,
    ) -> None:
        """
        Consumes reserved stock upon picking completion.
        Reduces both physical and reserved; available remains unchanged.
        """
        pos = self.inventory.get((store_id, sku_id))
        if not pos:
            return
        actual_consume = min(quantity, pos.physical_on_hand)
        pos.physical_on_hand -= actual_consume
        pos.reserved_stock = max(0, pos.reserved_stock - actual_consume)
        self.ledger_movements.append(
            InventoryMovementRecord(
                id=f"mov_con_{self.run_id}_{len(self.ledger_movements)+1}",
                store_id=store_id,
                sku_id=sku_id,
                movement_type="STOCK_CONSUMED",
                quantity=actual_consume,
                delta_physical=-actual_consume,
                delta_reserved=-actual_consume,
                delta_incoming=0,
                resulting_physical=pos.physical_on_hand,
                resulting_reserved=pos.reserved_stock,
                resulting_available=pos.available_stock,
                reference=reference,
                virtual_timestamp=virtual_timestamp,
            )
        )

    def receive_stock(
        self,
        store_id: str,
        sku_id: str,
        quantity: int,
        reference: str,
        virtual_timestamp: datetime,
        decrease_incoming: bool = True,
    ) -> InventoryPosition:
        """
        Receives supplier shipment into inventory.
        Increases physical on hand; decreases incoming units if expected.
        """
        key = (store_id, sku_id)
        if key not in self.inventory:
            self.inventory[key] = InventoryPosition(store_id=store_id, sku_id=sku_id, physical_on_hand=0)

        pos = self.inventory[key]
        delta_incoming = -min(pos.incoming_units, quantity) if decrease_incoming else 0
        pos.physical_on_hand += quantity
        if decrease_incoming:
            pos.incoming_units = max(0, pos.incoming_units - quantity)

        self.ledger_movements.append(
            InventoryMovementRecord(
                id=f"mov_rec_{self.run_id}_{len(self.ledger_movements)+1}",
                store_id=store_id,
                sku_id=sku_id,
                movement_type="SUPPLIER_RECEIPT",
                quantity=quantity,
                delta_physical=quantity,
                delta_reserved=0,
                delta_incoming=delta_incoming,
                resulting_physical=pos.physical_on_hand,
                resulting_reserved=pos.reserved_stock,
                resulting_available=pos.available_stock,
                reference=reference,
                virtual_timestamp=virtual_timestamp,
            )
        )
        return pos

    # -------------------------------------------------------------------------
    # Warehouse Navigation & Picking Duration
    # -------------------------------------------------------------------------

    def compute_picking_duration_seconds(self, store_id: str, sku_ids: List[str]) -> float:
        """
        Computes realistic picking duration based on warehouse graph traversal distances.
        Traverses from dispatch station DS-01 through shelf locations of requested SKUs.
        Walking speed: 1.2 m/s + 10s per item pick time.
        """
        layout = self.warehouse_layouts.get(store_id)
        if not layout:
            return 30.0 + len(sku_ids) * 15.0

        nodes = {n["id"]: n for n in layout.get("nodes", [])}
        dispatch_node = next((n for n in nodes.values() if n.get("type") == "DISPATCH_STATION"), None)
        if not dispatch_node:
            dispatch_node = next(iter(nodes.values()), {"x": 0.0, "y": 0.0, "z": 0.0})

        # Locate shelf nodes
        shelf_nodes = []
        for sku_id in sku_ids:
            target_shelf = next(
                (n for n in nodes.values() if n.get("type") == "SHELF" and n.get("zone") == sku_id),
                None
            )
            if not target_shelf:
                target_shelf = next((n for n in nodes.values() if n.get("type") == "SHELF"), dispatch_node)
            shelf_nodes.append(target_shelf)

        # Calculate Euclidean route distance: DS -> shelf1 -> shelf2 -> ... -> DS
        total_distance = 0.0
        current = dispatch_node
        for shelf in shelf_nodes:
            dx = shelf["x"] - current["x"]
            dy = shelf["y"] - current["y"]
            dz = shelf["z"] - current["z"]
            total_distance += math.sqrt(dx * dx + dy * dy + dz * dz)
            current = shelf

        # Return to dispatch station
        dx = dispatch_node["x"] - current["x"]
        dy = dispatch_node["y"] - current["y"]
        dz = dispatch_node["z"] - current["z"]
        total_distance += math.sqrt(dx * dx + dy * dy + dz * dz)

        walk_time = total_distance / 1.2  # 1.2 m/s average walk speed
        pick_time = len(sku_ids) * 10.0   # 10s per item pick
        return round(max(20.0, walk_time + pick_time), 2)
