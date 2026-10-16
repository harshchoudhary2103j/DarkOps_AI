from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple

from src.policies.config import BaselinePolicyConfig

if TYPE_CHECKING:
    from src.simulation.run_state import RunState


class AllocationStatus(str, Enum):
    ALLOCATED = "ALLOCATED"
    UNFULFILLABLE = "UNFULFILLABLE"
    RESERVATION_FAILED = "RESERVATION_FAILED"


@dataclass
class CandidateEvaluation:
    store_id: str
    distance_km: float
    is_serviceable: bool
    has_full_inventory: bool
    stock_shortfalls: Dict[str, int] = field(default_factory=dict)
    rejection_reason: Optional[str] = None


@dataclass
class AllocationResult:
    status: AllocationStatus
    selected_store_id: Optional[str] = None
    distance_km: Optional[float] = None
    candidates: List[CandidateEvaluation] = field(default_factory=list)
    reason: Optional[str] = None


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Computes great-circle distance between two GPS coordinates in kilometers.
    """
    r_earth = 6371.0  # km
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(r_earth * c, 3)


class BaselineOrderAllocationPolicy:
    """
    Greedy nearest-eligible store policy selecting the closest operational dark store
    with complete basket inventory availability.

    Invariants:
    - Never splits baskets across stores
    - Never marks an order ALLOCATED before all line reservations atomically succeed
    - If reservation fails, all partial reservations are rolled back
    - Deterministic tie-breaking on (distance_km, store_id)
    """

    def __init__(self, config: BaselinePolicyConfig):
        self.config = config

    def evaluate_and_allocate(
        self,
        run_state: RunState,
        order_id: str,
        customer_latitude: float,
        customer_longitude: float,
        delivery_zone_id: Optional[str],
        lines: List[Dict[str, Any]],
        virtual_timestamp: Any,
    ) -> AllocationResult:
        """
        Evaluates candidate stores, selects the closest eligible store, and reserves stock.
        """
        candidates: List[CandidateEvaluation] = []
        eligible_stores: List[Tuple[float, str]] = []

        for store_id, store in run_state.stores.items():
            s_lat = store.get("latitude")
            s_lon = store.get("longitude")
            if s_lat is None or s_lon is None:
                continue

            dist = haversine_distance(customer_latitude, customer_longitude, s_lat, s_lon)

            # Check geographic eligibility
            is_serviceable = False
            if delivery_zone_id and delivery_zone_id in run_state.service_zones:
                zone_store = run_state.service_zones[delivery_zone_id].get("store_id")
                if zone_store == store_id:
                    is_serviceable = True
            elif dist <= self.config.max_service_distance_km:
                is_serviceable = True

            if not is_serviceable:
                candidates.append(
                    CandidateEvaluation(
                        store_id=store_id,
                        distance_km=dist,
                        is_serviceable=False,
                        has_full_inventory=False,
                        rejection_reason="Outside service zone / delivery radius",
                    )
                )
                continue

            # Check inventory availability across complete basket
            has_full_inventory = True
            shortfalls: Dict[str, int] = {}
            for line in lines:
                sku_id = line["sku_id"]
                requested_qty = line["quantity"]
                pos = run_state.get_position(store_id, sku_id)
                available = pos.available_stock if pos else 0
                if available < requested_qty:
                    has_full_inventory = False
                    shortfalls[sku_id] = requested_qty - available

            if not has_full_inventory:
                candidates.append(
                    CandidateEvaluation(
                        store_id=store_id,
                        distance_km=dist,
                        is_serviceable=True,
                        has_full_inventory=False,
                        stock_shortfalls=shortfalls,
                        rejection_reason=f"Insufficient inventory: {shortfalls}",
                    )
                )
                continue

            # Candidate meets all eligibility criteria
            candidates.append(
                CandidateEvaluation(
                    store_id=store_id,
                    distance_km=dist,
                    is_serviceable=True,
                    has_full_inventory=True,
                )
            )
            eligible_stores.append((dist, store_id))

        if not eligible_stores:
            return AllocationResult(
                status=AllocationStatus.UNFULFILLABLE,
                candidates=candidates,
                reason="No candidate store possesses both geographic coverage and complete basket inventory",
            )

        # Sort by ascending distance, with stable store_id tie-breaking
        eligible_stores.sort(key=lambda item: (item[0], item[1]))

        # Attempt atomic reservation with rollback on partial failure
        for dist, store_id in eligible_stores:
            reserved_lines: List[Tuple[str, int]] = []
            all_succeeded = True

            for line in lines:
                sku_id = line["sku_id"]
                qty = line["quantity"]
                success = run_state.reserve_stock(
                    store_id=store_id,
                    sku_id=sku_id,
                    quantity=qty,
                    reference=f"ORD-{order_id}",
                    virtual_timestamp=virtual_timestamp,
                )
                if success:
                    reserved_lines.append((sku_id, qty))
                else:
                    all_succeeded = False
                    break

            if all_succeeded:
                return AllocationResult(
                    status=AllocationStatus.ALLOCATED,
                    selected_store_id=store_id,
                    distance_km=dist,
                    candidates=candidates,
                )

            # Rollback partial reservations before attempting next candidate
            for r_sku, r_qty in reserved_lines:
                run_state.release_stock(
                    store_id=store_id,
                    sku_id=r_sku,
                    quantity=r_qty,
                    reference=f"ROLLBACK-{order_id}",
                    virtual_timestamp=virtual_timestamp,
                )

        return AllocationResult(
            status=AllocationStatus.RESERVATION_FAILED,
            candidates=candidates,
            reason="All eligible store candidate reservation attempts failed due to concurrent stock depletion",
        )
