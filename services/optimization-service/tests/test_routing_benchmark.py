import random
from src.models.common import SolverStatus
from src.models.routing import PickerRouteOptimizationRequest, PickItemInput
from src.solvers.routing import PickerRouteSolver


def generate_benchmark_layout(aisle_count: int, shelves_per_aisle: int, seed: int):
    """
    Generates a realistic multi-aisle warehouse layout graph.
    """
    rng = random.Random(seed)
    nodes = [{"id": "DISPATCH", "type": "DISPATCH_STATION", "x": 0.0, "y": 0.0}]
    edges = []

    # Front cross-aisle connecting bottom of all aisles
    for a in range(aisle_count):
        cross_bottom_id = f"CROSS_B_{a}"
        cross_top_id = f"CROSS_T_{a}"
        nodes.append({"id": cross_bottom_id, "type": "AISLE_NODE", "x": float(a * 4), "y": 0.0})
        nodes.append({"id": cross_top_id, "type": "AISLE_NODE", "x": float(a * 4), "y": float(shelves_per_aisle * 3 + 3)})

        # Connect dispatch to first cross bottom
        if a == 0:
            edges.append({"from_node": "DISPATCH", "to_node": cross_bottom_id, "distance": 4.0, "bidirectional": True})
        else:
            prev_b = f"CROSS_B_{a-1}"
            prev_t = f"CROSS_T_{a-1}"
            edges.append({"from_node": prev_b, "to_node": cross_bottom_id, "distance": 4.0, "bidirectional": True})
            edges.append({"from_node": prev_t, "to_node": cross_top_id, "distance": 4.0, "bidirectional": True})

        # Create shelves along aisle
        last_node = cross_bottom_id
        for s in range(shelves_per_aisle):
            shelf_id = f"SHELF_A{a}_S{s}"
            y_pos = float((s + 1) * 3)
            nodes.append({"id": shelf_id, "type": "SHELF", "x": float(a * 4), "y": y_pos, "aisle_id": f"AISLE_{a}"})
            edges.append({"from_node": last_node, "to_node": shelf_id, "distance": 3.0, "bidirectional": True})
            last_node = shelf_id

        # Connect top shelf to cross top
        edges.append({"from_node": last_node, "to_node": cross_top_id, "distance": 3.0, "bidirectional": True})

    return {"id": f"bench_layout_{seed}", "store_id": f"store_{seed}", "nodes": nodes, "edges": edges}


def test_fifty_picker_route_benchmarks():
    """
    Benchmarks 50 distinct warehouse layout and basket configurations.
    Validates graph-path continuity, shelf coverage, and compares against Phase 06 baseline.
    """
    total_baseline_dist = 0.0
    total_optimized_dist = 0.0
    valid_route_count = 0
    improved_or_equal_count = 0

    benchmark_records = []

    for case_id in range(1, 51):
        aisle_count = 3 + (case_id % 4)          # 3 to 6 aisles
        shelves_per_aisle = 4 + (case_id % 5)    # 4 to 8 shelves per aisle
        layout = generate_benchmark_layout(aisle_count, shelves_per_aisle, seed=case_id)

        # Select 2 to 7 random shelves for picking
        all_shelves = [n["id"] for n in layout["nodes"] if n["type"] == "SHELF"]
        rng = random.Random(case_id * 100)
        pick_count = min(len(all_shelves), 2 + (case_id % 6))
        chosen_shelves = rng.sample(all_shelves, pick_count)

        pick_items = [
            PickItemInput(item_id=f"item_{i}", sku_id=f"sku_{i}", shelf_node_id=s)
            for i, s in enumerate(chosen_shelves)
        ]

        req = PickerRouteOptimizationRequest(
            task_id=f"task_bench_{case_id}",
            store_id=f"store_{case_id}",
            layout=layout,
            pick_items=pick_items,
            time_limit_seconds=1.0,
        )

        resp = PickerRouteSolver.solve(req)

        assert resp.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
        assert resp.constraint_status["dispatch_anchored"] is True
        assert resp.constraint_status["all_shelves_visited"] is True
        assert resp.constraint_status["graph_edges_valid"] is True

        opt_dist = resp.decisions.total_distance_meters
        comp = resp.decisions.baseline_comparison
        assert comp is not None

        base_dist = comp.baseline_distance_meters

        total_baseline_dist += base_dist
        total_optimized_dist += opt_dist
        valid_route_count += 1

        # The optimized TSP distance must be <= baseline distance (within 0.01 floating point error)
        # because the TSP explores all permutations including the S-Shape permutation!
        assert opt_dist <= base_dist + 0.01, f"Case {case_id}: opt {opt_dist} > base {base_dist}"

        if opt_dist <= base_dist:
            improved_or_equal_count += 1

        benchmark_records.append({
            "case": case_id,
            "stops": pick_count,
            "base_m": base_dist,
            "opt_m": opt_dist,
            "reduction_pct": comp.distance_reduction_percent,
            "ms": resp.execution_time_ms,
        })

    # Assertions across the 50 benchmarks
    assert valid_route_count == 50
    assert improved_or_equal_count == 50

    overall_reduction_pct = round(((total_baseline_dist - total_optimized_dist) / total_baseline_dist) * 100.0, 2)
    print(f"\n[Benchmark Summary] 50 Cases Tested:")
    print(f"Total Baseline Distance: {round(total_baseline_dist, 1)}m")
    print(f"Total Optimized Distance: {round(total_optimized_dist, 1)}m")
    print(f"Overall Distance Reduction: {overall_reduction_pct}%")
    assert overall_reduction_pct >= 0.0
