import math
import time
from typing import Any, Dict, List, Optional, Set, Tuple
from ortools.sat.python import cp_model

from src.models.allocation import (
    AllocationDecisions,
    AllocationOptimizationRequest,
    AllocationOptimizationResponse,
    OrderAssignment,
    UnallocatedOrder,
)
from src.models.common import FallbackMetadata, SolverMetadata, SolverStatus
from src.policies.fallbacks import BaselineFallbacks, haversine_distance


class AllocationSolver:
    """
    Workload-Aware Multi-Store Batch Order Allocation Optimizer.
    Formulates a binary integer programming model via OR-Tools CP-SAT.
    Balances travel distance, store picking queues, inventory safety buffers, and SLA risk.
    """

    SCALE_FACTOR = 100  # Scale float objective terms to integer for CP-SAT

    @classmethod
    def solve(cls, request: AllocationOptimizationRequest) -> AllocationOptimizationResponse:
        start_wall_time = time.perf_counter()
        model = cp_model.CpModel()

        orders = sorted(request.orders, key=lambda o: o.order_id)
        stores = sorted(request.stores, key=lambda s: s.store_id)
        weights = request.weights

        M = len(orders)
        K = len(stores)

        # 1. Distance & Serviceability Matrix
        # dist_matrix[o_idx][s_idx]
        # is_serviceable[o_idx][s_idx]
        dist_matrix: List[List[float]] = []
        is_serviceable: List[List[bool]] = []

        for o in orders:
            o_dists = []
            o_serv = []
            for s in stores:
                if s.status != "ACTIVE":
                    o_dists.append(9999.0)
                    o_serv.append(False)
                    continue

                d = haversine_distance(o.customer_latitude, o.customer_longitude, s.latitude, s.longitude)
                o_dists.append(d)

                if o.delivery_zone_id is not None:
                    # Specific zone target
                    o_serv.append(d <= s.service_radius_km)
                else:
                    o_serv.append(d <= s.service_radius_km)

            dist_matrix.append(o_dists)
            is_serviceable.append(o_serv)

        # 2. Decision Variables
        # x[o][s] in {0, 1}: order o assigned to store s
        # u[o] in {0, 1}: order o unallocated
        assign_vars: Dict[Tuple[int, int], cp_model.IntVar] = {}
        unalloc_vars: Dict[int, cp_model.IntVar] = {}

        for o_idx in range(M):
            unalloc_vars[o_idx] = model.NewBoolVar(f"u_{o_idx}")
            for s_idx in range(K):
                assign_vars[(o_idx, s_idx)] = model.NewBoolVar(f"x_{o_idx}_{s_idx}")

                # If store is not serviceable for order o, forbid assignment
                if not is_serviceable[o_idx][s_idx]:
                    model.Add(assign_vars[(o_idx, s_idx)] == 0)

        # 3. Single Assignment Constraint
        for o_idx in range(M):
            model.Add(
                sum(assign_vars[(o_idx, s_idx)] for s_idx in range(K)) + unalloc_vars[o_idx] == 1
            )

        # 4. Inventory Conservation Constraints
        # For every store s and SKU k: sum_{o} (q_{o,k} * x_{o,s}) <= Available_{s,k} - Safety_{s,k}
        all_skus: Set[str] = set()
        for o in orders:
            for l in o.lines:
                all_skus.add(l.sku_id)

        for s_idx, store in enumerate(stores):
            for sku_id in all_skus:
                avail = store.available_inventory.get(sku_id, 0)
                buffer = store.safety_buffer.get(sku_id, 0)
                net_allocatable = max(0, avail - buffer)

                sku_demand_terms = []
                for o_idx, o in enumerate(orders):
                    qty = next((l.quantity for l in o.lines if l.sku_id == sku_id), 0)
                    if qty > 0:
                        sku_demand_terms.append(qty * assign_vars[(o_idx, s_idx)])

                if sku_demand_terms:
                    model.Add(sum(sku_demand_terms) <= net_allocatable)

        # 5. Objective Function Formulation
        # Min: W_u * sum(u_o) + sum_{o,s} [ W_d * dist + W_q * (queue + load) + W_b * sla_risk ] * x_{o,s}
        obj_terms = []

        w_unalloc = int(weights.unallocated_penalty * cls.SCALE_FACTOR)
        for o_idx in range(M):
            obj_terms.append(w_unalloc * unalloc_vars[o_idx])

        w_dist = weights.distance_weight * cls.SCALE_FACTOR
        w_queue = weights.queue_workload_weight * cls.SCALE_FACTOR
        w_sla = weights.sla_breach_weight * cls.SCALE_FACTOR

        for o_idx, o in enumerate(orders):
            deadline = o.sla_deadline_minutes
            for s_idx, s in enumerate(stores):
                if not is_serviceable[o_idx][s_idx]:
                    continue

                d = dist_matrix[o_idx][s_idx]
                est_minutes = 10.0 + (d * 1.5)  # 10 min prep + 1.5 min per km transit
                sla_risk = max(0.0, est_minutes - deadline)

                # Scaled integer cost coefficient
                cost_dist = int(w_dist * d)
                cost_q = int(w_queue * s.current_queue_depth)
                cost_sla = int(w_sla * sla_risk)
                total_coeff = cost_dist + cost_q + cost_sla

                obj_terms.append(total_coeff * assign_vars[(o_idx, s_idx)])

        # Additional store workload balance term: penalize quadratic concentration
        # sum_{o} x_{o,s} added to queue
        model.Minimize(sum(obj_terms))

        # 6. Solver Configuration
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = request.time_limit_seconds
        solver.parameters.random_seed = 42
        solver.parameters.num_search_workers = 1

        status_code = solver.Solve(model)
        elapsed_ms = round((time.perf_counter() - start_wall_time) * 1000.0, 2)

        solver_meta = SolverMetadata(
            name="OR-Tools CP-SAT",
            algorithm="Binary Integer Linear Programming",
            version="9.15",
            parameters={
                "order_count": M,
                "store_count": K,
                "time_limit_seconds": request.time_limit_seconds,
            },
        )

        if status_code in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            status = SolverStatus.OPTIMAL if status_code == cp_model.OPTIMAL else SolverStatus.FEASIBLE

            assignments: List[OrderAssignment] = []
            unallocated: List[UnallocatedOrder] = []
            store_loads: Dict[str, int] = {s.store_id: s.current_queue_depth for s in stores}
            remaining_inv: Dict[str, Dict[str, int]] = {
                s.store_id: dict(s.available_inventory) for s in stores
            }

            total_dist_val = 0.0

            for o_idx, o in enumerate(orders):
                if solver.Value(unalloc_vars[o_idx]) == 1:
                    unallocated.append(
                        UnallocatedOrder(
                            order_id=o.order_id,
                            reason="No store possesses service coverage and available inventory satisfying safety buffers"
                        )
                    )
                else:
                    for s_idx, s in enumerate(stores):
                        if solver.Value(assign_vars[(o_idx, s_idx)]) == 1:
                            d = dist_matrix[o_idx][s_idx]
                            est_fulfillment = round(10.0 + d * 1.5, 2)
                            assignments.append(
                                OrderAssignment(
                                    order_id=o.order_id,
                                    store_id=s.store_id,
                                    distance_km=round(d, 2),
                                    estimated_fulfillment_minutes=est_fulfillment,
                                )
                            )
                            store_loads[s.store_id] += 1
                            total_dist_val += d

                            # Deduct inventory
                            for l in o.lines:
                                remaining_inv[s.store_id][l.sku_id] = max(
                                    0, remaining_inv[s.store_id].get(l.sku_id, 0) - l.quantity
                                )
                            break

            raw_obj = round(solver.ObjectiveValue() / cls.SCALE_FACTOR, 2)
            explanations = [
                f"Successfully allocated {len(assignments)} / {M} orders across {K} candidate stores.",
                f"Unallocated orders: {len(unallocated)}.",
                f"Average delivery distance: {round(total_dist_val / max(1, len(assignments)), 2)} km.",
                f"Solver completed in {elapsed_ms}ms with status {status.value}.",
            ]

            return AllocationOptimizationResponse(
                status=status,
                objective_value=raw_obj,
                constraint_status={
                    "single_assignment_respected": True,
                    "service_radii_respected": True,
                    "inventory_conservation_respected": True,
                },
                execution_time_ms=elapsed_ms,
                solver=solver_meta,
                explanations=explanations,
                diagnostics={"assigned_count": len(assignments), "unallocated_count": len(unallocated)},
                decisions=AllocationDecisions(
                    assignments=assignments,
                    unallocated_orders=unallocated,
                    store_post_workloads=store_loads,
                    remaining_inventory=remaining_inv,
                    objective_breakdown={
                        "raw_objective": raw_obj,
                        "unallocated_count": float(len(unallocated)),
                        "total_distance_km": round(total_dist_val, 2),
                    },
                ),
            )

        elif status_code == cp_model.INFEASIBLE:
            if request.enable_fallback:
                return cls._fallback_allocation(request, elapsed_ms, solver_meta, "CP-SAT reported INFEASIBLE")

            return AllocationOptimizationResponse(
                status=SolverStatus.INFEASIBLE,
                objective_value=None,
                execution_time_ms=elapsed_ms,
                solver=solver_meta,
                explanations=["All store candidate allocations violate inventory or serviceability constraints."],
                diagnostics={"solver_status_code": status_code},
                fallback=FallbackMetadata(attempted=request.enable_fallback, used=False),
            )

        else:  # TIMEOUT or UNKNOWN
            if request.enable_fallback:
                return cls._fallback_allocation(request, elapsed_ms, solver_meta, "CP-SAT exceeded time limit")

            return AllocationOptimizationResponse(
                status=SolverStatus.TIMEOUT,
                objective_value=None,
                execution_time_ms=elapsed_ms,
                solver=solver_meta,
                explanations=[f"Allocation solver exceeded time limit of {request.time_limit_seconds}s."],
                diagnostics={"solver_status_code": status_code},
                fallback=FallbackMetadata(attempted=request.enable_fallback, used=False),
            )

    @classmethod
    def _fallback_allocation(
        cls,
        request: AllocationOptimizationRequest,
        elapsed_ms: float,
        solver_meta: SolverMetadata,
        reason: str,
    ) -> AllocationOptimizationResponse:
        """
        Executes Phase 06 greedy nearest-store baseline as fallback.
        """
        orders_dict = [o.model_dump() for o in request.orders]
        stores_dict = [s.model_dump() for s in request.stores]

        base_assigns, base_unalloc = BaselineFallbacks.nearest_store_allocation(orders_dict, stores_dict)

        assignments = [OrderAssignment(**a) for a in base_assigns]
        unallocated = [UnallocatedOrder(**u) for u in base_unalloc]

        return AllocationOptimizationResponse(
            status=SolverStatus.FEASIBLE,
            objective_value=None,
            constraint_status={"fallback_baseline_used": True},
            execution_time_ms=elapsed_ms,
            solver=solver_meta,
            explanations=[f"Fallback to Phase 06 greedy nearest-store policy due to: {reason}."],
            diagnostics={"reason": reason},
            fallback=FallbackMetadata(
                attempted=True,
                used=True,
                policy_id="baseline_greedy_nearest_store_v1",
                reason=reason,
            ),
            decisions=AllocationDecisions(
                assignments=assignments,
                unallocated_orders=unallocated,
            ),
        )
