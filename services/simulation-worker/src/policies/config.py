from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class BaselinePolicyConfig(BaseModel):
    """
    Configuration parameters for baseline operational heuristics.
    """
    model_config = ConfigDict(frozen=True)

    # Replenishment Policy Parameters
    replenishment_enabled: bool = True
    moving_average_window_days: int = Field(default=14, ge=1, description="Days of history for demand rate estimation")
    safety_stock_factor: float = Field(default=1.5, ge=0.0, description="Multiplier Z for safety stock calculation")
    default_lead_time_days: float = Field(default=0.167, ge=0.0, description="Default lead time in days (~4 hours)")
    default_daily_demand_fallback: float = Field(default=5.0, gt=0.0, description="Fallback daily demand when history is absent")
    order_up_to_multiplier: float = Field(default=3.0, ge=1.0, description="Multiplier for order-up-to level: S = s + mult * d_bar * L")
    min_order_quantity_default: int = Field(default=10, ge=1)
    pack_size_default: int = Field(default=1, ge=1)

    # Allocation Policy Parameters
    max_service_distance_km: float = Field(default=15.0, gt=0.0, description="Maximum delivery radius from store")

    # Routing Policy Parameters
    walking_speed_mps: float = Field(default=1.2, gt=0.0, description="Picker walking speed in meters per second")
    item_pick_time_seconds: float = Field(default=10.0, ge=0.0, description="Handling time to pick one item at shelf")
    dispatch_delay_seconds: float = Field(default=60.0, ge=0.0, description="Delay between allocation and picking dispatch")
