from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class SolverStatus(str, Enum):
    OPTIMAL = "OPTIMAL"
    FEASIBLE = "FEASIBLE"
    INFEASIBLE = "INFEASIBLE"
    TIMEOUT = "TIMEOUT"
    INVALID_INPUT = "INVALID_INPUT"
    ERROR = "ERROR"


class SolverMetadata(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str = "OR-Tools"
    algorithm: str
    version: str = "9.15"
    parameters: Dict[str, Any] = Field(default_factory=dict)


class FallbackMetadata(BaseModel):
    model_config = ConfigDict(frozen=True)

    attempted: bool = False
    used: bool = False
    policy_id: Optional[str] = None
    reason: Optional[str] = None


class BaseOptimizationResponse(BaseModel):
    """
    Standardized solver response envelope for DarkOps AI optimization services.
    """
    status: SolverStatus
    objective_value: Optional[float] = None
    constraint_status: Dict[str, bool] = Field(default_factory=dict)
    execution_time_ms: float
    solver: SolverMetadata
    explanations: List[str] = Field(default_factory=list)
    diagnostics: Dict[str, Any] = Field(default_factory=dict)
    fallback: FallbackMetadata = Field(default_factory=FallbackMetadata)
