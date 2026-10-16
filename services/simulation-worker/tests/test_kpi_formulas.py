from datetime import datetime, timedelta, timezone

from src.evaluation.config import CostConfig, EvaluatorConfig
from src.evaluation.evaluator import EventDerivedEvaluator
from src.evaluation.models import MetricStatus
from src.simulation.events import (
    EventType,
    PRIORITY_ALLOCATION_REQUESTED,
    PRIORITY_CUSTOMER_ORDER_ARRIVED,
    PRIORITY_ITEM_PICK,
    PRIORITY_PICKING_COMPLETED,
    PRIORITY_PICKING_STARTED,
    PRIORITY_STOCK_RECEIVED,
    PRIORITY_STOCK_RESERVED,
    PRIORITY_SUPPLIER_DELIVERY,
    SimulationEvent,
)


def test_deterministic_kpi_formulas_on_manual_fixture():
    """
    Constructs a deterministic synthetic event fixture with manually calculated expected metrics:
    - Order 1 (ord_01): arrived at t+0m, allocated at t+1m, 2 lines (qty 2, qty 3 = 5 units),
      picking started at t+2m (route distance 120.0m), picked 5 units, completed at t+4m (duration 120s, turnaround 240s).
    - Order 2 (ord_02): arrived at t+5m, allocated at t+6m, 1 line (qty 4 = 4 units),
      picking started at t+7m (route distance 80.0m), picked 4 units, completed at t+10m (duration 180s, turnaround 300s).
    - Order 3 (ord_03): arrived at t+10m, allocation failed due to stockout (stockout_units = 3).
    - Supplier Delivery: 1 PO arrived at t+0m with 10 units received.
    - Initial stock: 10 units.

    Manually Calculated Targets:
    - Total eligible orders: 3 (ord_01: READY, ord_02: READY, ord_03: FAILED)
    - Fulfilled orders: 2 (ord_01, ord_02)
    - Order Fill Rate: 2 / 3 * 100 = 66.67%
    - Total requested units: 5 + 4 + 3 = 12 units
    - Total picked units: 5 + 4 = 9 units
    - Unit Fill Rate: 9 / 12 * 100 = 75.0%
    - Total requested lines: 2 + 1 + 1 = 4 lines
    - Fulfilled lines: 2 (from ord_01) + 1 (from ord_02) = 3 lines
    - Line Fill Rate: 3 / 4 * 100 = 75.0%
    - Stockout units: 3 units
    - Stockout Rate: 3 / 12 * 100 = 25.0%
    - Stockout Incidents: 1
    - Picking tasks: 2 tasks (120s and 180s)
      - Mean picking duration: (120 + 180) / 2 = 150.0s
      - Median picking duration: 150.0s
    - Total picker distance: 120.0 + 80.0 = 200.0m
    - Turnaround times: 240s and 300s
      - Mean turnaround: (240 + 300) / 2 = 270.0s
      - Median turnaround: 270.0s
    - Allocation latencies: ord_01: 60s, ord_02: 60s -> Mean: 60.0s
    - Peak queue depth: 1 order
    - Purchase orders: 1 PO (po_01)
      - PO cost: 1 * $25.0 = $25.0
    - Stockout penalty: 3 units * $5.0 = $15.0
    """
    t0 = datetime(2026, 10, 16, 10, 0, 0, tzinfo=timezone.utc)
    events = [
        # Supplier delivery PO-01 at t+0m (qty 10)
        SimulationEvent(
            run_id="run_test",
            event_id="evt_01",
            sequence_number=1,
            event_type=EventType.SUPPLIER_DELIVERY_DUE,
            virtual_timestamp=t0,
            priority=PRIORITY_SUPPLIER_DELIVERY,
            payload={"po_id": "po_01", "quantity": 10},
        ),
        SimulationEvent(
            run_id="run_test",
            event_id="evt_02",
            sequence_number=2,
            event_type=EventType.STOCK_RECEIVED,
            virtual_timestamp=t0,
            priority=PRIORITY_STOCK_RECEIVED,
            payload={"quantity": 10},
        ),
        # Order 1: Arrives t+0m
        SimulationEvent(
            run_id="run_test",
            event_id="evt_03",
            sequence_number=3,
            event_type=EventType.CUSTOMER_ORDER_ARRIVED,
            virtual_timestamp=t0,
            priority=PRIORITY_CUSTOMER_ORDER_ARRIVED,
            payload={
                "order_id": "ord_01",
                "lines": [
                    {"sku_id": "sku_A", "quantity": 2},
                    {"sku_id": "sku_B", "quantity": 3},
                ],
            },
        ),
        # Order 1: Allocated t+1m
        SimulationEvent(
            run_id="run_test",
            event_id="evt_04",
            sequence_number=4,
            event_type=EventType.STOCK_RESERVED,
            virtual_timestamp=t0 + timedelta(minutes=1),
            priority=PRIORITY_STOCK_RESERVED,
            payload={"order_id": "ord_01"},
        ),
        # Order 1: Picking starts t+2m
        SimulationEvent(
            run_id="run_test",
            event_id="evt_05",
            sequence_number=5,
            event_type=EventType.PICKING_STARTED,
            virtual_timestamp=t0 + timedelta(minutes=2),
            priority=PRIORITY_PICKING_STARTED,
            payload={
                "task_id": "task_01",
                "order_id": "ord_01",
                "route": {"total_distance_meters": 120.0},
            },
        ),
        # Order 1: Items picked
        SimulationEvent(
            run_id="run_test",
            event_id="evt_06",
            sequence_number=6,
            event_type=EventType.ITEM_PICKED,
            virtual_timestamp=t0 + timedelta(minutes=3),
            priority=PRIORITY_ITEM_PICK,
            payload={"task_id": "task_01", "picked_quantity": 5},
        ),
        # Order 1: Picking completed t+4m (duration = 120s, tat = 240s)
        SimulationEvent(
            run_id="run_test",
            event_id="evt_07",
            sequence_number=7,
            event_type=EventType.PICKING_COMPLETED,
            virtual_timestamp=t0 + timedelta(minutes=4),
            priority=PRIORITY_PICKING_COMPLETED,
            payload={"task_id": "task_01", "order_id": "ord_01"},
        ),
        # Order 2: Arrives t+5m
        SimulationEvent(
            run_id="run_test",
            event_id="evt_08",
            sequence_number=8,
            event_type=EventType.CUSTOMER_ORDER_ARRIVED,
            virtual_timestamp=t0 + timedelta(minutes=5),
            priority=PRIORITY_CUSTOMER_ORDER_ARRIVED,
            payload={
                "order_id": "ord_02",
                "lines": [{"sku_id": "sku_A", "quantity": 4}],
            },
        ),
        # Order 2: Allocated t+6m
        SimulationEvent(
            run_id="run_test",
            event_id="evt_09",
            sequence_number=9,
            event_type=EventType.STOCK_RESERVED,
            virtual_timestamp=t0 + timedelta(minutes=6),
            priority=PRIORITY_STOCK_RESERVED,
            payload={"order_id": "ord_02"},
        ),
        # Order 2: Picking starts t+7m
        SimulationEvent(
            run_id="run_test",
            event_id="evt_10",
            sequence_number=10,
            event_type=EventType.PICKING_STARTED,
            virtual_timestamp=t0 + timedelta(minutes=7),
            priority=PRIORITY_PICKING_STARTED,
            payload={
                "task_id": "task_02",
                "order_id": "ord_02",
                "route": {"total_distance_meters": 80.0},
            },
        ),
        # Order 2: Items picked
        SimulationEvent(
            run_id="run_test",
            event_id="evt_11",
            sequence_number=11,
            event_type=EventType.ITEM_PICKED,
            virtual_timestamp=t0 + timedelta(minutes=9),
            priority=PRIORITY_ITEM_PICK,
            payload={"task_id": "task_02", "picked_quantity": 4},
        ),
        # Order 2: Picking completed t+10m (duration = 180s, tat = 300s)
        SimulationEvent(
            run_id="run_test",
            event_id="evt_12",
            sequence_number=12,
            event_type=EventType.PICKING_COMPLETED,
            virtual_timestamp=t0 + timedelta(minutes=10),
            priority=PRIORITY_PICKING_COMPLETED,
            payload={"task_id": "task_02", "order_id": "ord_02"},
        ),
        # Order 3: Arrives t+10m (allocation fails immediately due to stockout)
        SimulationEvent(
            run_id="run_test",
            event_id="evt_13",
            sequence_number=13,
            event_type=EventType.CUSTOMER_ORDER_ARRIVED,
            virtual_timestamp=t0 + timedelta(minutes=10),
            priority=PRIORITY_CUSTOMER_ORDER_ARRIVED,
            payload={
                "order_id": "ord_03",
                "lines": [{"sku_id": "sku_C", "quantity": 3}],
            },
        ),
    ]

    cost_cfg = CostConfig(
        carrying_cost_per_unit_hour=0.002,
        stockout_penalty_per_unit=5.0,
        cost_per_purchase_order=25.0,
        currency="USD",
    )
    evaluator = EventDerivedEvaluator(EvaluatorConfig(cost_config=cost_cfg))
    summary = evaluator.evaluate(
        run_id="run_manual_fixture",
        scenario_id="scenario_manual",
        seed=123,
        events=events,
        simulated_start_time=t0,
        simulated_end_time=t0 + timedelta(minutes=15),
    )

    kpis = summary.kpis

    # Assertions against manual calculation
    assert kpis["order_fill_rate"].value == 66.67
    assert kpis["order_fill_rate"].numerator == 2.0
    assert kpis["order_fill_rate"].denominator == 3.0
    assert kpis["order_fill_rate"].status == MetricStatus.AVAILABLE

    assert kpis["unit_fill_rate"].value == 75.0
    assert kpis["unit_fill_rate"].numerator == 9.0
    assert kpis["unit_fill_rate"].denominator == 12.0
    assert kpis["unit_fill_rate"].status == MetricStatus.AVAILABLE

    assert kpis["line_fill_rate"].value == 75.0
    assert kpis["line_fill_rate"].numerator == 3.0
    assert kpis["line_fill_rate"].denominator == 4.0
    assert kpis["line_fill_rate"].status == MetricStatus.AVAILABLE

    assert kpis["stockout_rate"].value == 25.0
    assert kpis["stockout_rate"].numerator == 3.0
    assert kpis["stockout_rate"].denominator == 12.0
    assert kpis["stockout_rate"].status == MetricStatus.AVAILABLE

    assert kpis["stockout_incidents_count"].value == 1.0

    assert kpis["picking_duration_seconds"].value == 150.0
    assert kpis["picking_duration_seconds"].median == 150.0
    assert kpis["picking_duration_seconds"].sample_count == 2

    assert kpis["total_picker_travel_distance_meters"].value == 200.0

    assert kpis["order_turnaround_time_seconds"].value == 270.0
    assert kpis["order_turnaround_time_seconds"].median == 270.0
    assert kpis["order_turnaround_time_seconds"].sample_count == 2

    assert kpis["allocation_latency_seconds"].value == 60.0
    assert kpis["allocation_latency_seconds"].sample_count == 2

    assert kpis["purchase_order_transaction_cost"].value == 25.0
    assert kpis["estimated_stockout_penalty"].value == 15.0
    assert kpis["expiry_waste_cost"].status == MetricStatus.NOT_APPLICABLE
    assert kpis["peak_queue_depth"].value == 1.0
