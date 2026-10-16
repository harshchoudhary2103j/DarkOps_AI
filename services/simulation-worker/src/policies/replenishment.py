import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from src.seeder.models import HistoricalSaleObservation
from src.policies.config import BaselinePolicyConfig


@dataclass
class ReplenishmentDecision:
    store_id: str
    sku_id: str
    supplier_id: str
    order_quantity: int
    reorder_point: int
    order_up_to_level: int
    inventory_position_before: int
    lead_time_days: float
    reason: str


class BaselineReplenishmentPolicy:
    """
    Transparent, deterministic static reorder point (s, S) policy based on historical moving average demand.

    Invariants:
    - s = ceil(d_bar * L + SS)
    - S > s >= 0
    - IP = physical_on_hand - reserved_stock + incoming_units
    - When IP < s: Q = max(MOQ, S - IP) rounded to pack size
    - Zero duplicate orders: in-flight PO units immediately increment IP
    """

    def __init__(
        self,
        config: BaselinePolicyConfig,
        historical_sales: Optional[List[HistoricalSaleObservation]] = None,
        supplier_skus: Optional[List[Dict[str, Any]]] = None,
    ):
        self.config = config
        self.supplier_skus = supplier_skus or []
        self._demand_rates = self._compute_moving_averages(historical_sales or [])
        self._supplier_metadata = self._index_supplier_metadata(self.supplier_skus)

    def _compute_moving_averages(
        self,
        historical_sales: List[HistoricalSaleObservation]
    ) -> Dict[tuple[str, str], float]:
        """
        Precomputes average daily sales d_bar for each (store_id, sku_id) over the configured history window.
        """
        grouped: Dict[tuple[str, str], List[int]] = {}
        for obs in historical_sales:
            key = (obs.store_id, obs.sku_id)
            if key not in grouped:
                grouped[key] = []
            grouped[key].append(obs.units_sold)

        averages: Dict[tuple[str, str], float] = {}
        window = self.config.moving_average_window_days
        for key, units_list in grouped.items():
            # Use most recent observations up to window length
            recent = units_list[-window:] if len(units_list) >= window else units_list
            avg = sum(recent) / len(recent) if recent else self.config.default_daily_demand_fallback
            averages[key] = max(0.1, round(avg, 2))

        return averages

    def _index_supplier_metadata(self, supplier_skus: List[Dict[str, Any]]) -> Dict[tuple[str, str], Dict[str, Any]]:
        """
        Indexes primary supplier, lead time, MOQ, and pack size per (store_id, sku_id) or sku_id.
        """
        index: Dict[tuple[str, str], Dict[str, Any]] = {}
        for ss in supplier_skus:
            sku_id = ss.get("sku_id")
            if not sku_id:
                continue
            meta = {
                "supplier_id": ss.get("supplier_id", "default_supplier"),
                "lead_time_days": ss.get("lead_time_days", self.config.default_lead_time_days),
                "min_order_quantity": ss.get("min_order_quantity", self.config.min_order_quantity_default),
                "pack_size": ss.get("pack_size", self.config.pack_size_default),
            }
            # Key by sku_id
            index[("ANY", sku_id)] = meta
        return index

    def get_demand_rate(self, store_id: str, sku_id: str) -> float:
        """
        Returns estimated daily demand d_bar for (store_id, sku_id), falling back gracefully.
        """
        return self._demand_rates.get((store_id, sku_id), self.config.default_daily_demand_fallback)

    def calculate_reorder_levels(self, store_id: str, sku_id: str) -> tuple[int, int, float]:
        """
        Computes (s, S, lead_time_days) for a given store and SKU.
        """
        d_bar = self.get_demand_rate(store_id, sku_id)
        supplier_meta = self._supplier_metadata.get(("ANY", sku_id), {})
        L = float(supplier_meta.get("lead_time_days", self.config.default_lead_time_days))

        # Safety Stock: SS = ceil(Z * d_bar * sqrt(L))
        ss = math.ceil(self.config.safety_stock_factor * d_bar * math.sqrt(max(0.01, L)))
        # Reorder Point: s = ceil(d_bar * L + SS)
        s = math.ceil(d_bar * L + ss)
        # Order-Up-To Level: S = s + max(1, ceil(mult * d_bar * L))
        order_up_buffer = math.ceil(self.config.order_up_to_multiplier * d_bar * max(0.5, L))
        S = s + max(5, order_up_buffer)

        return s, S, L

    def evaluate_replenishment(
        self,
        store_id: str,
        sku_id: str,
        physical_on_hand: int,
        reserved_stock: int,
        incoming_units: int,
    ) -> Optional[ReplenishmentDecision]:
        """
        Evaluates whether an inventory position requires replenishment under (s, S) rules.
        """
        if not self.config.replenishment_enabled:
            return None

        # Inventory Position: IP = physical - reserved + incoming
        ip = physical_on_hand - reserved_stock + incoming_units
        s, S, L = self.calculate_reorder_levels(store_id, sku_id)

        if ip >= s:
            return None

        # Deficit replenishment quantity: Q_raw = S - IP
        q_raw = max(0, S - ip)
        if q_raw <= 0:
            return None

        supplier_meta = self._supplier_metadata.get(("ANY", sku_id), {})
        moq = supplier_meta.get("min_order_quantity", self.config.min_order_quantity_default)
        pack_size = supplier_meta.get("pack_size", self.config.pack_size_default)
        supplier_id = supplier_meta.get("supplier_id", "supplier_default")

        # MOQ constraint
        q_adjusted = max(moq, q_raw)

        # Pack size rounding
        if pack_size > 1:
            q_adjusted = math.ceil(q_adjusted / pack_size) * pack_size

        return ReplenishmentDecision(
            store_id=store_id,
            sku_id=sku_id,
            supplier_id=supplier_id,
            order_quantity=q_adjusted,
            reorder_point=s,
            order_up_to_level=S,
            inventory_position_before=ip,
            lead_time_days=L,
            reason=f"IP={ip} < reorder_point={s}; ordering up to S={S}",
        )
