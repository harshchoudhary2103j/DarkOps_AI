from pydantic import BaseModel, ConfigDict, Field


class CostConfig(BaseModel):
    """
    Explicit economic cost coefficients and currency parameters for KPI evaluation.
    """
    model_config = ConfigDict(frozen=True)

    carrying_cost_per_unit_hour: float = Field(
        default=0.002,
        ge=0.0,
        description="Inventory carrying cost per SKU unit per hour (USD)"
    )
    stockout_penalty_per_unit: float = Field(
        default=5.0,
        ge=0.0,
        description="Economic penalty per unfulfilled unit due to stockout (USD)"
    )
    cost_per_purchase_order: float = Field(
        default=25.0,
        ge=0.0,
        description="Administrative and logistics transaction cost per purchase order (USD)"
    )
    unit_waste_cost: float = Field(
        default=2.0,
        ge=0.0,
        description="Valuation cost per expired / wasted unit (USD)"
    )
    currency: str = Field(
        default="USD",
        description="ISO currency code for economic metrics"
    )


class EvaluatorConfig(BaseModel):
    """
    Configuration and schema versioning for event-derived KPI evaluation.
    """
    model_config = ConfigDict(frozen=True)

    evaluator_version: str = Field(default="1.0.0")
    formula_version: str = Field(default="1.0.0")
    cost_config: CostConfig = Field(default_factory=CostConfig)
