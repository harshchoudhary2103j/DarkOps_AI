"""
Deterministic catalog, product, and SKU generator.
"""

import random
from typing import List, Tuple
from ..config import ScenarioConfig
from ..models import ProductPayload, SkuPayload, StorageTemp

CATEGORY_PROFILES = {
    "Produce": {
        "perishable": True,
        "shelf_life_range": (5, 10),
        "temp_range": (2.0, 8.0),
        "items": ["Organic Bananas 1kg", "Hass Avocados 3pk", "Honeycrisp Apples 1kg", "Baby Spinach 200g", "Roma Tomatoes 500g"]
    },
    "Dairy": {
        "perishable": True,
        "shelf_life_range": (10, 21),
        "temp_range": (1.0, 4.0),
        "items": ["Whole Milk 1L", "Greek Yogurt 500g", "Cheddar Cheese 250g", "Salted Butter 250g", "Organic Oat Milk 1L"]
    },
    "Beverages": {
        "perishable": False,
        "shelf_life_range": (90, 180),
        "temp_range": (15.0, 25.0),
        "items": ["Sparkling Water 6pk", "Cold Brew Coffee 330ml", "Orange Juice 1L", "Green Tea 500ml", "Ginger Ale 4pk"]
    },
    "Snacks": {
        "perishable": False,
        "shelf_life_range": (60, 180),
        "temp_range": (15.0, 25.0),
        "items": ["Artisan Potato Chips 150g", "Roasted Almonds 200g", "Dark Chocolate 100g", "Granola Energy Bar 4pk", "Salted Pretzels 200g"]
    }
}


def generate_catalog(
    config: ScenarioConfig,
    rng: random.Random
) -> Tuple[List[ProductPayload], List[SkuPayload]]:
    products: List[ProductPayload] = []
    skus: List[SkuPayload] = []

    categories = config.categories
    num_skus = config.num_skus

    for i in range(1, num_skus + 1):
        category = categories[(i - 1) % len(categories)]
        profile = CATEGORY_PROFILES.get(
            category,
            CATEGORY_PROFILES["Snacks"]
        )

        item_pool = profile["items"]
        item_base_name = item_pool[(i - 1) % len(item_pool)]
        item_name = f"{item_base_name} (Batch {i})"

        prod_id = f"prod-{config.scenario_id}-{i:03d}"
        sku_id = f"sku-{config.scenario_id}-{i:03d}"
        sku_code = f"SKU-{config.scenario_id.upper()[:6]}-{category[:3].upper()}-{i:03d}"

        shelf_life = rng.randint(profile["shelf_life_range"][0], profile["shelf_life_range"][1])
        t_min, t_max = profile["temp_range"]
        price = round(rng.uniform(config.price_range_min, config.price_range_max), 2)

        product = ProductPayload(
            id=prod_id,
            name=item_name,
            category=category,
            description=f"Synthetic quick-commerce product: {item_name}",
            status="ACTIVE"
        )
        products.append(product)

        sku = SkuPayload(
            id=sku_id,
            product_id=prod_id,
            sku_code=sku_code,
            pack_size=1,
            shelf_life_days=shelf_life,
            storage_temp=StorageTemp(min=t_min, max=t_max),
            unit_price=price,
            currency="USD",
            status="ACTIVE"
        )
        skus.append(sku)

    products.sort(key=lambda p: p.id)
    skus.sort(key=lambda s: s.id)
    return products, skus
