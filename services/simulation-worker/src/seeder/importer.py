"""
Dependency-aware, retry-safe importer for Operational API integration.
"""

from typing import Dict, List, Any
import requests
from .models import SyntheticWorld


class ImportReport:
    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.counts: Dict[str, int] = {
            "stores": 0,
            "service_zones": 0,
            "products": 0,
            "skus": 0,
            "suppliers": 0,
            "supplier_skus": 0,
            "warehouse_layouts": 0,
            "inventory_positions": 0
        }
        self.errors: List[str] = []

    @property
    def is_success(self) -> bool:
        return len(self.errors) == 0

    def summary(self) -> Dict[str, Any]:
        return {
            "dry_run": self.dry_run,
            "is_success": self.is_success,
            "imported_counts": self.counts,
            "error_count": len(self.errors),
            "errors": self.errors
        }


class WorldImporter:
    def __init__(self, api_base_url: str = "http://localhost:3000"):
        import os
        self.base_url = api_base_url.rstrip("/")
        jwt_token = os.environ.get("JWT_SECRET", "development_jwt_secret_change_in_production_32chars_min")
        self.headers = {
            "Content-Type": "application/json",
            "X-Actor-Id": "simulation-worker-seeder",
            "X-Actor-Role": "ADMIN",
            "Authorization": f"Bearer {jwt_token}",
            "x-admin-key": jwt_token
        }

    def import_world(self, world: SyntheticWorld, dry_run: bool = False) -> ImportReport:
        report = ImportReport(dry_run=dry_run)

        if dry_run:
            report.counts["stores"] = len(world.stores)
            report.counts["service_zones"] = len(world.service_zones)
            report.counts["products"] = len(world.products)
            report.counts["skus"] = len(world.skus)
            report.counts["suppliers"] = len(world.suppliers)
            report.counts["supplier_skus"] = len(world.supplier_skus)
            report.counts["warehouse_layouts"] = len(world.warehouse_layouts)
            report.counts["inventory_positions"] = len(world.initial_inventory)
            return report

        # Step 1: Stores
        for store in world.stores:
            self._post_idempotent(
                f"{self.base_url}/api/v1/stores",
                store.model_dump(),
                "stores",
                store.id,
                report
            )

        # Step 2: Service Zones
        for zone in world.service_zones:
            self._post_idempotent(
                f"{self.base_url}/api/v1/service-zones",
                zone.model_dump(),
                "service_zones",
                zone.id,
                report
            )

        # Step 3: Products
        for prod in world.products:
            self._post_idempotent(
                f"{self.base_url}/api/v1/products",
                prod.model_dump(),
                "products",
                prod.id,
                report
            )

        # Step 4: SKUs
        for sku in world.skus:
            self._post_idempotent(
                f"{self.base_url}/api/v1/skus",
                sku.model_dump(),
                "skus",
                sku.id,
                report
            )

        # Step 5: Suppliers
        for sup in world.suppliers:
            self._post_idempotent(
                f"{self.base_url}/api/v1/suppliers",
                sup.model_dump(),
                "suppliers",
                sup.id,
                report
            )

        # Step 6: Supplier-SKU M:N links
        for ss in world.supplier_skus:
            self._post_idempotent(
                f"{self.base_url}/api/v1/suppliers/{ss.supplier_id}/skus",
                ss.model_dump(),
                "supplier_skus",
                f"{ss.supplier_id}:{ss.sku_id}",
                report
            )

        # Step 7: Warehouse Layouts
        for layout in world.warehouse_layouts:
            self._post_idempotent(
                f"{self.base_url}/api/v1/warehouse-layouts",
                layout.model_dump(),
                "warehouse_layouts",
                layout.id,
                report
            )

        # Step 8: Initial Inventory Positions
        for inv in world.initial_inventory:
            headers = {
                **self.headers,
                "Idempotency-Key": f"init-seed-{world.scenario_id}-{inv.store_id}-{inv.sku_id}"
            }
            try:
                res = requests.post(
                    f"{self.base_url}/api/v1/inventory/initialize",
                    json=inv.model_dump(),
                    headers=headers,
                    timeout=10
                )
                if res.status_code in (200, 201):
                    report.counts["inventory_positions"] += 1
                elif res.status_code == 409:
                    # Already initialized (idempotent replay)
                    report.counts["inventory_positions"] += 1
                else:
                    report.errors.append(
                        f"Failed to initialize inventory ({inv.store_id}, {inv.sku_id}): HTTP {res.status_code} - {res.text}"
                    )
            except Exception as e:
                report.errors.append(f"Network error initializing inventory ({inv.store_id}, {inv.sku_id}): {str(e)}")

        return report

    def _post_idempotent(
        self,
        url: str,
        payload: dict,
        entity_name: str,
        entity_id: str,
        report: ImportReport
    ) -> None:
        try:
            res = requests.post(url, json=payload, headers=self.headers, timeout=10)
            if res.status_code in (200, 201):
                report.counts[entity_name] += 1
            elif res.status_code == 409:
                # Already exists
                report.counts[entity_name] += 1
            else:
                report.errors.append(
                    f"Failed to import {entity_name} '{entity_id}': HTTP {res.status_code} - {res.text}"
                )
        except Exception as e:
            report.errors.append(f"Network error importing {entity_name} '{entity_id}': {str(e)}")
