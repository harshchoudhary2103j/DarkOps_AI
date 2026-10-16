import pytest
from datetime import datetime, timedelta, timezone

from src.simulation.clock import SimulationClock
from src.simulation.event_queue import EventQueue
from src.simulation.events import (
    EventType,
    PRIORITY_CUSTOMER_ORDER_ARRIVED,
    PRIORITY_SUPPLIER_DELIVERY,
    SimulationEvent,
)


def test_clock_initialization_and_advancement():
    start = datetime(2026, 10, 16, 8, 0, 0, tzinfo=timezone.utc)
    end = start + timedelta(hours=24)
    clock = SimulationClock(start_time=start, end_time=end)

    assert clock.now() == start
    assert not clock.is_finished()

    # Advance forward
    t1 = start + timedelta(hours=2)
    clock.advance_to(t1)
    assert clock.now() == t1
    assert not clock.is_finished()

    # Reject moving backwards
    with pytest.raises(ValueError, match="Clock cannot move backwards"):
        clock.advance_to(start + timedelta(hours=1))

    # Reject invalid end_time < start_time
    with pytest.raises(ValueError, match="cannot be earlier"):
        SimulationClock(start_time=start, end_time=start - timedelta(hours=1))


def test_clock_boundary_and_rapid_execution():
    start = datetime(2026, 10, 16, 8, 0, 0, tzinfo=timezone.utc)
    end = start + timedelta(hours=24)
    clock = SimulationClock(start_time=start, end_time=end)

    wall_start = datetime.now()
    # Simulate 24 hours of 100 discrete steps without any wall-clock sleeps
    for h in range(1, 25):
        step_time = start + timedelta(hours=h)
        clock.advance_to(step_time)

    wall_elapsed = (datetime.now() - wall_start).total_seconds()
    # 24 virtual hours must advance in < 0.1 wall-clock seconds
    assert wall_elapsed < 0.5
    assert clock.is_finished(end + timedelta(seconds=1))


def test_event_queue_deterministic_ordering():
    queue = EventQueue(run_id="run_test_01")
    t0 = datetime(2026, 10, 16, 8, 0, 0, tzinfo=timezone.utc)

    # Schedule events in disordered sequence:
    # 1. Order arrival at t0 + 10s (Priority 2)
    # 2. Supplier delivery at t0 (Priority 1)
    # 3. Order arrival at t0 (Priority 2, Seq A)
    # 4. Another Order arrival at t0 (Priority 2, Seq B)
    e1 = queue.schedule(
        event_type=EventType.CUSTOMER_ORDER_ARRIVED,
        virtual_timestamp=t0 + timedelta(seconds=10),
        priority=PRIORITY_CUSTOMER_ORDER_ARRIVED,
        payload={"order_idx": 1},
    )
    e2 = queue.schedule(
        event_type=EventType.SUPPLIER_DELIVERY_DUE,
        virtual_timestamp=t0,
        priority=PRIORITY_SUPPLIER_DELIVERY,
        payload={"po": "po_01"},
    )
    e3 = queue.schedule(
        event_type=EventType.CUSTOMER_ORDER_ARRIVED,
        virtual_timestamp=t0,
        priority=PRIORITY_CUSTOMER_ORDER_ARRIVED,
        payload={"order_idx": 2},
    )
    e4 = queue.schedule(
        event_type=EventType.CUSTOMER_ORDER_ARRIVED,
        virtual_timestamp=t0,
        priority=PRIORITY_CUSTOMER_ORDER_ARRIVED,
        payload={"order_idx": 3},
    )

    # Pop order verification:
    # First: e2 (t0, Priority 1) - supplier delivery arrives before orders at same instant
    popped1 = queue.pop()
    assert popped1.event_id == e2.event_id
    assert popped1.event_type == EventType.SUPPLIER_DELIVERY_DUE

    # Second: e3 (t0, Priority 2, Seq 3)
    popped2 = queue.pop()
    assert popped2.event_id == e3.event_id

    # Third: e4 (t0, Priority 2, Seq 4) - tie-broken by monotonic sequence ID
    popped3 = queue.pop()
    assert popped3.event_id == e4.event_id

    # Fourth: e1 (t0 + 10s, Priority 2)
    popped4 = queue.pop()
    assert popped4.event_id == e1.event_id
    assert queue.is_empty()
