from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field

from src.models.common import BaseOptimizationResponse


class ReplenishmentSkuInput(BaseModel):
    model_config = ConfigDict(frozen=True)

    sku_id: str
    current_inventory: int = Field(ge=0, description="Current physical on-hand minus reservations")
    demand_forecast: List[int] = Field(description="Forecasted customer demand per period")
    safety_stock_target: int = Field(default=0, ge=0)
    lead_time_periods: int = Field(default=1, ge=0)
    min_order_quantity: int = Field(default=1, ge=1)
    pack_size: int = Field(default=1, ge=1)
    supplier_id: str = Field(default="supplier_default")
    unit_volume: float = Field(default=1.0, gt=0.0)
    carrying_cost_per_period: float = Field(default=0.05, ge=0.0)
    stockout_penalty_per_unit: float = Field(default=5.0, ge=0.0)
    order_transaction_cost: float = Field(default=25.0, ge=0.0)
    scheduled_receipts: Dict[int, int] = Field(
        default_factory=dict,
        description="Pre-existing pipeline orders arriving at specified periods (0-indexed)"
    )


class ReplenishmentOptimizationRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    store_id: str
    horizon_periods: int = Field(default=7, ge=1, le=30)
    period_duration_hours: float = Field(default=24.0, gt=0.0)
    skus: List[ReplenishmentSkuInput] = Field(min_length=1)
    storage_capacity_limit: Optional[float] = Field(default=None, gt=0.0)
    time_limit_seconds: float = Field(default=2.0, gt=0.0, le=10.0)
    enable_fallback: bool = Field(default=True)


class PurchaseOrderRecommendation(BaseModel):
    sku_id: str
    supplier_id: str
    order_period: int
    order_quantity: int
    expected_delivery_period: int


class ReplenishmentCostBreakdown(BaseModel):
    holding_cost: float
    stockout_penalty: float
    order_transaction_cost: float
    total_cost: float


class ReplenishmentDecisions(BaseModel):
    recommended_orders: List[PurchaseOrderRecommendation] = Field(default_factory=list)
    projected_inventory: Dict[str, List[int]] = Field(default_factory=dict)
    projected_shortages: Dict[str, List[int]] = Field(default_factory=dict)
    cost_breakdown: Optional[ReplenishmentCostBreakdown] = None
    baseline_comparison: Optional[Dict[str, Any]] = None


class ReplenishmentOptimizationResponse(BaseOptimizationResponse):
    decisions: ReplenishmentDecisions = Field(default_factory=ReplenishmentDecisions)
