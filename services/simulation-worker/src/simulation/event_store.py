import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from src.simulation.events import EventStatus, SimulationEvent


class EventStore:
    """
    In-memory and persistent event store for DarkOps AI simulation runs.
    Maintains deterministic execution logs and produces canonical SHA-256 fingerprints.
    """

    def __init__(self, run_id: str):
        self.run_id = run_id
        self._events: List[SimulationEvent] = []
        self._results: List[Dict[str, Any]] = []

    def record(
        self,
        event: SimulationEvent,
        result: Dict[str, Any],
        status: EventStatus = EventStatus.PROCESSED,
        error_message: Optional[str] = None,
    ) -> None:
        processed_event = event.model_copy(
            update={
                "status": status,
                "error_message": error_message,
            }
        )
        self._events.append(processed_event)
        self._results.append(result)

    def get_events(self) -> List[SimulationEvent]:
        return list(self._events)

    def get_results(self) -> List[Dict[str, Any]]:
        return list(self._results)

    def count(self) -> int:
        return len(self._events)

    def canonical_event_stream(self) -> str:
        """
        Serializes the event stream to canonical JSON.
        Deterministic guarantees:
        - Sorted keys
        - UTC normalized timestamps
        - No wall-clock host execution metadata
        """
        records = [e.canonical_dict() for e in self._events]
        return json.dumps(records, sort_keys=True, indent=2, ensure_ascii=False)

    def sha256_fingerprint(self) -> str:
        """
        Calculates SHA-256 hex digest of the canonical event stream.
        """
        canonical_bytes = self.canonical_event_stream().encode("utf-8")
        return hashlib.sha256(canonical_bytes).hexdigest()

    def persist_to_postgres(self, db_connection_url: str) -> int:
        """
        Persists recorded events to PostgreSQL simulation_events table.
        """
        try:
            import psycopg2
            from psycopg2.extras import execute_batch
        except ImportError as e:
            raise RuntimeError("psycopg2 is required for PostgreSQL persistence. Install psycopg2-binary.") from e

        conn = psycopg2.connect(db_connection_url)
        try:
            with conn.cursor() as cur:
                insert_query = """
                    INSERT INTO simulation_events (
                        id, run_id, sequence_number, event_type,
                        virtual_timestamp, priority, payload,
                        status, error_message, causation_id, created_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW()
                    ) ON CONFLICT (run_id, sequence_number) DO UPDATE SET
                        status = EXCLUDED.status,
                        error_message = EXCLUDED.error_message
                """
                tuples = []
                for e in self._events:
                    payload_json = json.dumps(e.payload)
                    tuples.append((
                        e.event_id,
                        e.run_id,
                        e.sequence_number,
                        e.event_type.value,
                        e.virtual_timestamp,
                        e.priority,
                        payload_json,
                        e.status.value,
                        e.error_message,
                        e.causation_id,
                    ))

                execute_batch(cur, insert_query, tuples, page_size=200)
                conn.commit()
                return len(tuples)
        finally:
            conn.close()
