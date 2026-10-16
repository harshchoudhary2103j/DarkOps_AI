import statistics
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from src.evaluation.config import CostConfig, EvaluatorConfig
from src.evaluation.models import (
    EvaluationSummary,
    MetricObjective,
    MetricStatus,
    MetricValue,
)
from src.simulation.events import EventType, SimulationEvent


class EventDerivedEvaluator:
    """
    Event-Derived KPI Evaluator for DarkOps AI.
    Reconstructs operational state exclusively from recorded simulation events
    and evaluates service-level, efficiency, economic, and workload metrics.
    """

    def __init__(self, config: Optional[EvaluatorConfig] = None):
        self.config = config or EvaluatorConfig()

    def evaluate(
        self,
        run_id: str,
        scenario_id: str,
        seed: int,
        events: List[SimulationEvent],
        status: str = "SUCCEEDED",
        simulated_start_time: Optional[datetime] = None,
        simulated_end_time: Optional[datetime] = None,
        policy_identifiers: Optional[List[str]] = None,
        policy_config: Optional[Dict[str, Any]] = None,
        initial_physical_stock: int = 0,
        known_picker_count: Optional[int] = None,
    ) -> EvaluationSummary:
        """
        Executes strict event-derived evaluation over an ordered event stream.
        """
        cost_cfg = self.config.cost_config
        data_quality_warnings: List[str] = []

        if not events:
            data_quality_warnings.append("Event stream is empty; no events to evaluate.")
            return self._empty_summary(
                run_id=run_id,
                scenario_id=scenario_id,
                seed=seed,
                status=status,
                warnings=data_quality_warnings,
            )

        # 1. Canonical Ordering Validation
        # Events must be processed strictly by (virtual_timestamp, priority, sequence_number)
        sorted_events = sorted(
            events,
            key=lambda e: (e.virtual_timestamp, e.priority, e.sequence_number)
        )

        first_ts = sorted_events[0].virtual_timestamp
        last_ts = sorted_events[-1].virtual_timestamp
        sim_start = simulated_start_time or first_ts
        sim_end = simulated_end_time or last_ts
        sim_duration_seconds = max(0.0, (sim_end - sim_start).total_seconds())

        # 2. State Reconstruction Containers
        orders: Dict[str, Dict[str, Any]] = {}
        picking_tasks: Dict[str, Dict[str, Any]] = {}
        unique_purchase_orders: Set[str] = set()
        stockout_incidents = 0
        total_picker_distance = 0.0

        # Queue tracking (orders waiting in allocation queue)
        queue_timeline: List[Tuple[datetime, int]] = []
        current_queue_depth = 0
        peak_queue_depth = 0

        # Inventory movement tracking for holding cost
        # (timestamp, delta_physical)
        inventory_changes: List[Tuple[datetime, int]] = []

        # 3. Replay Events in Canonical Order
        for event in sorted_events:
            ts = event.virtual_timestamp
            p = event.payload or {}
            etype = event.event_type

            if etype == EventType.CUSTOMER_ORDER_ARRIVED:
                order_id = p.get("order_id", event.correlation_id)
                lines = p.get("lines", [])
                orders[order_id] = {
                    "order_id": order_id,
                    "arrived_at": ts,
                    "lines": lines,
                    "status": "ARRIVED",
                    "allocated_at": None,
                    "ready_at": None,
                    "cancelled_at": None,
                    "stockout_units": 0,
                    "is_terminal": False,
                    "is_fulfilled": False,
                    "picked_lines_count": 0,
                    "picked_units_count": 0,
                }
                # Entered queue
                current_queue_depth += 1
                if current_queue_depth > peak_queue_depth:
                    peak_queue_depth = current_queue_depth
                queue_timeline.append((ts, current_queue_depth))

            elif etype == EventType.ALLOCATION_REQUESTED:
                # If allocation failed immediately (recorded in result/payload)
                order_id = p.get("order_id", event.correlation_id)
                if order_id in orders:
                    # Queue exit attempt
                    pass

            elif etype == EventType.STOCK_RESERVED:
                order_id = p.get("order_id", event.correlation_id)
                if order_id in orders:
                    orders[order_id]["allocated_at"] = ts
                    orders[order_id]["status"] = "ALLOCATED"
                    # Exited allocation queue
                    if current_queue_depth > 0:
                        current_queue_depth -= 1
                    queue_timeline.append((ts, current_queue_depth))

            elif etype == EventType.PICKING_STARTED:
                task_id = p.get("task_id")
                order_id = p.get("order_id", event.correlation_id)
                route_meta = p.get("route", {})
                route_dist = float(route_meta.get("total_distance_meters", 0.0))
                total_picker_distance += route_dist

                picking_tasks[task_id] = {
                    "task_id": task_id,
                    "order_id": order_id,
                    "started_at": ts,
                    "completed_at": None,
                    "route_distance": route_dist,
                }
                if order_id in orders:
                    orders[order_id]["status"] = "PICKING"

            elif etype == EventType.ITEM_PICKED:
                task_id = p.get("task_id")
                qty = int(p.get("picked_quantity", 1))
                if task_id in picking_tasks:
                    order_id = picking_tasks[task_id]["order_id"]
                    if order_id in orders:
                        orders[order_id]["picked_units_count"] += qty

                # Physical stock decreases on pick
                inventory_changes.append((ts, -qty))

            elif etype == EventType.ITEM_MISSING:
                # Explicit missing item / stockout at picking stage
                task_id = p.get("task_id")
                missing_qty = int(p.get("missing_quantity", 1))
                stockout_incidents += 1
                if task_id in picking_tasks:
                    order_id = picking_tasks[task_id]["order_id"]
                    if order_id in orders:
                        orders[order_id]["stockout_units"] += missing_qty

            elif etype == EventType.PICKING_COMPLETED:
                task_id = p.get("task_id")
                order_id = p.get("order_id", event.correlation_id)
                if task_id in picking_tasks:
                    picking_tasks[task_id]["completed_at"] = ts

                if order_id in orders:
                    orders[order_id]["status"] = "READY"
                    orders[order_id]["ready_at"] = ts
                    orders[order_id]["is_terminal"] = True
                    orders[order_id]["is_fulfilled"] = True

            elif etype == EventType.ORDER_CANCELLED:
                order_id = p.get("order_id", event.correlation_id)
                if order_id in orders:
                    orders[order_id]["status"] = "CANCELLED"
                    orders[order_id]["cancelled_at"] = ts
                    orders[order_id]["is_terminal"] = True
                    if current_queue_depth > 0:
                        current_queue_depth -= 1
                    queue_timeline.append((ts, current_queue_depth))

            elif etype == EventType.SUPPLIER_DELIVERY_DUE:
                po_id = p.get("po_id", event.correlation_id)
                if po_id:
                    unique_purchase_orders.add(po_id)

            elif etype == EventType.STOCK_RECEIVED:
                qty = int(p.get("quantity", 0))
                if qty > 0:
                    inventory_changes.append((ts, qty))

        # Check for allocation-failed orders recorded as FAILED terminal states
        for order in orders.values():
            if not order["is_terminal"]:
                # If order never got allocated or picked, it reached FAILED terminal status
                if order["allocated_at"] is None and order["status"] != "READY":
                    order["status"] = "FAILED"
                    order["is_terminal"] = True
                    # Calculate unfulfilled requested units
                    req_units = sum(line.get("quantity", 1) for line in order["lines"])
                    order["stockout_units"] = req_units
                    stockout_incidents += 1
                    if current_queue_depth > 0:
                        current_queue_depth -= 1

        # 4. Compute KPIs
        kpis: Dict[str, MetricValue] = {}

        # ----------------------------------------------------------------------
        # A. Fulfillment & Service KPIs
        # ----------------------------------------------------------------------
        eligible_orders = [o for o in orders.values() if o["is_terminal"]]
        fulfilled_orders = [o for o in eligible_orders if o["is_fulfilled"]]

        # 1. Order Fill Rate
        if not eligible_orders:
            kpis["order_fill_rate"] = MetricValue(
                metric_name="order_fill_rate",
                value=0.0,
                unit="%",
                formula_ref="Fully Fulfilled Orders / Eligible Terminal Orders * 100",
                status=MetricStatus.ZERO if orders else MetricStatus.NOT_APPLICABLE,
                objective=MetricObjective.HIGHER_IS_BETTER,
                numerator=0.0,
                denominator=0.0,
                sample_count=0,
                warnings=["No orders reached terminal fulfillment status in evaluated run."],
            )
        else:
            ofr_val = round((len(fulfilled_orders) / len(eligible_orders)) * 100.0, 2)
            kpis["order_fill_rate"] = MetricValue(
                metric_name="order_fill_rate",
                value=ofr_val,
                unit="%",
                formula_ref="Fully Fulfilled Orders / Eligible Terminal Orders * 100",
                status=MetricStatus.AVAILABLE,
                objective=MetricObjective.HIGHER_IS_BETTER,
                numerator=float(len(fulfilled_orders)),
                denominator=float(len(eligible_orders)),
                sample_count=len(eligible_orders),
            )

        # 2. Line Fill Rate & Unit Fill Rate
        total_requested_units = 0
        total_picked_units = 0
        total_requested_lines = 0
        total_fulfilled_lines = 0
        total_stockout_units = 0

        for o in eligible_orders:
            lines = o["lines"]
            total_requested_lines += len(lines)
            order_req_units = sum(l.get("quantity", 1) for l in lines)
            total_requested_units += order_req_units
            total_picked_units += o["picked_units_count"]
            total_stockout_units += o["stockout_units"]

            if o["is_fulfilled"]:
                total_fulfilled_lines += len(lines)

        # Line Fill Rate
        if total_requested_lines == 0:
            kpis["line_fill_rate"] = MetricValue(
                metric_name="line_fill_rate",
                value=0.0,
                unit="%",
                formula_ref="Fully Fulfilled Order Lines / Eligible Order Lines * 100",
                status=MetricStatus.ZERO,
                objective=MetricObjective.HIGHER_IS_BETTER,
                numerator=0.0,
                denominator=0.0,
                sample_count=0,
            )
        else:
            lfr_val = round((total_fulfilled_lines / total_requested_lines) * 100.0, 2)
            kpis["line_fill_rate"] = MetricValue(
                metric_name="line_fill_rate",
                value=lfr_val,
                unit="%",
                formula_ref="Fully Fulfilled Order Lines / Eligible Order Lines * 100",
                status=MetricStatus.AVAILABLE,
                objective=MetricObjective.HIGHER_IS_BETTER,
                numerator=float(total_fulfilled_lines),
                denominator=float(total_requested_lines),
                sample_count=total_requested_lines,
            )

        # Unit Fill Rate
        if total_requested_units == 0:
            kpis["unit_fill_rate"] = MetricValue(
                metric_name="unit_fill_rate",
                value=0.0,
                unit="%",
                formula_ref="Successfully Picked Units / Requested Units * 100",
                status=MetricStatus.ZERO,
                objective=MetricObjective.HIGHER_IS_BETTER,
                numerator=0.0,
                denominator=0.0,
                sample_count=0,
            )
        else:
            ufr_val = round((total_picked_units / total_requested_units) * 100.0, 2)
            kpis["unit_fill_rate"] = MetricValue(
                metric_name="unit_fill_rate",
                value=ufr_val,
                unit="%",
                formula_ref="Successfully Picked Units / Requested Units * 100",
                status=MetricStatus.AVAILABLE,
                objective=MetricObjective.HIGHER_IS_BETTER,
                numerator=float(total_picked_units),
                denominator=float(total_requested_units),
                sample_count=total_requested_units,
            )

        # 3. Stockout Rate
        if total_requested_units == 0:
            kpis["stockout_rate"] = MetricValue(
                metric_name="stockout_rate",
                value=0.0,
                unit="%",
                formula_ref="Unfulfilled Requested Units Attributable to Stockout / Total Requested Units * 100",
                status=MetricStatus.ZERO,
                objective=MetricObjective.LOWER_IS_BETTER,
                numerator=0.0,
                denominator=0.0,
                sample_count=0,
            )
        else:
            stockout_rate_val = round((total_stockout_units / total_requested_units) * 100.0, 2)
            kpis["stockout_rate"] = MetricValue(
                metric_name="stockout_rate",
                value=stockout_rate_val,
                unit="%",
                formula_ref="Unfulfilled Requested Units Attributable to Stockout / Total Requested Units * 100",
                status=MetricStatus.AVAILABLE if stockout_rate_val > 0 else MetricStatus.ZERO,
                objective=MetricObjective.LOWER_IS_BETTER,
                numerator=float(total_stockout_units),
                denominator=float(total_requested_units),
                sample_count=total_requested_units,
            )

        # 4. Stockout Incidents Count
        kpis["stockout_incidents_count"] = MetricValue(
            metric_name="stockout_incidents_count",
            value=float(stockout_incidents),
            unit="incidents",
            formula_ref="Count of Distinct Stockout / Unfulfillable Order Rejections",
            status=MetricStatus.AVAILABLE if stockout_incidents > 0 else MetricStatus.ZERO,
            objective=MetricObjective.LOWER_IS_BETTER,
            sample_count=stockout_incidents,
        )

        # ----------------------------------------------------------------------
        # B. Operational Efficiency KPIs
        # ----------------------------------------------------------------------
        # 1. Picking Duration
        completed_tasks = [t for t in picking_tasks.values() if t["completed_at"] is not None]
        task_durations = [
            (t["completed_at"] - t["started_at"]).total_seconds()
            for t in completed_tasks
        ]

        if not task_durations:
            kpis["picking_duration_seconds"] = MetricValue(
                metric_name="picking_duration_seconds",
                value=0.0,
                unit="seconds",
                formula_ref="Picking Completion Time - Picking Start Time",
                status=MetricStatus.ZERO if picking_tasks else MetricStatus.INSUFFICIENT_DATA,
                objective=MetricObjective.LOWER_IS_BETTER,
                sample_count=0,
                warnings=["No picking tasks completed in evaluated run."],
            )
        else:
            mean_dur = round(statistics.mean(task_durations), 2)
            med_dur = round(statistics.median(task_durations), 2)
            kpis["picking_duration_seconds"] = MetricValue(
                metric_name="picking_duration_seconds",
                value=mean_dur,
                unit="seconds",
                formula_ref="Picking Completion Time - Picking Start Time",
                status=MetricStatus.AVAILABLE,
                objective=MetricObjective.LOWER_IS_BETTER,
                mean=mean_dur,
                median=med_dur,
                sample_count=len(task_durations),
            )

        # 2. Total Picker Travel Distance
        kpis["total_picker_travel_distance_meters"] = MetricValue(
            metric_name="total_picker_travel_distance_meters",
            value=round(total_picker_distance, 2),
            unit="meters",
            formula_ref="Sum of Valid Recorded Layout Graph Edge Distances",
            status=MetricStatus.AVAILABLE if total_picker_distance > 0 else MetricStatus.ZERO,
            objective=MetricObjective.LOWER_IS_BETTER,
            sample_count=len(picking_tasks),
        )

        # 3. Order Turnaround Time
        turnaround_times = [
            (o["ready_at"] - o["arrived_at"]).total_seconds()
            for o in fulfilled_orders
            if o["ready_at"] is not None and o["arrived_at"] is not None
        ]

        if not turnaround_times:
            kpis["order_turnaround_time_seconds"] = MetricValue(
                metric_name="order_turnaround_time_seconds",
                value=0.0,
                unit="seconds",
                formula_ref="Order Ready Time - Order Creation/Arrival Time",
                status=MetricStatus.INSUFFICIENT_DATA,
                objective=MetricObjective.LOWER_IS_BETTER,
                sample_count=0,
                warnings=["No orders successfully fulfilled to calculate turnaround time."],
            )
        else:
            mean_tat = round(statistics.mean(turnaround_times), 2)
            med_tat = round(statistics.median(turnaround_times), 2)
            kpis["order_turnaround_time_seconds"] = MetricValue(
                metric_name="order_turnaround_time_seconds",
                value=mean_tat,
                unit="seconds",
                formula_ref="Order Ready Time - Order Creation/Arrival Time",
                status=MetricStatus.AVAILABLE,
                objective=MetricObjective.LOWER_IS_BETTER,
                mean=mean_tat,
                median=med_tat,
                sample_count=len(turnaround_times),
            )

        # 4. Allocation Latency
        allocation_latencies = [
            (o["allocated_at"] - o["arrived_at"]).total_seconds()
            for o in orders.values()
            if o["allocated_at"] is not None and o["arrived_at"] is not None
        ]

        if not allocation_latencies:
            kpis["allocation_latency_seconds"] = MetricValue(
                metric_name="allocation_latency_seconds",
                value=0.0,
                unit="seconds",
                formula_ref="Order Allocation Time - Order Arrival Time",
                status=MetricStatus.ZERO if orders else MetricStatus.INSUFFICIENT_DATA,
                objective=MetricObjective.LOWER_IS_BETTER,
                sample_count=0,
            )
        else:
            mean_lat = round(statistics.mean(allocation_latencies), 2)
            med_lat = round(statistics.median(allocation_latencies), 2)
            kpis["allocation_latency_seconds"] = MetricValue(
                metric_name="allocation_latency_seconds",
                value=mean_lat,
                unit="seconds",
                formula_ref="Order Allocation Time - Order Arrival Time",
                status=MetricStatus.AVAILABLE,
                objective=MetricObjective.LOWER_IS_BETTER,
                mean=mean_lat,
                median=med_lat,
                sample_count=len(allocation_latencies),
            )

        # 5. Picker Active Time, Idle Time, and Utilization
        # Non-overlapping intervals union
        intervals: List[Tuple[float, float]] = []
        for t in completed_tasks:
            t_start = (t["started_at"] - sim_start).total_seconds()
            t_end = (t["completed_at"] - sim_start).total_seconds()
            if t_end > t_start:
                intervals.append((max(0.0, t_start), min(sim_duration_seconds, t_end)))

        # Merge intervals
        merged_intervals: List[Tuple[float, float]] = []
        for start, end in sorted(intervals, key=lambda x: x[0]):
            if not merged_intervals:
                merged_intervals.append((start, end))
            else:
                prev_start, prev_end = merged_intervals[-1]
                if start <= prev_end:
                    merged_intervals[-1] = (prev_start, max(prev_end, end))
                else:
                    merged_intervals.append((start, end))

        active_time_seconds = sum(end - start for start, end in merged_intervals)
        kpis["picker_active_time_seconds"] = MetricValue(
            metric_name="picker_active_time_seconds",
            value=round(active_time_seconds, 2),
            unit="seconds",
            formula_ref="Sum of Non-Overlapping Intervals Assigned to Active Picking",
            status=MetricStatus.AVAILABLE if active_time_seconds > 0 else MetricStatus.ZERO,
            objective=MetricObjective.NEUTRAL,
            sample_count=len(merged_intervals),
        )

        if known_picker_count is not None and known_picker_count > 0:
            total_available_seconds = known_picker_count * sim_duration_seconds
            idle_time = max(0.0, total_available_seconds - active_time_seconds)
            utilization = round((active_time_seconds / max(1.0, total_available_seconds)) * 100.0, 2)
            kpis["picker_idle_time_seconds"] = MetricValue(
                metric_name="picker_idle_time_seconds",
                value=round(idle_time, 2),
                unit="seconds",
                formula_ref="Observed Fleet Available Time - Active Time",
                status=MetricStatus.AVAILABLE,
                objective=MetricObjective.LOWER_IS_BETTER,
            )
            kpis["picker_utilization_percent"] = MetricValue(
                metric_name="picker_utilization_percent",
                value=utilization,
                unit="%",
                formula_ref="Active Time / Available Fleet Time * 100",
                status=MetricStatus.AVAILABLE,
                objective=MetricObjective.HIGHER_IS_BETTER,
            )
        else:
            kpis["picker_idle_time_seconds"] = MetricValue(
                metric_name="picker_idle_time_seconds",
                value=None,
                unit="seconds",
                formula_ref="Observed Fleet Available Time - Active Time",
                status=MetricStatus.INSUFFICIENT_DATA,
                objective=MetricObjective.LOWER_IS_BETTER,
                warnings=["Picker roster / fleet size not recorded in simulation events."],
            )
            kpis["picker_utilization_percent"] = MetricValue(
                metric_name="picker_utilization_percent",
                value=None,
                unit="%",
                formula_ref="Active Time / Available Fleet Time * 100",
                status=MetricStatus.INSUFFICIENT_DATA,
                objective=MetricObjective.HIGHER_IS_BETTER,
                warnings=["Picker roster / fleet size not recorded in simulation events."],
            )

        # ----------------------------------------------------------------------
        # C. Economic & Cost KPIs
        # ----------------------------------------------------------------------
        # 1. Inventory Holding Cost (Unit-Hours integral)
        holding_unit_hours = self._compute_inventory_unit_hours(
            sim_start=sim_start,
            sim_end=sim_end,
            initial_stock=initial_physical_stock,
            changes=inventory_changes,
        )
        holding_cost = round(holding_unit_hours * cost_cfg.carrying_cost_per_unit_hour, 2)
        kpis["inventory_holding_cost"] = MetricValue(
            metric_name="inventory_holding_cost",
            value=holding_cost,
            unit=cost_cfg.currency,
            formula_ref="Sum over SKUs of (Inventory Unit-Hours * Carrying Cost per Unit-Hour)",
            status=MetricStatus.AVAILABLE if holding_cost > 0 else MetricStatus.ZERO,
            objective=MetricObjective.LOWER_IS_BETTER,
            numerator=float(holding_unit_hours),
            warnings=[] if initial_physical_stock > 0 or inventory_changes else ["Initial inventory state absent; holding cost calculated from recorded movements."],
        )

        # 2. Estimated Stockout Penalty
        stockout_penalty = round(total_stockout_units * cost_cfg.stockout_penalty_per_unit, 2)
        kpis["estimated_stockout_penalty"] = MetricValue(
            metric_name="estimated_stockout_penalty",
            value=stockout_penalty,
            unit=cost_cfg.currency,
            formula_ref="Unfulfilled Stockout Units * Configured Stockout Penalty per Unit",
            status=MetricStatus.AVAILABLE if stockout_penalty > 0 else MetricStatus.ZERO,
            objective=MetricObjective.LOWER_IS_BETTER,
            numerator=float(total_stockout_units),
        )

        # 3. Purchase Order Transaction Cost
        po_count = len(unique_purchase_orders)
        po_cost = round(po_count * cost_cfg.cost_per_purchase_order, 2)
        kpis["purchase_order_transaction_cost"] = MetricValue(
            metric_name="purchase_order_transaction_cost",
            value=po_cost,
            unit=cost_cfg.currency,
            formula_ref="Count of Unique Eligible Purchase Orders * Cost per PO",
            status=MetricStatus.AVAILABLE if po_cost > 0 else MetricStatus.ZERO,
            objective=MetricObjective.LOWER_IS_BETTER,
            sample_count=po_count,
        )

        # 4. Expiry Waste Cost
        # As documented in Section 3.3.D of prompt, lot-level expiry tracking is not present in simulation events
        kpis["expiry_waste_cost"] = MetricValue(
            metric_name="expiry_waste_cost",
            value=0.0,
            unit=cost_cfg.currency,
            formula_ref="Expired Quantity * Configured Unit Waste Cost",
            status=MetricStatus.NOT_APPLICABLE,
            objective=MetricObjective.LOWER_IS_BETTER,
            warnings=["No lot-level expiry or spoilage events present in simulation event stream."],
        )

        # ----------------------------------------------------------------------
        # D. Workload & Queue KPIs
        # ----------------------------------------------------------------------
        kpis["peak_queue_depth"] = MetricValue(
            metric_name="peak_queue_depth",
            value=float(peak_queue_depth),
            unit="orders",
            formula_ref="Maximum Observed Orders Waiting in Allocation Queue",
            status=MetricStatus.AVAILABLE if peak_queue_depth > 0 else MetricStatus.ZERO,
            objective=MetricObjective.LOWER_IS_BETTER,
        )

        # Backlog order-hours (Area under curve)
        backlog_order_hours = self._compute_backlog_order_hours(
            sim_start=sim_start,
            sim_end=sim_end,
            queue_timeline=queue_timeline,
        )
        kpis["backlog_order_hours"] = MetricValue(
            metric_name="backlog_order_hours",
            value=round(backlog_order_hours, 2),
            unit="order-hours",
            formula_ref="Area under Allocation Queue Depth Curve over Simulated Time",
            status=MetricStatus.AVAILABLE if backlog_order_hours > 0 else MetricStatus.ZERO,
            objective=MetricObjective.LOWER_IS_BETTER,
        )

        sim_hours = max(0.001, sim_duration_seconds / 3600.0)
        mean_queue = round(backlog_order_hours / sim_hours, 2)
        kpis["mean_queue_depth"] = MetricValue(
            metric_name="mean_queue_depth",
            value=mean_queue,
            unit="orders",
            formula_ref="Backlog Order-Hours / Total Simulated Hours",
            status=MetricStatus.AVAILABLE if mean_queue > 0 else MetricStatus.ZERO,
            objective=MetricObjective.LOWER_IS_BETTER,
        )

        return EvaluationSummary(
            evaluation_id=f"eval_{run_id}_{uuid.uuid4().hex[:8]}",
            run_id=run_id,
            scenario_id=scenario_id,
            seed=seed,
            status=status,
            simulated_duration_seconds=round(sim_duration_seconds, 2),
            evaluator_version=self.config.evaluator_version,
            formula_version=self.config.formula_version,
            evaluated_at=datetime.now(timezone.utc).isoformat(),
            event_count=len(events),
            policy_identifiers=policy_identifiers or ["baseline_policies_v1"],
            policy_config=policy_config or {},
            cost_config=cost_cfg.model_dump(),
            kpis=kpis,
            data_quality_warnings=data_quality_warnings,
        )

    def _compute_inventory_unit_hours(
        self,
        sim_start: datetime,
        sim_end: datetime,
        initial_stock: int,
        changes: List[Tuple[datetime, int]],
    ) -> float:
        """
        Calculates time-weighted inventory unit-hours: integral of physical stock over time.
        """
        if sim_end <= sim_start:
            return 0.0

        total_unit_hours = 0.0
        current_stock = max(0, initial_stock)
        last_time = sim_start

        # Sort changes by timestamp
        sorted_changes = sorted(changes, key=lambda x: x[0])

        for event_time, delta in sorted_changes:
            if event_time > last_time:
                interval_hours = (event_time - last_time).total_seconds() / 3600.0
                total_unit_hours += current_stock * interval_hours
                last_time = event_time
            current_stock = max(0, current_stock + delta)

        if sim_end > last_time:
            interval_hours = (sim_end - last_time).total_seconds() / 3600.0
            total_unit_hours += current_stock * interval_hours

        return total_unit_hours

    def _compute_backlog_order_hours(
        self,
        sim_start: datetime,
        sim_end: datetime,
        queue_timeline: List[Tuple[datetime, int]],
    ) -> float:
        """
        Integrates queue depth step function across simulated time.
        """
        if not queue_timeline or sim_end <= sim_start:
            return 0.0

        sorted_points = sorted(queue_timeline, key=lambda x: x[0])
        total_order_hours = 0.0
        current_depth = 0
        last_time = sim_start

        for point_time, new_depth in sorted_points:
            if point_time > last_time:
                interval_hours = (point_time - last_time).total_seconds() / 3600.0
                total_order_hours += current_depth * interval_hours
                last_time = point_time
            current_depth = max(0, new_depth)

        if sim_end > last_time:
            interval_hours = (sim_end - last_time).total_seconds() / 3600.0
            total_order_hours += current_depth * interval_hours

        return total_order_hours

    def _empty_summary(
        self,
        run_id: str,
        scenario_id: str,
        seed: int,
        status: str,
        warnings: List[str],
    ) -> EvaluationSummary:
        return EvaluationSummary(
            evaluation_id=f"eval_{run_id}_{uuid.uuid4().hex[:8]}",
            run_id=run_id,
            scenario_id=scenario_id,
            seed=seed,
            status=status,
            simulated_duration_seconds=0.0,
            evaluator_version=self.config.evaluator_version,
            formula_version=self.config.formula_version,
            evaluated_at=datetime.now(timezone.utc).isoformat(),
            event_count=0,
            policy_identifiers=[],
            policy_config={},
            cost_config=self.config.cost_config.model_dump(),
            kpis={},
            data_quality_warnings=warnings,
        )
