"""
Deterministic historical sales observations generator for pre-warming demand forecasting.
"""

import random
from datetime import datetime, timedelta
from typing import List
from ..config import ScenarioConfig
from ..models import StorePayload, SkuPayload, HistoricalSaleObservation


def generate_sales_history(
    stores: List[StorePayload],
    skus: List[SkuPayload],
    config: ScenarioConfig,
    rng: random.Random
) -> List[HistoricalSaleObservation]:
    observations: List[HistoricalSaleObservation] = []

    # Historical window ends immediately before simulated operations start
    end_date = datetime(2026, 9, 30)
    start_date = end_date - timedelta(days=config.history_horizon_days - 1)

    # Day-of-week multipliers: Mon=0 .. Sun=6
    day_multipliers = {
        0: 0.9,   # Monday
        1: 0.85,  # Tuesday
        2: 0.9,   # Wednesday
        3: 1.0,   # Thursday
        4: 1.25,  # Friday (surge)
        5: 1.35,  # Saturday (surge)
        6: 1.15   # Sunday
    }

    current = start_date
    while current <= end_date:
        date_str = current.strftime("%Y-%m-%d")
        dow = current.weekday()
        dow_mult = day_multipliers.get(dow, 1.0)

        for store in stores:
            for sku in skus:
                # Calculate expected demand with SKU price elasticity effect
                base_lambda = config.daily_demand_lambda
                if sku.unit_price > 10.0:
                    base_lambda *= 0.6
                elif sku.unit_price < 3.0:
                    base_lambda *= 1.4

                expected_demand = base_lambda * dow_mult
                # Poisson approximation via bounded normal or integer draw
                units = max(0, int(round(rng.gauss(expected_demand, math_sqrt := (expected_demand ** 0.5)))))

                observations.append(
                    HistoricalSaleObservation(
                        store_id=store.id,
                        sku_id=sku.id,
                        date=date_str,
                        units_sold=units,
                        unit_price=sku.unit_price
                    )
                )

        current += timedelta(days=1)

    observations.sort(key=lambda o: (o.date, o.store_id, o.sku_id))
    return observations
