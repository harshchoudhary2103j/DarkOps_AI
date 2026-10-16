from datetime import datetime, timedelta, timezone

from src.evaluation.evaluator import EventDerivedEvaluator
from src.evaluation.models import MetricStatus
from src.simulation.events import (
    EventType,
    PRIORITY_CUSTOMER_ORDER_ARRIVED,
    PRIORITY_ORDER_CANCELLED,
    SimulationEvent,
)


def test_empty_event_stream_edge_case():
    """
    An empty event stream must not crash with exceptions,
    and must return a summary with data quality warnings.
    """
    evaluator = EventDerivedEvaluator()
    summary = evaluator.evaluate(
        run_id="run_empty",
        scenario_id="scen_empty",
        seed=1,
        events=[],
    )
    assert summary.event_count == 0
    assert len(summary.data_quality_warnings) > 0
    assert "empty" in summary.data_quality_warnings[0].lower()


def test_zero_orders_edge_case():
    """
    A run with only supplier events and zero customer orders must safely compute
    all fill rates and turnaround times as ZERO or NOT_APPLICABLE without division-by-zero.
    """
    t0 = datetime(2026, 10, 16, 10, 0, 0, tzinfo=timezone.utc)
    events = [
        SimulationEvent(
            run_id="run_zero_orders",
            event_id="e1",
            sequence_number=1,
            event_type=EventType.SUPPLIER_DELIVERY_DUE,
            virtual_timestamp=t0,
            payload={"po_id": "po_99", "quantity": 50},
        ),
        SimulationEvent(
            run_id="run_zero_orders",
            event_id="e2",
            sequence_number=2,
            event_type=EventType.STOCK_RECEIVED,
            virtual_timestamp=t0,
            payload={"quantity": 50},
        ),
    ]
    evaluator = EventDerivedEvaluator()
    summary = evaluator.evaluate(
        run_id="run_zero_orders",
        scenario_id="scen_zero",
        seed=2,
        events=events,
        simulated_start_time=t0,
        simulated_end_time=t0 + timedelta(hours=1),
    )

    kpis = summary.kpis
    assert kpis["order_fill_rate"].value == 0.0
    assert kpis["order_fill_rate"].status in (MetricStatus.ZERO, MetricStatus.NOT_APPLICABLE)
    assert kpis["unit_fill_rate"].value == 0.0
    assert kpis["stockout_rate"].value == 0.0
    assert kpis["purchase_order_transaction_cost"].value == 25.0


def test_one_hundred_percent_stockout_edge_case():
    """
    Every arrived order fails allocation due to stockout:
    - Order fill rate must be 0%
    - Unit fill rate must be 0%
    - Stockout rate must be 100%
    """
    t0 = datetime(2026, 10, 16, 10, 0, 0, tzinfo=timezone.utc)
    events = []
    for i in range(3):
        events.append(
            SimulationEvent(
                run_id="run_stockout",
                event_id=f"e_{i}",
                sequence_number=i + 1,
                event_type=EventType.CUSTOMER_ORDER_ARRIVED,
                virtual_timestamp=t0 + timedelta(minutes=i),
                priority=PRIORITY_CUSTOMER_ORDER_ARRIVED,
                payload={"order_id": f"ord_{i}", "lines": [{"sku_id": "SKU_X", "quantity": 10}]},
            )
        )

    evaluator = EventDerivedEvaluator()
    summary = evaluator.evaluate(
        run_id="run_stockout",
        scenario_id="scen_out_of_stock",
        seed=3,
        events=events,
        simulated_start_time=t0,
        simulated_end_time=t0 + timedelta(hours=1),
    )

    kpis = summary.kpis
    assert kpis["order_fill_rate"].value == 0.0
    assert kpis["unit_fill_rate"].value == 0.0
    assert kpis["stockout_rate"].value == 100.0
    assert kpis["stockout_incidents_count"].value == 3.0
    assert kpis["estimated_stockout_penalty"].value == 3 * 10 * 5.0  # 30 units * $5 = $150


def test_cancelled_order_handling():
    """
    Cancelled orders must be accounted for as terminal outcomes and not misclassified as stockouts.
    """
    t0 = datetime(2026, 10, 16, 10, 0, 0, tzinfo=timezone.utc)
    events = [
        SimulationEvent(
            run_id="run_cancel",
            event_id="e1",
            sequence_number=1,
            event_type=EventType.CUSTOMER_ORDER_ARRIVED,
            virtual_timestamp=t0,
            priority=PRIORITY_CUSTOMER_ORDER_ARRIVED,
            payload={"order_id": "ord_cancel", "lines": [{"sku_id": "SKU_1", "quantity": 2}]},
        ),
        SimulationEvent(
            run_id="run_cancel",
            event_id="e2",
            sequence_number=2,
            event_type=EventType.ORDER_CANCELLED,
            virtual_timestamp=t0 + timedelta(minutes=5),
            priority=PRIORITY_ORDER_CANCELLED,
            payload={"order_id": "ord_cancel", "reason": "Customer change of mind"},
        ),
    ]

    evaluator = EventDerivedEvaluator()
    summary = evaluator.evaluate(
        run_id="run_cancel",
        scenario_id="scen_cancel",
        seed=4,
        events=events,
        simulated_start_time=t0,
        simulated_end_time=t0 + timedelta(hours=1),
    )

    kpis = summary.kpis
    assert kpis["order_fill_rate"].value == 0.0
    # Customer cancellation is NOT a stockout
    assert kpis["stockout_rate"].value == 0.0
    assert kpis["stockout_incidents_count"].value == 0.0
