"""
Deterministic supplier, supplier-SKU relationship, and planned PO schedule generator.
"""

import random
from datetime import datetime, timedelta
from typing import List, Tuple
from ..config import ScenarioConfig
from ..models import (
    SupplierPayload,
    SupplierSkuPayload,
    SupplierReviewSchedule,
    PurchaseOrderSchedule,
    PurchaseOrderLine,
    StorePayload,
    SkuPayload
)


def generate_suppliers(
    stores: List[StorePayload],
    skus: List[SkuPayload],
    config: ScenarioConfig,
    rng: random.Random
) -> Tuple[List[SupplierPayload], List[SupplierSkuPayload], List[PurchaseOrderSchedule]]:
    suppliers: List[SupplierPayload] = []
    supplier_skus: List[SupplierSkuPayload] = []
    purchase_orders: List[PurchaseOrderSchedule] = []

    supplier_names = [
        "Apex Wholesale Distributors",
        "Beacon Fresh Logistics",
        "Crown Beverage Supply",
        "Delta Prime Provisions",
        "Echo Cold Chain Co."
    ]

    for i in range(1, config.num_suppliers + 1):
        sup_id = f"sup-{config.scenario_id}-{i:02d}"
        sup_name = supplier_names[(i - 1) % len(supplier_names)]
        if i > len(supplier_names):
            sup_name = f"{sup_name} Branch {i}"

        lead_time = rng.randint(config.supplier_lead_time_min_hours, config.supplier_lead_time_max_hours)
        moq = rng.choice([10, 20, 25, 50])

        supplier = SupplierPayload(
            id=sup_id,
            name=sup_name,
            default_lead_time_hours=lead_time,
            default_moq=moq,
            review_schedule=SupplierReviewSchedule(
                cadence="WEEKLY",
                review_time_utc="14:00",
                days_of_week=[1, 3, 5]
            ),
            status="ACTIVE"
        )
        suppliers.append(supplier)

    # Assign each SKU to a primary supplier
    for idx, sku in enumerate(skus):
        assigned_sup = suppliers[idx % len(suppliers)]
        cost_ratio = round(rng.uniform(0.55, 0.70), 2)
        unit_cost = round(sku.unit_price * cost_ratio, 2)

        supplier_sku = SupplierSkuPayload(
            supplier_id=assigned_sup.id,
            sku_id=sku.id,
            supplier_sku_code=f"SUP-{sku.sku_code}",
            lead_time_hours=assigned_sup.default_lead_time_hours,
            moq=assigned_sup.default_moq,
            unit_cost=unit_cost,
            is_primary=True
        )
        supplier_skus.append(supplier_sku)

    # Generate initial planned purchase order schedule (e.g. for Day 1 replenishment)
    base_date = datetime(2026, 10, 1)
    for s_idx, store in enumerate(stores):
        for sup in suppliers:
            # Planned order placed on base_date, arriving after lead_time
            po_id = f"po-{config.scenario_id}-{store.id}-{sup.id}"
            delivery_date = base_date + timedelta(hours=sup.default_lead_time_hours)

            # Lines for SKUs supplied by this supplier
            relevant_skus = [ss for ss in supplier_skus if ss.supplier_id == sup.id]
            lines = [
                PurchaseOrderLine(
                    sku_id=ss.sku_id,
                    quantity=ss.moq * 2,
                    unit_cost=ss.unit_cost
                )
                for ss in relevant_skus
            ]

            if lines:
                po = PurchaseOrderSchedule(
                    po_id=po_id,
                    store_id=store.id,
                    supplier_id=sup.id,
                    scheduled_order_date=base_date.strftime("%Y-%m-%d"),
                    expected_delivery_date=delivery_date.strftime("%Y-%m-%d"),
                    status="PLANNED",
                    lines=lines
                )
                purchase_orders.append(po)

    suppliers.sort(key=lambda s: s.id)
    supplier_skus.sort(key=lambda ss: (ss.supplier_id, ss.sku_id))
    purchase_orders.sort(key=lambda po: po.po_id)

    return suppliers, supplier_skus, purchase_orders
