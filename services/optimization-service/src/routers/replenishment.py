from fastapi import APIRouter, HTTPException, status
from src.models.replenishment import (
    ReplenishmentOptimizationRequest,
    ReplenishmentOptimizationResponse,
)
from src.solvers.replenishment import ReplenishmentSolver

router = APIRouter(prefix="/api/v1/optimize", tags=["Replenishment Optimization"])


@router.post(
    "/replenishment",
    response_model=ReplenishmentOptimizationResponse,
    summary="Optimize multi-period dark store replenishment",
    description="Computes cost-optimal inventory purchase orders incorporating lead times, MOQs, pack sizes, storage limits, and holding vs shortage trade-offs.",
)
def optimize_replenishment(request: ReplenishmentOptimizationRequest) -> ReplenishmentOptimizationResponse:
    try:
        return ReplenishmentSolver.solve(request)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Replenishment solver internal error: {str(e)}"
        )
