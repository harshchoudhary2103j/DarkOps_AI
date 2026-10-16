from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from src.policies.allocation import AllocationStatus, BaselineOrderAllocationPolicy
from src.policies.config import BaselinePolicyConfig
from src.policies.replenishment import BaselineReplenishmentPolicy
from src.policies.routing import BaselinePickerRoutingPolicy
from src.simulation.events import (
    EventType,
    PRIORITY_ITEM_PICK,
    PRIORITY_PICKING_COMPLETED,
    PRIORITY_PICKING_STARTED,
    PRIORITY_STOCK_RECEIVED,
    PRIORITY_STOCK_RESERVED,
    PRIORITY_SUPPLIER_DELIVERY,
    SimulationEvent,
)

if TYPE_CHECKING:
    from src.simulation.event_queue import EventQueue
    from src.simulation.run_state import RunState


class SimulationPolicyAdapter:
    """
    Simulation policy adapter binding baseline heuristics (Replenishment, Allocation, Routing)
    to the Discrete-Event Simulation engine and event lifecycle.
    """

    def __init__(
        self,
        config: BaselinePolicyConfig,
        replenishment_policy: BaselineReplenishmentPolicy,
        allocation_policy: BaselineOrderAllocationPolicy,
        routing_policy: BaselinePickerRoutingPolicy,
    ):
        self.config = config
        self.replenishment = replenishment_policy
        self.allocation = allocation_policy
        self.routing = routing_policy
        self.generated_po_counter = 0

    def handle_allocation(
        self,
        event: SimulationEvent,
        run_state: RunState,
        event_queue: EventQueue,
    ) -> Dict[str, Any]:
        """
        Executes baseline greedy nearest-store allocation with basket inventory reservation.
        """
        p = event.payload
        order_id = p["order_id"]
        order = run_state.orders.get(order_id)
        if not order:
            return {"error": f"Order {order_id} not found"}

        order["status"] = "ALLOCATION_PENDING"
        lines = run_state.order_lines.get(order_id, [])

        lat = order.get("customer_latitude", 40.7128)
        lon = order.get("customer_longitude", -74.0060)
        zone_id = order.get("delivery_zone_id")

        outcome = self.allocation.evaluate_and_allocate(
            run_state=run_state,
            order_id=order_id,
            customer_latitude=lat,
            customer_longitude=lon,
            delivery_zone_id=zone_id,
            lines=lines,
            virtual_timestamp=event.virtual_timestamp,
        )

        if outcome.status != AllocationStatus.ALLOCATED:
            order["status"] = "FAILED"
            order["failure_code"] = outcome.status.value
            order["failure_reason"] = outcome.reason or "Allocation policy rejected order"
            return {
                "order_id": order_id,
                "status": "FAILED",
                "code": outcome.status.value,
                "reason": order["failure_reason"],
            }

        store_id = outcome.selected_store_id
        order["status"] = "ALLOCATED"
        order["store_id"] = store_id
        order["allocated_at"] = event.virtual_timestamp.isoformat()

        # Create picking task
        task_id = f"task_{run_state.run_id}_{order_id}"
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

        run_state.picking_tasks[task_id] = {
            "id": task_id,
            "order_id": order_id,
            "store_id": store_id,
            "status": "PENDING",
            "created_at": event.virtual_timestamp.isoformat(),
        }
        run_state.pick_items[task_id] = pick_items

        # Schedule StockReserved event
        event_queue.schedule(
            event_type=EventType.STOCK_RESERVED,
            virtual_timestamp=event.virtual_timestamp,
            priority=PRIORITY_STOCK_RESERVED,
            causation_id=event.event_id,
            correlation_id=order_id,
            payload={
                "order_id": order_id,
                "store_id": store_id,
                "distance_km": outcome.distance_km,
                "line_count": len(lines),
            },
        )

        # Trigger Baseline Replenishment Evaluation for affected SKUs
        self._evaluate_replenishment_triggers(store_id, lines, run_state, event_queue, event)

        # Plan Picker Route via S-Shape Routing Policy
        layout = run_state.warehouse_layouts.get(store_id, {})
        picker_route = self.routing.plan_picker_route(
            task_id=task_id,
            store_id=store_id,
            layout=layout,
            items=pick_items,
        )

        # Schedule PickingStarted after configured dispatch delay
        dispatch_delay = timedelta(seconds=self.config.dispatch_delay_seconds)
        event_queue.schedule(
            event_type=EventType.PICKING_STARTED,
            virtual_timestamp=event.virtual_timestamp + dispatch_delay,
            priority=PRIORITY_PICKING_STARTED,
            causation_id=event.event_id,
            correlation_id=order_id,
            payload={
                "task_id": task_id,
                "order_id": order_id,
                "store_id": store_id,
                "route": {
                    "total_distance_meters": picker_route.total_distance_meters,
                    "travel_duration_seconds": picker_route.travel_duration_seconds,
                    "pick_duration_seconds": picker_route.pick_duration_seconds,
                    "total_duration_seconds": picker_route.total_duration_seconds,
                    "node_count": len(picker_route.route_nodes),
                    "route_nodes": picker_route.route_nodes,
                },
            },
        )

        return {
            "order_id": order_id,
            "status": "ALLOCATED",
            "store_id": store_id,
            "task_id": task_id,
            "distance_km": outcome.distance_km,
            "route_distance_meters": picker_route.total_distance_meters,
        }

    def _evaluate_replenishment_triggers(
        self,
        store_id: str,
        lines: List[Dict[str, Any]],
        run_state: RunState,
        event_queue: EventQueue,
        trigger_event: SimulationEvent,
    ) -> None:
        """
        Evaluates reorder points for SKUs whose inventory position changed.
        """
        for line in lines:
            sku_id = line["sku_id"]
            pos = run_state.get_position(store_id, sku_id)
            if not pos:
                continue

            decision = self.replenishment.evaluate_replenishment(
                store_id=store_id,
                sku_id=sku_id,
                physical_on_hand=pos.physical_on_hand,
                reserved_stock=pos.reserved_stock,
                incoming_units=pos.incoming_units,
            )

            if decision is not None:
                self.generated_po_counter += 1
                po_id = f"po_replenish_{run_state.run_id}_{self.generated_po_counter:04d}"

                # Update in-flight incoming units immediately to prevent duplicate orders
                pos.incoming_units += decision.order_quantity

                # Schedule SupplierDeliveryDue at virtual time: t + lead_time
                lead_time_delta = timedelta(days=decision.lead_time_days)
                delivery_time = trigger_event.virtual_timestamp + lead_time_delta

                event_queue.schedule(
                    event_type=EventType.SUPPLIER_DELIVERY_DUE,
                    virtual_timestamp=delivery_time,
                    priority=PRIORITY_SUPPLIER_DELIVERY,
                    causation_id=trigger_event.event_id,
                    correlation_id=po_id,
                    payload={
                        "po_id": po_id,
                        "supplier_id": decision.supplier_id,
                        "store_id": store_id,
                        "sku_id": sku_id,
                        "quantity": decision.order_quantity,
                        "decrease_incoming": True,
                        "reorder_point": decision.reorder_point,
                        "order_up_to": decision.order_up_to_level,
                    },
                )

    def handle_picking_started(
        self,
        event: SimulationEvent,
        run_state: RunState,
        event_queue: EventQueue,
    ) -> Dict[str, Any]:
        p = event.payload
        task_id = p["task_id"]
        order_id = p["order_id"]
        store_id = p["store_id"]
        route_meta = p.get("route", {})
        total_duration = route_meta.get("total_duration_seconds", 60.0)

        task = run_state.picking_tasks.get(task_id)
        order = run_state.orders.get(order_id)
        if task:
            task["status"] = "IN_PROGRESS"
            task["started_at"] = event.virtual_timestamp.isoformat()
        if order:
            order["status"] = "PICKING"

        pick_items = run_state.pick_items.get(task_id, [])
        interval = total_duration / max(1, len(pick_items))

        # Schedule ItemPicked events along the planned route progression
        for idx, item in enumerate(pick_items, 1):
            item_time = event.virtual_timestamp + timedelta(seconds=idx * interval)
            event_queue.schedule(
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

        # Schedule PickingCompleted at end of route duration
        completion_time = event.virtual_timestamp + timedelta(seconds=total_duration)
        event_queue.schedule(
            event_type=EventType.PICKING_COMPLETED,
            virtual_timestamp=completion_time,
            priority=PRIORITY_PICKING_COMPLETED,
            causation_id=event.event_id,
            correlation_id=order_id,
            payload={"task_id": task_id, "order_id": order_id, "store_id": store_id},
        )

        return {"task_id": task_id, "status": "IN_PROGRESS", "total_duration_seconds": total_duration}
