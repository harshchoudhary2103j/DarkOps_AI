from datetime import datetime, timezone
from typing import Optional


class SimulationClock:
    """
    Virtual discrete-event clock for DarkOps AI simulation runs.

    Invariants:
    - Independent of host wall-clock time; never uses time.sleep()
    - Advances strictly monotonically to the virtual timestamp of scheduled events
    - Never moves backwards in time
    - All timestamps are UTC-aware
    """

    def __init__(self, start_time: datetime, end_time: Optional[datetime] = None):
        if start_time.tzinfo is None:
            self._current_time = start_time.replace(tzinfo=timezone.utc)
        else:
            self._current_time = start_time.astimezone(timezone.utc)

        self._start_time = self._current_time

        if end_time is not None:
            if end_time.tzinfo is None:
                self._end_time: Optional[datetime] = end_time.replace(tzinfo=timezone.utc)
            else:
                self._end_time = end_time.astimezone(timezone.utc)
            if self._end_time < self._start_time:
                raise ValueError(
                    f"Simulation end_time ({self._end_time.isoformat()}) cannot be earlier "
                    f"than start_time ({self._start_time.isoformat()})"
                )
        else:
            self._end_time = None

    @property
    def start_time(self) -> datetime:
        return self._start_time

    @property
    def end_time(self) -> Optional[datetime]:
        return self._end_time

    def now(self) -> datetime:
        return self._current_time

    def advance_to(self, target_time: datetime) -> datetime:
        """
        Advances the virtual clock to target_time.
        Rejects any timestamp earlier than the current virtual time.
        """
        if target_time.tzinfo is None:
            target_utc = target_time.replace(tzinfo=timezone.utc)
        else:
            target_utc = target_time.astimezone(timezone.utc)

        if target_utc < self._current_time:
            raise ValueError(
                f"Clock cannot move backwards: target {target_utc.isoformat()} "
                f"< current {self._current_time.isoformat()}"
            )

        self._current_time = target_utc
        return self._current_time

    def is_finished(self, check_time: Optional[datetime] = None) -> bool:
        """
        Checks whether the simulation has reached or exceeded its configured end_time.
        """
        if self._end_time is None:
            return False
        evaluated_time = check_time if check_time is not None else self._current_time
        return evaluated_time > self._end_time

    def format_iso(self) -> str:
        return self._current_time.isoformat()

    def __repr__(self) -> str:
        return f"<SimulationClock current={self._current_time.isoformat()} end={self._end_time.isoformat() if self._end_time else 'None'}>"
