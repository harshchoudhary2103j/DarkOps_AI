import json
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional
from pydantic import BaseModel, ConfigDict, Field


class JobStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


VALID_TRANSITIONS = {
    JobStatus.QUEUED: {JobStatus.RUNNING, JobStatus.CANCELLED},
    JobStatus.RUNNING: {JobStatus.PAUSED, JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.CANCELLED},
    JobStatus.PAUSED: {JobStatus.RUNNING, JobStatus.CANCELLED},
    JobStatus.SUCCEEDED: set(),
    JobStatus.FAILED: set(),
    JobStatus.CANCELLED: set(),
}


class InvalidJobStateTransitionError(Exception):
    pass


class SimulationJob(BaseModel):
    """
    State machine and persistence model for a discrete-event simulation run.
    """
    model_config = ConfigDict(arbitrary_types_allowed=True)

    run_id: str
    scenario_id: str
    seed: int
    status: JobStatus = JobStatus.QUEUED
    start_time: datetime
    end_time: datetime
    current_virtual_time: datetime
    event_count: int = 0
    config_snapshot: Dict[str, Any] = Field(default_factory=dict)
    failure_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def transition_to(self, new_status: JobStatus, reason: Optional[str] = None) -> None:
        """
        Validates and applies a state transition.
        """
        allowed = VALID_TRANSITIONS.get(self.status, set())
        if new_status not in allowed:
            raise InvalidJobStateTransitionError(
                f"Cannot transition simulation job '{self.run_id}' from '{self.status.value}' to '{new_status.value}'"
            )

        self.status = new_status
        if reason:
            self.failure_reason = reason
        self.updated_at = datetime.now(timezone.utc)

    def start(self) -> None:
        self.transition_to(JobStatus.RUNNING)

    def pause(self) -> None:
        self.transition_to(JobStatus.PAUSED)

    def resume(self) -> None:
        self.transition_to(JobStatus.RUNNING)

    def complete(self) -> None:
        self.transition_to(JobStatus.SUCCEEDED)

    def fail(self, reason: str) -> None:
        self.transition_to(JobStatus.FAILED, reason=reason)

    def cancel(self, reason: Optional[str] = "Cancelled by operator") -> None:
        self.transition_to(JobStatus.CANCELLED, reason=reason)

    def persist_to_postgres(self, db_connection_url: str) -> None:
        """
        Upserts job record into PostgreSQL simulation_runs table.
        """
        try:
            import psycopg2
        except ImportError as e:
            raise RuntimeError("psycopg2 is required for PostgreSQL persistence. Install psycopg2-binary.") from e

        conn = psycopg2.connect(db_connection_url)
        try:
            with conn.cursor() as cur:
                upsert_query = """
                    INSERT INTO simulation_runs (
                        id, scenario_id, seed, status,
                        start_time, end_time, current_virtual_time,
                        event_count, config_snapshot, failure_reason,
                        created_at, updated_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                    ) ON CONFLICT (id) DO UPDATE SET
                        status = EXCLUDED.status,
                        current_virtual_time = EXCLUDED.current_virtual_time,
                        event_count = EXCLUDED.event_count,
                        failure_reason = EXCLUDED.failure_reason,
                        updated_at = EXCLUDED.updated_at
                """
                cur.execute(
                    upsert_query,
                    (
                        self.run_id,
                        self.scenario_id,
                        self.seed,
                        self.status.value,
                        self.start_time,
                        self.end_time,
                        self.current_virtual_time,
                        self.event_count,
                        json.dumps(self.config_snapshot),
                        self.failure_reason,
                        self.created_at,
                        self.updated_at,
                    ),
                )
                conn.commit()
        finally:
            conn.close()
