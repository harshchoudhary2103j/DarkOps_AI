from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field

from src.models.common import BaseOptimizationResponse


class PickItemInput(BaseModel):
    item_id: str
    sku_id: str
    shelf_node_id: Optional[str] = None
    quantity: int = Field(default=1, ge=1)


class PickerRouteOptimizationRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    task_id: str
    store_id: str
    layout: Dict[str, Any] = Field(description="Warehouse layout with nodes and edges")
    pick_items: List[PickItemInput] = Field(min_length=1)
    walking_speed_mps: float = Field(default=1.2, gt=0.0)
    item_pick_time_seconds: float = Field(default=10.0, ge=0.0)
    time_limit_seconds: float = Field(default=0.5, gt=0.0, le=5.0)
    enable_fallback: bool = Field(default=True)


class RouteBaselineComparison(BaseModel):
    baseline_distance_meters: float
    baseline_route_nodes: List[str]
    distance_reduction_meters: float
    distance_reduction_percent: Optional[float] = None
    baseline_policy: str = "s_shape_serpentine_v1"


class PickerRouteDecisions(BaseModel):
    task_id: str = ""
    store_id: str = ""
    route_nodes: List[str] = Field(default_factory=list)
    ordered_stops: List[str] = Field(default_factory=list)
    total_distance_meters: float = 0.0
    travel_duration_seconds: float = 0.0
    pick_duration_seconds: float = 0.0
    total_duration_seconds: float = 0.0
    baseline_comparison: Optional[RouteBaselineComparison] = None


class PickerRouteOptimizationResponse(BaseOptimizationResponse):
    decisions: PickerRouteDecisions = Field(default_factory=PickerRouteDecisions)
