from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional
from pydantic import BaseModel, ConfigDict, Field


class EventType(str, Enum):
    CUSTOMER_ORDER_ARRIVED = "CustomerOrderArrived"
    ALLOCATION_REQUESTED = "AllocationRequested"
    STOCK_RESERVED = "StockReserved"
    PICKING_STARTED = "PickingStarted"
    ITEM_PICKED = "ItemPicked"
    ITEM_MISSING = "ItemMissing"
    PICKING_COMPLETED = "PickingCompleted"
    ORDER_CANCELLED = "OrderCancelled"
    SUPPLIER_DELIVERY_DUE = "SupplierDeliveryDue"
    STOCK_RECEIVED = "StockReceived"


class EventStatus(str, Enum):
    SCHEDULED = "SCHEDULED"
    PROCESSED = "PROCESSED"
    FAILED = "FAILED"


# Deterministic Event Priorities (Lower numbers execute first)
# Rule: At identical virtual timestamps, supplier stock receipts must execute
# before customer order allocations, ensuring newly delivered stock is available.
PRIORITY_SUPPLIER_DELIVERY: int = 1
PRIORITY_STOCK_RECEIVED: int = 1
PRIORITY_CUSTOMER_ORDER_ARRIVED: int = 2
PRIORITY_ALLOCATION_REQUESTED: int = 3
PRIORITY_STOCK_RESERVED: int = 4
PRIORITY_PICKING_STARTED: int = 5
PRIORITY_ITEM_PICK: int = 6
PRIORITY_PICKING_COMPLETED: int = 7
PRIORITY_ORDER_CANCELLED: int = 8

DEFAULT_PRIORITIES: Dict[EventType, int] = {
    EventType.SUPPLIER_DELIVERY_DUE: PRIORITY_SUPPLIER_DELIVERY,
    EventType.STOCK_RECEIVED: PRIORITY_STOCK_RECEIVED,
    EventType.CUSTOMER_ORDER_ARRIVED: PRIORITY_CUSTOMER_ORDER_ARRIVED,
    EventType.ALLOCATION_REQUESTED: PRIORITY_ALLOCATION_REQUESTED,
    EventType.STOCK_RESERVED: PRIORITY_STOCK_RESERVED,
    EventType.PICKING_STARTED: PRIORITY_PICKING_STARTED,
    EventType.ITEM_PICKED: PRIORITY_ITEM_PICK,
    EventType.ITEM_MISSING: PRIORITY_ITEM_PICK,
    EventType.PICKING_COMPLETED: PRIORITY_PICKING_COMPLETED,
    EventType.ORDER_CANCELLED: PRIORITY_ORDER_CANCELLED,
}


class SimulationEvent(BaseModel):
    """
    Immutable representation of a discrete simulation event.
    """
    model_config = ConfigDict(frozen=True)

    run_id: str
    event_id: str
    sequence_number: int
    event_type: EventType
    virtual_timestamp: datetime
    priority: int = 5
    schema_version: int = 1
    causation_id: Optional[str] = None
    correlation_id: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    status: EventStatus = EventStatus.SCHEDULED
    error_message: Optional[str] = None

    def canonical_dict(self) -> Dict[str, Any]:
        """
        Returns a canonical dictionary representation for hashing and audit persistence.
        Excludes volatile host wall-clock execution metrics.
        """
        ts = self.virtual_timestamp
        if ts.tzinfo is None:
            ts_str = ts.replace(tzinfo=timezone.utc).isoformat()
        else:
            ts_str = ts.astimezone(timezone.utc).isoformat()

        return {
            "run_id": self.run_id,
            "event_id": self.event_id,
            "sequence_number": self.sequence_number,
            "event_type": self.event_type.value,
            "virtual_timestamp": ts_str,
            "priority": self.priority,
            "schema_version": self.schema_version,
            "causation_id": self.causation_id,
            "correlation_id": self.correlation_id,
            "payload": self.payload,
            "status": self.status.value,
            "error_message": self.error_message,
        }
