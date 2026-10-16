from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from src.simulation.event_queue import EventQueue
from src.simulation.events import (
    EventType,
    PRIORITY_ALLOCATION_REQUESTED,
    PRIORITY_ITEM_PICK,
    PRIORITY_PICKING_COMPLETED,
    PRIORITY_PICKING_STARTED,
    PRIORITY_STOCK_RECEIVED,
    PRIORITY_STOCK_RESERVED,
    SimulationEvent,
)
from src.simulation.run_state import RunState


class EventHandlerRegistry:
    """
    Dispatches simulation events to dedicated domain handlers.
    Mutates run-scoped RunState and schedules downstream events into EventQueue.
    """

    def __init__(self, run_state: RunState, event_queue: EventQueue):
        self.state = run_state
        self.queue = event_queue

    def handle(self, event: SimulationEvent) -> Dict[str, Any]:
        handler_map = {
            EventType.CUSTOMER_ORDER_ARRIVED: self._handle_order_arrived,
            EventType.ALLOCATION_REQUESTED: self._handle_allocation_requested,
            EventType.STOCK_RESERVED: self._handle_stock_reserved,
            EventType.PICKING_STARTED: self._handle_picking_started,
            EventType.ITEM_PICKED: self._handle_item_picked,
            EventType.ITEM_MISSING: self._handle_item_missing,
            EventType.PICKING_COMPLETED: self._handle_picking_completed,
            EventType.ORDER_CANCELLED: self._handle_order_cancelled,
            EventType.SUPPLIER_DELIVERY_DUE: self._handle_supplier_delivery_due,
            EventType.STOCK_RECEIVED: self._handle_stock_received,
        }

        handler = handler_map.get(event.event_type)
        if not handler:
            raise ValueError(f"No handler registered for event type: {event.event_type}")

        return handler(event)

    def _handle_order_arrived(self, event: SimulationEvent) -> Dict[str, Any]:
        p = event.payload
        order_id = p["order_id"]

        order_record = {
            "id": order_id,
            "customer_id": p.get("customer_id"),
            "customer_latitude": p.get("customer_latitude"),
            "customer_longitude": p.get("customer_longitude"),
            "delivery_zone_id": p.get("delivery_zone_id"),
            "status": "CREATED",
            "line_count": p.get("line_count", len(p.get("lines", []))),
            "total_requested_units": p.get("total_requested_units", 0),
            "created_at": event.virtual_timestamp.isoformat(),
        }
        self.state.orders[order_id] = order_record
        self.state.order_lines[order_id] = p.get("lines", [])

        # Immediately schedule allocation evaluation
        self.queue.schedule(
            event_type=EventType.ALLOCATION_REQUESTED,
            virtual_timestamp=event.virtual_timestamp,
            priority=PRIORITY_ALLOCATION_REQUESTED,
            causation_id=event.event_id,
            correlation_id=order_id,
            payload={
                "order_id": order_id,
                "delivery_zone_id": p.get("delivery_zone_id"),
                "lines": p.get("lines", []),
            },
        )

        return {"order_id": order_id, "status": "CREATED"}

    def _handle_allocation_requested(self, event: SimulationEvent) -> Dict[str, Any]:
        p = event.payload
        order_id = p["order_id"]
        order = self.state.orders.get(order_id)
        if not order:
            return {"error": f"Order {order_id} not found"}

        order["status"] = "ALLOCATION_PENDING"
        lines = self.state.order_lines.get(order_id, [])

        # Find eligible candidate store
        candidate_store_id = self._find_candidate_store(order, lines)

        if not candidate_store_id:
            # Allocation failed due to stockout or coverage
            order["status"] = "FAILED"
            order["failure_code"] = "INSUFFICIENT_STOCK"
            order["failure_reason"] = "No candidate store possesses sufficient stock to fulfill the complete basket"
            return {"order_id": order_id, "status": "FAILED", "reason": order["failure_reason"]}

        # Atomically reserve stock across all lines
        reserved_lines = []
        for line in lines:
            sku_id = line["sku_id"]
            qty = line["quantity"]
            success = self.state.reserve_stock(
                store_id=candidate_store_id,
                sku_id=sku_id,
                quantity=qty,
                reference=f"ORD-{order_id}",
                virtual_timestamp=event.virtual_timestamp,
            )
            if success:
                reserved_lines.append((sku_id, qty))
            else:
                # Rollback partially reserved lines
                for r_sku, r_qty in reserved_lines:
                    self.state.release_stock(
                        store_id=candidate_store_id,
                        sku_id=r_sku,
                        quantity=r_qty,
                        reference=f"ROLLBACK-{order_id}",
                        virtual_timestamp=event.virtual_timestamp,
                    )
                order["status"] = "FAILED"
                order["failure_code"] = "INSUFFICIENT_STOCK"
                return {"order_id": order_id, "status": "FAILED", "reason": "Insufficient stock during atomic reservation"}

        # Reservation successful: Transition to ALLOCATED
        order["status"] = "ALLOCATED"
        order["store_id"] = candidate_store_id
        order["allocated_at"] = event.virtual_timestamp.isoformat()

        # Create picking task
        task_id = f"task_{self.state.run_id}_{order_id}"
        pick_items = []
        for idx, line in enumerate(lines, 1):
            item_id = f"item_{task_id}_{idx:02d}"
            pick_items.append({
                "id": item_id,
                "order_line_id": f"line_{order_id}_{idx:02d}",
                "sku_id": line["sku_id"],
                "requested_quantity": line["quantity"],
                "confirmed_picked_quantity": 0,
                "status": "PENDING",
            })

        self.state.picking_tasks[task_id] = {
            "id": task_id,
            "order_id": order_id,
            "store_id": candidate_store_id,
            "status": "PENDING",
            "created_at": event.virtual_timestamp.isoformat(),
        }
        self.state.pick_items[task_id] = pick_items

        # Schedule StockReserved audit event
        self.queue.schedule(
            event_type=EventType.STOCK_RESERVED,
            virtual_timestamp=event.virtual_timestamp,
            priority=PRIORITY_STOCK_RESERVED,
            causation_id=event.event_id,
            correlation_id=order_id,
            payload={"order_id": order_id, "store_id": candidate_store_id, "line_count": len(lines)},
        )

        # Schedule PickingStarted after 60 seconds dispatch delay
        dispatch_delay_seconds = 60
        self.queue.schedule(
            event_type=EventType.PICKING_STARTED,
            virtual_timestamp=event.virtual_timestamp + timedelta(seconds=dispatch_delay_seconds),
            priority=PRIORITY_PICKING_STARTED,
            causation_id=event.event_id,
            correlation_id=order_id,
            payload={"task_id": task_id, "order_id": order_id, "store_id": candidate_store_id},
        )

        return {"order_id": order_id, "status": "ALLOCATED", "store_id": candidate_store_id, "task_id": task_id}

    def _find_candidate_store(self, order: Dict[str, Any], lines: List[Dict[str, Any]]) -> Optional[str]:
        """
        Identifies a candidate store covering delivery zone with sufficient stock.
        """
        zone_id = order.get("delivery_zone_id")
        candidate_stores: List[str] = []

        if zone_id and zone_id in self.state.service_zones:
            store_id = self.state.service_zones[zone_id].get("store_id")
            if store_id and store_id in self.state.stores:
                candidate_stores.append(store_id)

        # Fallback to all active stores if zone not explicit
        if not candidate_stores:
            candidate_stores = list(self.state.stores.keys())

        for store_id in candidate_stores:
            can_fulfill = True
            for line in lines:
                pos = self.state.get_position(store_id, line["sku_id"])
                if not pos or pos.available_stock < line["quantity"]:
                    can_fulfill = False
                    break
            if can_fulfill:
                return store_id

        return None

    def _handle_stock_reserved(self, event: SimulationEvent) -> Dict[str, Any]:
        return {"status": "RECORDED"}

    def _handle_picking_started(self, event: SimulationEvent) -> Dict[str, Any]:
        p = event.payload
        task_id = p["task_id"]
        order_id = p["order_id"]
        store_id = p["store_id"]

        task = self.state.picking_tasks.get(task_id)
        order = self.state.orders.get(order_id)
        if task:
            task["status"] = "IN_PROGRESS"
            task["started_at"] = event.virtual_timestamp.isoformat()
        if order:
            order["status"] = "PICKING"

        pick_items = self.state.pick_items.get(task_id, [])
        sku_ids = [item["sku_id"] for item in pick_items]

        # Calculate picking duration based on warehouse graph traversal
        duration_seconds = self.state.compute_picking_duration_seconds(store_id, sku_ids)

        # Schedule item pick confirmations
        item_interval = duration_seconds / max(1, len(pick_items))
        for idx, item in enumerate(pick_items, 1):
            item_time = event.virtual_timestamp + timedelta(seconds=idx * item_interval)
            self.queue.schedule(
                event_type=EventType.ITEM_PICKED,
                virtual_timestamp=item_time,
                priority=PRIORITY_ITEM_PICK,
                causation_id=event.event_id,
                correlation_id=order_id,
                payload={
                    "task_id": task_id,
                    "item_id": item["id"],
                    "sku_id": item["sku_id"],
                    "picked_quantity": item["requested_quantity"],
                },
            )

        # Schedule picking completed at end of pick duration
        completed_time = event.virtual_timestamp + timedelta(seconds=duration_seconds)
        self.queue.schedule(
            event_type=EventType.PICKING_COMPLETED,
            virtual_timestamp=completed_time,
            priority=PRIORITY_PICKING_COMPLETED,
            causation_id=event.event_id,
            correlation_id=order_id,
            payload={"task_id": task_id, "order_id": order_id, "store_id": store_id},
        )

        return {"task_id": task_id, "status": "IN_PROGRESS", "estimated_duration_seconds": duration_seconds}

    def _handle_item_picked(self, event: SimulationEvent) -> Dict[str, Any]:
        p = event.payload
        task_id = p["task_id"]
        item_id = p["item_id"]
        qty = p["picked_quantity"]

        items = self.state.pick_items.get(task_id, [])
        for item in items:
            if item["id"] == item_id:
                item["confirmed_picked_quantity"] = qty
                item["status"] = "PICKED"
                break

        return {"item_id": item_id, "status": "PICKED"}

    def _handle_item_missing(self, event: SimulationEvent) -> Dict[str, Any]:
        p = event.payload
        task_id = p["task_id"]
        item_id = p["item_id"]
        missing_qty = p["missing_quantity"]

        items = self.state.pick_items.get(task_id, [])
        for item in items:
            if item["id"] == item_id:
                item["missing_quantity"] = missing_qty
                item["status"] = "MISSING"
                break

        return {"item_id": item_id, "status": "MISSING"}

    def _handle_picking_completed(self, event: SimulationEvent) -> Dict[str, Any]:
        p = event.payload
        task_id = p["task_id"]
        order_id = p["order_id"]
        store_id = p["store_id"]

        task = self.state.picking_tasks.get(task_id)
        order = self.state.orders.get(order_id)
        if task:
            task["status"] = "COMPLETED"
            task["completed_at"] = event.virtual_timestamp.isoformat()
        if order:
            order["status"] = "READY"
            order["completed_at"] = event.virtual_timestamp.isoformat()

        # Consume reserved inventory for all confirmed pick items
        items = self.state.pick_items.get(task_id, [])
        for item in items:
            picked_qty = item.get("confirmed_picked_quantity", item.get("requested_quantity", 0))
            if picked_qty > 0:
                self.state.consume_stock(
                    store_id=store_id,
                    sku_id=item["sku_id"],
                    quantity=picked_qty,
                    reference=f"PICK-{task_id}",
                    virtual_timestamp=event.virtual_timestamp,
                )

        return {"task_id": task_id, "order_id": order_id, "status": "COMPLETED"}

    def _handle_order_cancelled(self, event: SimulationEvent) -> Dict[str, Any]:
        p = event.payload
        order_id = p["order_id"]
        order = self.state.orders.get(order_id)
        if not order:
            return {"error": f"Order {order_id} not found"}

        order["status"] = "CANCELLED"
        order["cancelled_at"] = event.virtual_timestamp.isoformat()

        # Release any held reservations
        store_id = order.get("store_id")
        if store_id:
            lines = self.state.order_lines.get(order_id, [])
            for line in lines:
                self.state.release_stock(
                    store_id=store_id,
                    sku_id=line["sku_id"],
                    quantity=line["quantity"],
                    reference=f"CANCEL-{order_id}",
                    virtual_timestamp=event.virtual_timestamp,
                )

        return {"order_id": order_id, "status": "CANCELLED"}

    def _handle_supplier_delivery_due(self, event: SimulationEvent) -> Dict[str, Any]:
        p = event.payload
        store_id = p["store_id"]
        sku_id = p["sku_id"]
        quantity = p["quantity"]
        po_id = p.get("po_id", f"po_{self.state.run_id}")

        # Execute stock receipt
        pos = self.state.receive_stock(
            store_id=store_id,
            sku_id=sku_id,
            quantity=quantity,
            reference=f"DELIVERY-{po_id}",
            virtual_timestamp=event.virtual_timestamp,
            decrease_incoming=p.get("decrease_incoming", True),
        )

        # Schedule StockReceived event at same virtual timestamp
        self.queue.schedule(
            event_type=EventType.STOCK_RECEIVED,
            virtual_timestamp=event.virtual_timestamp,
            priority=PRIORITY_STOCK_RECEIVED,
            causation_id=event.event_id,
            correlation_id=po_id,
            payload={
                "store_id": store_id,
                "sku_id": sku_id,
                "quantity": quantity,
                "po_id": po_id,
                "physical_on_hand": pos.physical_on_hand,
                "available_stock": pos.available_stock,
            },
        )

        return {
            "po_id": po_id,
            "store_id": store_id,
            "sku_id": sku_id,
            "quantity": quantity,
            "resulting_physical": pos.physical_on_hand,
        }

    def _handle_stock_received(self, event: SimulationEvent) -> Dict[str, Any]:
        return {"status": "RECORDED"}
