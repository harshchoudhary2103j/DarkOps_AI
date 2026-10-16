from fastapi import APIRouter, HTTPException, status
from src.models.routing import (
    PickerRouteOptimizationRequest,
    PickerRouteOptimizationResponse,
)
from src.solvers.routing import PickerRouteSolver

router = APIRouter(prefix="/api/v1/optimize", tags=["Picker Routing Optimization"])


@router.post(
    "/picker-route",
    response_model=PickerRouteOptimizationResponse,
    summary="Optimize warehouse picker path traversal",
    description="Finds minimum-distance collision-free graph paths starting and ending at dispatch station using Dijkstra and TSP.",
)
def optimize_picker_route(request: PickerRouteOptimizationRequest) -> PickerRouteOptimizationResponse:
    try:
        return PickerRouteSolver.solve(request)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Picker route solver internal error: {str(e)}"
        )
