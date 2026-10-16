import heapq
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from src.simulation.events import (
    DEFAULT_PRIORITIES,
    EventStatus,
    EventType,
    SimulationEvent,
)


class EventQueue:
    """
    Deterministic Priority Queue ordered by:
    (virtual_timestamp, priority, sequence_number)

    Invariants:
    - Lower priority numbers execute first
    - Events with identical timestamps and priorities execute in monotonic insertion sequence order
    - Retains 100% determinism regardless of dictionary iteration or heap implementation details
    """

    def __init__(self, run_id: str):
        self._run_id = run_id
        self._heap: List[Tuple[datetime, int, int, SimulationEvent]] = []
        self._sequence_counter = 0

    @property
    def run_id(self) -> str:
        return self._run_id

    @property
    def current_sequence(self) -> int:
        return self._sequence_counter

    def schedule(
        self,
        event_type: EventType,
        virtual_timestamp: datetime,
        payload: Dict[str, Any],
        causation_id: Optional[str] = None,
        correlation_id: Optional[str] = None,
        priority: Optional[int] = None,
    ) -> SimulationEvent:
        """
        Creates a new SimulationEvent with the next monotonic sequence number and pushes it to the queue.
        """
        self._sequence_counter += 1
        seq = self._sequence_counter

        ts_utc = (
            virtual_timestamp.replace(tzinfo=timezone.utc)
            if virtual_timestamp.tzinfo is None
            else virtual_timestamp.astimezone(timezone.utc)
        )

        prio = priority if priority is not None else DEFAULT_PRIORITIES.get(event_type, 5)
        event_id = f"evt_{self._run_id}_{seq:06d}"

        event = SimulationEvent(
            run_id=self._run_id,
            event_id=event_id,
            sequence_number=seq,
            event_type=event_type,
            virtual_timestamp=ts_utc,
            priority=prio,
            causation_id=causation_id,
            correlation_id=correlation_id,
            payload=payload,
            status=EventStatus.SCHEDULED,
        )

        heapq.heappush(self._heap, (ts_utc, prio, seq, event))
        return event

    def push(self, event: SimulationEvent) -> None:
        """
        Pushes an existing SimulationEvent to the heap.
        """
        ts_utc = (
            event.virtual_timestamp.replace(tzinfo=timezone.utc)
            if event.virtual_timestamp.tzinfo is None
            else event.virtual_timestamp.astimezone(timezone.utc)
        )
        if event.sequence_number > self._sequence_counter:
            self._sequence_counter = event.sequence_number
        heapq.heappush(self._heap, (ts_utc, event.priority, event.sequence_number, event))

    def pop(self) -> SimulationEvent:
        """
        Pops and returns the next earliest SimulationEvent.
        """
        if not self._heap:
            raise IndexError("Cannot pop from an empty EventQueue")
        _, _, _, event = heapq.heappop(self._heap)
        return event

    def peek(self) -> Optional[SimulationEvent]:
        """
        Returns the next earliest SimulationEvent without removing it from the queue.
        """
        if not self._heap:
            return None
        return self._heap[0][3]

    def is_empty(self) -> bool:
        return len(self._heap) == 0

    def __len__(self) -> int:
        return len(self._heap)

    def clear(self) -> None:
        self._heap.clear()
        self._sequence_counter = 0
