from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from src.seeder.models import PurchaseOrderSchedule, SyntheticWorld
from src.simulation.clock import SimulationClock
from src.simulation.event_queue import EventQueue
from src.simulation.event_store import EventStore
from src.simulation.events import (
    DEFAULT_PRIORITIES,
    EventType,
    PRIORITY_SUPPLIER_DELIVERY,
    SimulationEvent,
)
from src.simulation.handlers import EventHandlerRegistry
from src.simulation.jobs import JobStatus, SimulationJob
from src.simulation.run_state import RunState


class SimulationEngine:
    """
    Core Discrete-Event Simulation (DES) Engine for DarkOps AI.

    Invariants:
    - Strictly driven by virtual time (SimulationClock)
    - Zero wall-clock sleeps
    - Deterministic event priority queue with monotonic sequence counter
    - 100% run isolation via dedicated RunState
    - Clean pause, resume, and cancellation support
    """

    def __init__(
        self,
        run_id: str,
        world: SyntheticWorld,
        start_time: datetime,
        end_time: datetime,
        seed: int,
        config_snapshot: Optional[Dict[str, Any]] = None,
    ):
        self.run_id = run_id
        self.world = world
        self.seed = seed
        self.start_time = start_time.replace(tzinfo=timezone.utc) if start_time.tzinfo is None else start_time.astimezone(timezone.utc)
        self.end_time = end_time.replace(tzinfo=timezone.utc) if end_time.tzinfo is None else end_time.astimezone(timezone.utc)
        self.config_snapshot = config_snapshot or {}

        # Core components
        self.clock = SimulationClock(start_time=self.start_time, end_time=self.end_time)
        self.event_queue = EventQueue(run_id=run_id)
        self.state = RunState(run_id=run_id, world=world)
        self.handlers = EventHandlerRegistry(run_state=self.state, event_queue=self.event_queue)
        self.event_store = EventStore(run_id=run_id)

        self.job = SimulationJob(
            run_id=run_id,
            scenario_id=world.scenario_id,
            seed=seed,
            status=JobStatus.QUEUED,
            start_time=self.start_time,
            end_time=self.end_time,
            current_virtual_time=self.start_time,
            config_snapshot=self.config_snapshot,
        )

        self._is_paused = False
        self._is_cancelled = False
        self._cancellation_reason: Optional[str] = None

    @property
    def is_paused(self) -> bool:
        return self._is_paused

    @property
    def is_cancelled(self) -> bool:
        return self._is_cancelled

    def schedule_supplier_deliveries(self, schedules: Optional[List[PurchaseOrderSchedule]] = None) -> int:
        """
        Schedules planned supplier purchase order deliveries into the event queue.
        Uses planned PO schedules from the synthetic world or explicit list.
        """
        po_schedules = schedules if schedules is not None else self.world.purchase_orders
        scheduled_count = 0

        for po in po_schedules:
            date_val = po.expected_delivery_date
            if isinstance(date_val, str):
                try:
                    delivery_time = datetime.fromisoformat(date_val.replace("Z", "+00:00"))
                except ValueError:
                    delivery_time = datetime.strptime(date_val, "%Y-%m-%d").replace(hour=14, minute=0, second=0, tzinfo=timezone.utc)
            elif isinstance(date_val, datetime):
                delivery_time = date_val
            else:
                continue

            if delivery_time.tzinfo is None:
                delivery_time = delivery_time.replace(tzinfo=timezone.utc)
            else:
                delivery_time = delivery_time.astimezone(timezone.utc)

            # Only schedule deliveries within simulation horizon
            if self.start_time <= delivery_time <= self.end_time:
                for line in po.lines:
                    self.event_queue.schedule(
                        event_type=EventType.SUPPLIER_DELIVERY_DUE,
                        virtual_timestamp=delivery_time,
                        priority=PRIORITY_SUPPLIER_DELIVERY,
                        causation_id=f"plan_{po.po_id}",
                        correlation_id=po.po_id,
                        payload={
                            "po_id": po.po_id,
                            "supplier_id": po.supplier_id,
                            "store_id": po.store_id,
                            "sku_id": line.sku_id,
                            "quantity": line.quantity,
                            "decrease_incoming": True,
                        },
                    )
                    scheduled_count += 1

        return scheduled_count

    def step(self) -> Optional[SimulationEvent]:
        """
        Executes a single next event from the queue.
        Returns the processed event or None if finished/paused.
        """
        if self._is_paused or self._is_cancelled:
            return None

        if self.event_queue.is_empty():
            return None

        next_event = self.event_queue.peek()
        if not next_event:
            return None

        # Check end time boundary
        if self.clock.is_finished(next_event.virtual_timestamp):
            return None

        event = self.event_queue.pop()

        # Advance virtual clock strictly to event virtual timestamp
        self.clock.advance_to(event.virtual_timestamp)

        # Dispatch event to domain handler
        try:
            result = self.handlers.handle(event)
            self.event_store.record(event, result)
        except Exception as e:
            self.event_store.record(event, {"error": str(e)}, error_message=str(e))
            self.job.fail(str(e))
            raise

        self.job.event_count = self.event_store.count()
        self.job.current_virtual_time = self.clock.now()

        return event

    def run_all(self) -> int:
        """
        Executes events until queue is empty or end time is reached.
        Returns the total number of processed events.
        """
        if self.job.status == JobStatus.QUEUED:
            self.job.start()

        while not self._is_paused and not self._is_cancelled and not self.event_queue.is_empty():
            event = self.step()
            if event is None:
                break

        if self._is_cancelled:
            self.job.cancel(self._cancellation_reason or "Cancelled by operator")
        elif not self._is_paused:
            self.job.complete()

        return self.event_store.count()

    def run_until(self, target_time: datetime) -> int:
        """
        Runs until the virtual clock reaches or exceeds target_time.
        """
        target_utc = target_time.replace(tzinfo=timezone.utc) if target_time.tzinfo is None else target_time.astimezone(timezone.utc)
        if self.job.status == JobStatus.QUEUED:
            self.job.start()

        while not self._is_paused and not self._is_cancelled and not self.event_queue.is_empty():
            peek = self.event_queue.peek()
            if not peek or peek.virtual_timestamp > target_utc:
                break
            self.step()

        return self.event_store.count()

    def pause(self) -> None:
        """
        Pauses event processing at the next safe event boundary.
        Preserves queue, sequence counter, and random streams intact.
        """
        self._is_paused = True
        self.job.pause()

    def resume(self) -> int:
        """
        Resumes processing from the preserved virtual state without re-generating arrivals.
        """
        self._is_paused = False
        self.job.resume()
        return self.run_all()

    def cancel(self, reason: Optional[str] = "Cancelled by operator") -> None:
        """
        Gracefully terminates the simulation run.
        """
        self._is_cancelled = True
        self._cancellation_reason = reason
        self.job.cancel(reason)

    def sha256_fingerprint(self) -> str:
        return self.event_store.sha256_fingerprint()
