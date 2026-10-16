from fastapi import APIRouter, HTTPException, status
from src.models.allocation import (
    AllocationOptimizationRequest,
    AllocationOptimizationResponse,
)
from src.solvers.allocation import AllocationSolver

router = APIRouter(prefix="/api/v1/optimize", tags=["Allocation Optimization"])


@router.post(
    "/allocation",
    response_model=AllocationOptimizationResponse,
    summary="Optimize multi-store batch order allocation",
    description="Balances customer travel distance, dark store picking queue workloads, remaining stock safety buffers, and SLA breach risks.",
)
def optimize_allocation(request: AllocationOptimizationRequest) -> AllocationOptimizationResponse:
    try:
        return AllocationSolver.solve(request)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Allocation solver internal error: {str(e)}"
        )
