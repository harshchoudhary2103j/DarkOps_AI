"""
Deterministic initial inventory position generator.
"""

import random
from typing import List
from ..config import ScenarioConfig
from ..models import StorePayload, SkuPayload, InitialInventoryPayload


def generate_initial_inventory(
    stores: List[StorePayload],
    skus: List[SkuPayload],
    config: ScenarioConfig,
    rng: random.Random
) -> List[InitialInventoryPayload]:
    positions: List[InitialInventoryPayload] = []

    for store in stores:
        for sku in skus:
            qty = rng.randint(config.initial_stock_min, config.initial_stock_max)
            positions.append(
                InitialInventoryPayload(
                    store_id=store.id,
                    sku_id=sku.id,
                    initial_physical_on_hand=qty
                )
            )

    positions.sort(key=lambda p: (p.store_id, p.sku_id))
    return positions
