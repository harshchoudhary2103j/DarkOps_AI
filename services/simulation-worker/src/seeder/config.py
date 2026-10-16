"""
Scenario configuration model and loader for DarkOps AI Synthetic World Seeder.
"""

from typing import List, Optional
from pydantic import BaseModel, Field, model_validator


class ScenarioConfig(BaseModel):
    scenario_id: str = Field(..., description="Unique scenario identifier")
    scenario_name: str = Field(..., description="Human readable scenario title")
    seed: int = Field(default=42, description="Integer random seed for deterministic generation")

    # Store generation
    num_stores: int = Field(default=2, ge=1, le=50, description="Number of virtual dark stores")
    geo_center_lat: float = Field(default=40.7580, ge=-90.0, le=90.0, description="Center latitude for store cluster")
    geo_center_lon: float = Field(default=-73.9855, ge=-180.0, le=180.0, description="Center longitude for store cluster")
    geo_radius_km: float = Field(default=5.0, gt=0.0, le=50.0, description="Cluster dispersion radius in km")

    # Catalog & SKU generation
    num_skus: int = Field(default=20, ge=1, le=1000, description="Total number of SKUs across categories")
    categories: List[str] = Field(
        default=["Produce", "Dairy", "Beverages", "Snacks"],
        min_length=1,
        description="Available product categories"
    )
    price_range_min: float = Field(default=1.49, ge=0.10)
    price_range_max: float = Field(default=19.99, ge=0.50)

    # Warehouse layout
    warehouse_aisles: int = Field(default=3, ge=1, le=20, description="Number of parallel aisles")
    warehouse_shelves_per_aisle: int = Field(default=4, ge=1, le=50, description="Shelves per aisle")

    # Inventory
    initial_stock_min: int = Field(default=20, ge=1)
    initial_stock_max: int = Field(default=100, ge=1)

    # Suppliers
    num_suppliers: int = Field(default=3, ge=1, le=50)
    supplier_lead_time_min_hours: int = Field(default=12, ge=1)
    supplier_lead_time_max_hours: int = Field(default=72, ge=1)

    # Demand / Sales History
    history_horizon_days: int = Field(default=14, ge=14, le=30, description="Historical demand observation horizon")
    daily_demand_lambda: float = Field(default=8.0, gt=0.0, description="Average daily demand intensity per SKU")

    @model_validator(mode="after")
    def validate_ranges(self) -> "ScenarioConfig":
        if self.price_range_min > self.price_range_max:
            raise ValueError(f"price_range_min ({self.price_range_min}) cannot exceed price_range_max ({self.price_range_max})")
        if self.initial_stock_min > self.initial_stock_max:
            raise ValueError(f"initial_stock_min ({self.initial_stock_min}) cannot exceed initial_stock_max ({self.initial_stock_max})")
        if self.supplier_lead_time_min_hours > self.supplier_lead_time_max_hours:
            raise ValueError(
                f"supplier_lead_time_min_hours ({self.supplier_lead_time_min_hours}) cannot exceed "
                f"supplier_lead_time_max_hours ({self.supplier_lead_time_max_hours})"
            )
        return self
