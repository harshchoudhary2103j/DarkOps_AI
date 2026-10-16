import hashlib
import math
import random
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field

from src.simulation.events import EventType, PRIORITY_CUSTOMER_ORDER_ARRIVED, SimulationEvent


class DemandConfig(BaseModel):
    """
    Configuration for non-homogeneous Poisson customer demand generation.
    """
    model_config = ConfigDict(frozen=True)

    base_hourly_rate: float = Field(default=12.0, ge=0.0, description="Base customer orders per hour")
    hour_multipliers: Dict[int, float] = Field(
        default_factory=lambda: {
            0: 0.2, 1: 0.1, 2: 0.05, 3: 0.05, 4: 0.05, 5: 0.1,
            6: 0.3, 7: 0.6, 8: 0.9, 9: 1.1, 10: 1.2, 11: 1.4,
            12: 1.6, 13: 1.5, 14: 1.2, 15: 1.1, 16: 1.2, 17: 1.4,
            18: 1.8, 19: 1.9, 20: 1.7, 21: 1.3, 22: 0.8, 23: 0.4
        }
    )
    weekday_multipliers: Dict[int, float] = Field(
        default_factory=lambda: {
            0: 0.9, 1: 0.85, 2: 0.95, 3: 1.05, 4: 1.25, 5: 1.4, 6: 1.35
        }
    )
    min_basket_size: int = Field(default=1, ge=1)
    max_basket_size: int = Field(default=8, ge=1)
    mean_basket_size: float = Field(default=3.2, gt=0.0)
    max_units_per_sku: int = Field(default=3, ge=1)


def derive_subsystem_seed(base_seed: int, subsystem_name: str) -> int:
    """
    Deterministically derives a 64-bit integer seed for an isolated stochastic subsystem.
    """
    raw_str = f"{base_seed}:{subsystem_name}"
    digest = hashlib.sha256(raw_str.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], byteorder="big", signed=False)


class SyntheticDemandGenerator:
    """
    Deterministic, time-varying Poisson demand generator for quick-commerce orders.
    Uses independent seeded PRNGs for arrivals, basket sizes, SKU sampling, and spatial coordinates.
    """

    def __init__(
        self,
        config: DemandConfig,
        catalog_skus: List[Dict[str, Any]],
        stores: List[Dict[str, Any]],
        service_zones: List[Dict[str, Any]],
        run_seed: int,
    ):
        self.config = config
        self.catalog_skus = catalog_skus
        self.stores = stores
        self.service_zones = service_zones
        self.run_seed = run_seed

        # Isolated deterministic PRNG instances
        self.rng_arrivals = random.Random(derive_subsystem_seed(run_seed, "arrivals"))
        self.rng_baskets = random.Random(derive_subsystem_seed(run_seed, "baskets"))
        self.rng_skus = random.Random(derive_subsystem_seed(run_seed, "skus"))
        self.rng_geo = random.Random(derive_subsystem_seed(run_seed, "geo"))

        # Precompute normalized category weights for SKUs
        self._sku_weights = self._build_sku_weights()

    def _build_sku_weights(self) -> List[float]:
        if not self.catalog_skus:
            return []
        # Category popularity weighting: bakery & produce higher, alcohol / ambient standard
        weights: List[float] = []
        for sku in self.catalog_skus:
            storage = sku.get("storage_temp", "AMBIENT")
            price = sku.get("unit_price", 5.0)
            base_w = 1.0
            if storage == "CHILLED":
                base_w = 1.4
            elif storage == "FROZEN":
                base_w = 0.8
            # Modulate slightly inversely with price
            price_factor = max(0.5, min(2.0, 10.0 / max(price, 1.0)))
            weights.append(base_w * price_factor)
        total = sum(weights)
        return [w / total for w in weights] if total > 0 else [1.0 / len(weights)] * len(weights)

    def _get_arrival_rate(self, current_time: datetime) -> float:
        """
        Calculates λ(t) in orders per hour for the given timestamp.
        """
        hour = current_time.hour
        weekday = current_time.weekday()

        h_mult = self.config.hour_multipliers.get(hour, 1.0)
        d_mult = self.config.weekday_multipliers.get(weekday, 1.0)

        rate = self.config.base_hourly_rate * h_mult * d_mult
        return max(0.0, rate)

    def generate_orders(
        self,
        start_time: datetime,
        end_time: datetime,
        run_id: str,
    ) -> List[SimulationEvent]:
        """
        Generates customer order arrival events between start_time and end_time.
        Uses exact piecewise-constant non-homogeneous Poisson process simulation.
        """
        start_utc = start_time.replace(tzinfo=timezone.utc) if start_time.tzinfo is None else start_time.astimezone(timezone.utc)
        end_utc = end_time.replace(tzinfo=timezone.utc) if end_time.tzinfo is None else end_time.astimezone(timezone.utc)

        events: List[SimulationEvent] = []
        current_time = start_utc
        order_index = 0

        while current_time < end_utc:
            rate = self._get_arrival_rate(current_time)
            # Find time remaining in current hour interval
            next_hour = (current_time.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1))
            seconds_to_boundary = (next_hour - current_time).total_seconds()

            if rate <= 0.0:
                # Zero rate interval: advance straight to next hour boundary
                current_time = next_hour
                continue

            # Exponential inter-arrival time in seconds: Δt = -ln(U) / (rate / 3600)
            u = self.rng_arrivals.random()
            # Avoid u == 0
            u = max(1e-12, min(1.0 - 1e-12, u))
            dt_seconds = -math.log(u) / (rate / 3600.0)

            if dt_seconds < seconds_to_boundary:
                # Arrival occurs within this hour interval
                current_time += timedelta(seconds=dt_seconds)
                if current_time >= end_utc:
                    break

                order_index += 1
                event = self._create_order_event(current_time, order_index, run_id)
                events.append(event)
            else:
                # Boundary crossed: advance to boundary, preserving Poisson memoryless property
                current_time = next_hour

        return events

    def _create_order_event(
        self,
        arrival_time: datetime,
        order_index: int,
        run_id: str,
    ) -> SimulationEvent:
        order_id = f"ord_{run_id}_{order_index:05d}"
        customer_id = f"cust_{run_id}_{order_index:05d}"

        # 1. Sample basket size via truncated Poisson
        basket_size = self._sample_basket_size()

        # 2. Sample SKUs without replacement
        num_skus_to_pick = min(basket_size, len(self.catalog_skus))
        sku_indices = self.rng_skus.choices(
            range(len(self.catalog_skus)),
            weights=self._sku_weights,
            k=num_skus_to_pick * 2  # over-sample to handle duplicates
        )
        selected_sku_indices: List[int] = []
        for idx in sku_indices:
            if idx not in selected_sku_indices:
                selected_sku_indices.append(idx)
            if len(selected_sku_indices) == num_skus_to_pick:
                break

        # In rare case where unique skus < num_skus_to_pick, fill with any available
        for idx in range(len(self.catalog_skus)):
            if len(selected_sku_indices) == num_skus_to_pick:
                break
            if idx not in selected_sku_indices:
                selected_sku_indices.append(idx)

        # 3. Create lines with quantities
        lines = []
        for idx in selected_sku_indices:
            sku = self.catalog_skus[idx]
            qty = self.rng_baskets.randint(1, self.config.max_units_per_sku)
            lines.append({
                "sku_id": sku["id"],
                "sku_code": sku.get("sku_code", ""),
                "quantity": qty,
                "unit_price": sku.get("unit_price", 0.0),
            })

        # 4. Determine customer coordinates within service zone
        lat, lon, zone_id = self._sample_customer_location()

        payload = {
            "order_id": order_id,
            "customer_id": customer_id,
            "customer_latitude": lat,
            "customer_longitude": lon,
            "delivery_zone_id": zone_id,
            "lines": lines,
            "total_requested_units": sum(l["quantity"] for l in lines),
            "line_count": len(lines),
        }

        return SimulationEvent(
            run_id=run_id,
            event_id=f"evt_{run_id}_arr_{order_index:05d}",
            sequence_number=order_index,  # Will be normalized by EventQueue on enqueue
            event_type=EventType.CUSTOMER_ORDER_ARRIVED,
            virtual_timestamp=arrival_time,
            priority=PRIORITY_CUSTOMER_ORDER_ARRIVED,
            payload=payload,
        )

    def _sample_basket_size(self) -> int:
        """
        Samples basket size from a truncated Poisson distribution with configured mean and bounds.
        """
        lam = self.config.mean_basket_size
        # Knuth's Poisson generator
        l = math.exp(-lam)
        k = 0
        p = 1.0
        while p > l and k < 50:
            k += 1
            p *= self.rng_baskets.random()
        sampled = max(k - 1, 1)
        return max(self.config.min_basket_size, min(self.config.max_basket_size, sampled))

    def _sample_customer_location(self) -> tuple[float, float, Optional[str]]:
        """
        Samples customer delivery coordinates within a service zone or near a store.
        """
        if self.service_zones:
            zone = self.rng_geo.choice(self.service_zones)
            poly = zone.get("boundary_polygon", {})
            coords = poly.get("coordinates", [[]])[0]
            if len(coords) >= 4:
                # Bounding box of zone polygon
                lats = [pt[1] for pt in coords]
                lons = [pt[0] for pt in coords]
                min_lat, max_lat = min(lats), max(lats)
                min_lon, max_lon = min(lons), max(lons)
                # Sample within inner 80% to ensure within polygon
                mid_lat = (min_lat + max_lat) / 2.0
                mid_lon = (min_lon + max_lon) / 2.0
                sampled_lat = round(mid_lat + (self.rng_geo.random() - 0.5) * (max_lat - min_lat) * 0.8, 6)
                sampled_lon = round(mid_lon + (self.rng_geo.random() - 0.5) * (max_lon - min_lon) * 0.8, 6)
                return sampled_lat, sampled_lon, zone.get("id")

        if self.stores:
            store = self.rng_geo.choice(self.stores)
            s_lat = store.get("latitude", 40.7128)
            s_lon = store.get("longitude", -74.0060)
            offset_lat = round(s_lat + (self.rng_geo.random() - 0.5) * 0.02, 6)
            offset_lon = round(s_lon + (self.rng_geo.random() - 0.5) * 0.02, 6)
            return offset_lat, offset_lon, None

        return 40.7128, -74.0060, None
