import time
from typing import Any, Dict, List, Optional, Tuple
from ortools.sat.python import cp_model

from src.models.common import FallbackMetadata, SolverMetadata, SolverStatus
from src.models.replenishment import (
    PurchaseOrderRecommendation,
    ReplenishmentCostBreakdown,
    ReplenishmentDecisions,
    ReplenishmentOptimizationRequest,
    ReplenishmentOptimizationResponse,
    ReplenishmentSkuInput,
)


class ReplenishmentSolver:
    """
    Multi-Period, Multi-SKU Inventory Replenishment Optimizer.
    Formulates a mixed-integer constraint optimization model via OR-Tools CP-SAT.
    Enforces supplier MOQs, case pack multiples, storage capacity, and lead-time pipelines.
    """

    SCALE_FACTOR = 100  # Scale monetary costs to integer cents for CP-SAT

    @classmethod
    def solve(cls, request: ReplenishmentOptimizationRequest) -> ReplenishmentOptimizationResponse:
        start_wall_time = time.perf_counter()
        model = cp_model.CpModel()

        T = request.horizon_periods
        skus = request.skus
        N = len(skus)

        # Pre-validation
        for sku in skus:
            if len(sku.demand_forecast) < T:
                # Pad forecast if shorter than horizon
                sku.demand_forecast.extend([sku.demand_forecast[-1] if sku.demand_forecast else 5] * (T - len(sku.demand_forecast)))

        # 1. Decision Variables
        # O[i][t]: Order quantity placed for sku i at period t
        # Y[i][t]: Order placement indicator in {0, 1}
        # K[i][t]: Number of packs ordered
        # I[i][t]: End of period physical inventory
        # U[i][t]: Shortage / unfulfilled demand in period t
        # Slack[i][t]: Safety stock shortfall
        order_vars: Dict[Tuple[int, int], cp_model.IntVar] = {}
        place_vars: Dict[Tuple[int, int], cp_model.IntVar] = {}
        pack_vars: Dict[Tuple[int, int], cp_model.IntVar] = {}
        inv_vars: Dict[Tuple[int, int], cp_model.IntVar] = {}
        shortage_vars: Dict[Tuple[int, int], cp_model.IntVar] = {}
        safety_slack_vars: Dict[Tuple[int, int], cp_model.IntVar] = {}

        max_demand_total = sum(sum(sku.demand_forecast[:T]) for sku in skus)
        big_m = max(1000, max_demand_total * 3)

        for i, sku in enumerate(skus):
            p_size = max(1, sku.pack_size)
            max_packs = big_m // p_size

            for t in range(T):
                order_vars[(i, t)] = model.NewIntVar(0, big_m, f"O_{i}_{t}")
                place_vars[(i, t)] = model.NewBoolVar(f"Y_{i}_{t}")
                pack_vars[(i, t)] = model.NewIntVar(0, max_packs, f"K_{i}_{t}")
                inv_vars[(i, t)] = model.NewIntVar(0, big_m, f"I_{i}_{t}")
                shortage_vars[(i, t)] = model.NewIntVar(0, big_m, f"U_{i}_{t}")
                safety_slack_vars[(i, t)] = model.NewIntVar(0, big_m, f"Slack_{i}_{t}")

                # Pack size constraint: O[i][t] = K[i][t] * pack_size
                model.Add(order_vars[(i, t)] == pack_vars[(i, t)] * p_size)

                # MOQ constraints:
                # O[i][t] >= MOQ * Y[i][t]
                # O[i][t] <= big_m * Y[i][t]
                moq = sku.min_order_quantity
                model.Add(order_vars[(i, t)] >= moq * place_vars[(i, t)])
                model.Add(order_vars[(i, t)] <= big_m * place_vars[(i, t)])

        # 2. Inventory Balance Constraints across Horizon
        for i, sku in enumerate(skus):
            l_lead = sku.lead_time_periods
            sched_map = sku.scheduled_receipts

            for t in range(T):
                # Receipt at period t
                # A[i][t] = scheduled_receipts[t] + (O[i][t - L] if t >= L else 0)
                sched_qty = sched_map.get(t, 0)
                incoming_terms = [sched_qty]

                if t >= l_lead:
                    incoming_terms.append(order_vars[(i, t - l_lead)])

                demand_t = sku.demand_forecast[t]

                if t == 0:
                    prev_inv = sku.current_inventory
                    model.Add(
                        inv_vars[(i, 0)] == prev_inv + sum(incoming_terms) - demand_t + shortage_vars[(i, 0)]
                    )
                else:
                    model.Add(
                        inv_vars[(i, t)] == inv_vars[(i, t - 1)] + sum(incoming_terms) - demand_t + shortage_vars[(i, t)]
                    )

                # Safety stock soft constraint
                ss_target = sku.safety_stock_target
                if ss_target > 0:
                    model.Add(inv_vars[(i, t)] + safety_slack_vars[(i, t)] >= ss_target)
                else:
                    model.Add(safety_slack_vars[(i, t)] == 0)

        # 3. Storage Capacity Constraints (Optional)
        if request.storage_capacity_limit is not None and request.storage_capacity_limit > 0:
            cap_limit = int(request.storage_capacity_limit * 100)
            for t in range(T):
                vol_terms = []
                for i, sku in enumerate(skus):
                    v_scaled = int(sku.unit_volume * 100)
                    vol_terms.append(inv_vars[(i, t)] * v_scaled)
                model.Add(sum(vol_terms) <= cap_limit)

        # 4. Objective Function (Minimize Scaled Costs)
        cost_terms = []
        for i, sku in enumerate(skus):
            c_hold = int(sku.carrying_cost_per_period * cls.SCALE_FACTOR)
            c_short = int(sku.stockout_penalty_per_unit * cls.SCALE_FACTOR)
            c_order = int(sku.order_transaction_cost * cls.SCALE_FACTOR)
            c_safety_penalty = int(c_short * 0.5)  # Penalize safety stock deficit

            for t in range(T):
                cost_terms.append(inv_vars[(i, t)] * c_hold)
                cost_terms.append(shortage_vars[(i, t)] * c_short)
                cost_terms.append(place_vars[(i, t)] * c_order)
                cost_terms.append(safety_slack_vars[(i, t)] * c_safety_penalty)

        model.Minimize(sum(cost_terms))

        # 5. Solver Execution
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = request.time_limit_seconds
        solver.parameters.random_seed = 42
        solver.parameters.num_search_workers = 1  # Determinism guarantee

        status_code = solver.Solve(model)
        elapsed_ms = round((time.perf_counter() - start_wall_time) * 1000.0, 2)

        solver_meta = SolverMetadata(
            name="OR-Tools CP-SAT",
            algorithm="Mixed-Integer Constraint Programming",
            version="9.15",
            parameters={
                "time_limit_seconds": request.time_limit_seconds,
                "horizon_periods": T,
                "sku_count": N,
                "storage_capacity_limit": request.storage_capacity_limit,
            },
        )

        # 6. Process Solver Outcomes
        if status_code in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            status = SolverStatus.OPTIMAL if status_code == cp_model.OPTIMAL else SolverStatus.FEASIBLE

            recommended_orders: List[PurchaseOrderRecommendation] = []
            projected_inv: Dict[str, List[int]] = {sku.sku_id: [] for sku in skus}
            projected_short: Dict[str, List[int]] = {sku.sku_id: [] for sku in skus}

            total_h_cost = 0.0
            total_s_cost = 0.0
            total_po_cost = 0.0

            for i, sku in enumerate(skus):
                for t in range(T):
                    o_val = int(solver.Value(order_vars[(i, t)]))
                    i_val = int(solver.Value(inv_vars[(i, t)]))
                    u_val = int(solver.Value(shortage_vars[(i, t)]))
                    y_val = int(solver.Value(place_vars[(i, t)]))

                    projected_inv[sku.sku_id].append(i_val)
                    projected_short[sku.sku_id].append(u_val)

                    if o_val > 0:
                        recommended_orders.append(
                            PurchaseOrderRecommendation(
                                sku_id=sku.sku_id,
                                supplier_id=sku.supplier_id,
                                order_period=t,
                                order_quantity=o_val,
                                expected_delivery_period=t + sku.lead_time_periods,
                            )
                        )

                    total_h_cost += i_val * sku.carrying_cost_per_period
                    total_s_cost += u_val * sku.stockout_penalty_per_unit
                    total_po_cost += y_val * sku.order_transaction_cost

            total_obj = round(total_h_cost + total_s_cost + total_po_cost, 2)
            cost_breakdown = ReplenishmentCostBreakdown(
                holding_cost=round(total_h_cost, 2),
                stockout_penalty=round(total_s_cost, 2),
                order_transaction_cost=round(total_po_cost, 2),
                total_cost=total_obj,
            )

            explanations = [
                f"Generated {len(recommended_orders)} purchase order recommendations across {T} periods.",
                f"Total projected cost: ${total_obj:.2f} (Holding: ${total_h_cost:.2f}, Shortage: ${total_s_cost:.2f}, Transaction: ${total_po_cost:.2f}).",
                f"Solver status: {status.value} in {elapsed_ms}ms.",
            ]

            return ReplenishmentOptimizationResponse(
                status=status,
                objective_value=total_obj,
                constraint_status={
                    "inventory_balance_satisfied": True,
                    "pack_size_multiples_respected": True,
                    "moq_constraints_respected": True,
                    "storage_capacity_respected": True,
                },
                execution_time_ms=elapsed_ms,
                solver=solver_meta,
                explanations=explanations,
                diagnostics={"solver_status_code": int(status_code), "wall_time_ms": elapsed_ms},
                decisions=ReplenishmentDecisions(
                    recommended_orders=recommended_orders,
                    projected_inventory=projected_inv,
                    projected_shortages=projected_short,
                    cost_breakdown=cost_breakdown,
                ),
            )

        elif status_code == cp_model.INFEASIBLE:
            # Check if fallback requested
            if request.enable_fallback:
                fallback_resp = cls._fallback_solution(request, elapsed_ms, solver_meta, "CP-SAT reported INFEASIBLE")
                if fallback_resp:
                    return fallback_resp

            return ReplenishmentOptimizationResponse(
                status=SolverStatus.INFEASIBLE,
                objective_value=None,
                constraint_status={"storage_or_moq_conflict": False},
                execution_time_ms=elapsed_ms,
                solver=solver_meta,
                explanations=["The problem constraints (storage capacity, MOQ, demand) cannot be simultaneously satisfied."],
                diagnostics={"solver_status_code": int(status_code)},
                fallback=FallbackMetadata(attempted=request.enable_fallback, used=False),
            )

        else:  # TIMEOUT or UNKNOWN
            if request.enable_fallback:
                fallback_resp = cls._fallback_solution(request, elapsed_ms, solver_meta, "CP-SAT exceeded time limit")
                if fallback_resp:
                    return fallback_resp

            return ReplenishmentOptimizationResponse(
                status=SolverStatus.TIMEOUT,
                objective_value=None,
                execution_time_ms=elapsed_ms,
                solver=solver_meta,
                explanations=[f"Solver exceeded time limit of {request.time_limit_seconds}s without finding a solution."],
                diagnostics={"solver_status_code": int(status_code)},
                fallback=FallbackMetadata(attempted=request.enable_fallback, used=False),
            )

    @classmethod
    def _fallback_solution(
        cls,
        request: ReplenishmentOptimizationRequest,
        elapsed_ms: float,
        solver_meta: SolverMetadata,
        reason: str,
    ) -> Optional[ReplenishmentOptimizationResponse]:
        """
        Executes Phase 06 static (s, S) baseline replenishment heuristic as a graceful fallback.
        """
        recommended_orders: List[PurchaseOrderRecommendation] = []
        T = request.horizon_periods

        for sku in request.skus:
            # Baseline (s, S) estimate
            d_bar = sum(sku.demand_forecast[:T]) / max(1, T)
            l_lead = max(1, sku.lead_time_periods)
            s_rop = int(d_bar * l_lead + sku.safety_stock_target)
            s_order_up = s_rop + int(max(sku.min_order_quantity, d_bar * 3))

            curr_ip = sku.current_inventory
            if curr_ip < s_rop:
                raw_q = max(sku.min_order_quantity, s_order_up - curr_ip)
                p_size = max(1, sku.pack_size)
                q_adj = ((raw_q + p_size - 1) // p_size) * p_size
                recommended_orders.append(
                    PurchaseOrderRecommendation(
                        sku_id=sku.sku_id,
                        supplier_id=sku.supplier_id,
                        order_period=0,
                        order_quantity=q_adj,
                        expected_delivery_period=sku.lead_time_periods,
                    )
                )

        return ReplenishmentOptimizationResponse(
            status=SolverStatus.FEASIBLE,
            objective_value=None,
            constraint_status={"fallback_baseline_used": True},
            execution_time_ms=elapsed_ms,
            solver=solver_meta,
            explanations=[f"Fallback to Phase 06 (s, S) static policy due to: {reason}."],
            diagnostics={"reason": reason},
            fallback=FallbackMetadata(
                attempted=True,
                used=True,
                policy_id="baseline_static_rop_v1",
                reason=reason,
            ),
            decisions=ReplenishmentDecisions(recommended_orders=recommended_orders),
        )
