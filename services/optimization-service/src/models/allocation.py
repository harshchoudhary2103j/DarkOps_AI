from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field

from src.models.common import BaseOptimizationResponse


class OrderLineInput(BaseModel):
    sku_id: str
    quantity: int = Field(ge=1)


class OrderAllocationInput(BaseModel):
    order_id: str
    customer_latitude: float = Field(ge=-90.0, le=90.0)
    customer_longitude: float = Field(ge=-180.0, le=180.0)
    lines: List[OrderLineInput] = Field(min_length=1)
    delivery_zone_id: Optional[str] = None
    sla_deadline_minutes: float = Field(default=15.0, gt=0.0)


class StoreAllocationInput(BaseModel):
    store_id: str
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    status: str = Field(default="ACTIVE")
    service_radius_km: float = Field(default=15.0, gt=0.0)
    current_queue_depth: int = Field(default=0, ge=0)
    available_inventory: Dict[str, int] = Field(description="SKU ID to unreserved physical stock")
    safety_buffer: Dict[str, int] = Field(default_factory=dict, description="SKU ID to minimum safety reserve")


class AllocationObjectiveWeights(BaseModel):
    model_config = ConfigDict(frozen=True)

    unallocated_penalty: float = Field(default=1000.0, ge=0.0)
    distance_weight: float = Field(default=1.0, ge=0.0)
    queue_workload_weight: float = Field(default=2.0, ge=0.0)
    sla_breach_weight: float = Field(default=50.0, ge=0.0)


class AllocationOptimizationRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    orders: List[OrderAllocationInput] = Field(min_length=1)
    stores: List[StoreAllocationInput] = Field(min_length=1)
    weights: AllocationObjectiveWeights = Field(default_factory=AllocationObjectiveWeights)
    time_limit_seconds: float = Field(default=0.5, gt=0.0, le=5.0)
    enable_fallback: bool = Field(default=True)


class OrderAssignment(BaseModel):
    order_id: str
    store_id: str
    distance_km: float
    estimated_fulfillment_minutes: float


class UnallocatedOrder(BaseModel):
    order_id: str
    reason: str


class AllocationDecisions(BaseModel):
    assignments: List[OrderAssignment] = Field(default_factory=list)
    unallocated_orders: List[UnallocatedOrder] = Field(default_factory=list)
    store_post_workloads: Dict[str, int] = Field(default_factory=dict)
    remaining_inventory: Dict[str, Dict[str, int]] = Field(default_factory=dict)
    objective_breakdown: Dict[str, float] = Field(default_factory=dict)
    baseline_comparison: Optional[Dict[str, Any]] = None


class AllocationOptimizationResponse(BaseOptimizationResponse):
    decisions: AllocationDecisions = Field(default_factory=AllocationDecisions)
