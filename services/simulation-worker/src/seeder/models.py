"""
Data models for DarkOps AI Synthetic World Seeder.
Conforms strictly to Operational API payload schemas and domain contracts.
"""

from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field


class GeoJSONPolygon(BaseModel):
    type: Literal["Polygon"] = "Polygon"
    coordinates: List[List[List[float]]] = Field(
        ...,
        description="Linear rings: exterior ring first, [lon, lat] pairs with closed boundary"
    )


class StorePayload(BaseModel):
    id: str
    name: str
    status: Literal["ACTIVE", "INACTIVE", "MAINTENANCE"] = "ACTIVE"
    latitude: float
    longitude: float
    service_area: GeoJSONPolygon


class ServiceZonePayload(BaseModel):
    id: str
    store_id: str
    name: str
    boundary: GeoJSONPolygon
    status: Literal["ACTIVE", "INACTIVE"] = "ACTIVE"


class ProductPayload(BaseModel):
    id: str
    name: str
    category: str
    description: Optional[str] = None
    status: Literal["ACTIVE", "DISCONTINUED"] = "ACTIVE"


class StorageTemp(BaseModel):
    min: float
    max: float


class SkuPayload(BaseModel):
    id: str
    product_id: str
    sku_code: str
    pack_size: int = Field(default=1, gt=0)
    shelf_life_days: int = Field(default=30, gt=0)
    storage_temp: StorageTemp
    unit_price: float = Field(..., ge=0.0)
    currency: str = "USD"
    status: Literal["ACTIVE", "DISCONTINUED"] = "ACTIVE"


class SupplierReviewSchedule(BaseModel):
    cadence: Literal["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"] = "WEEKLY"
    review_time_utc: str = "14:00"
    days_of_week: Optional[List[int]] = Field(default=[1, 3, 5])


class SupplierPayload(BaseModel):
    id: str
    name: str
    default_lead_time_hours: int = Field(default=24, gt=0)
    default_moq: int = Field(default=10, gt=0)
    review_schedule: SupplierReviewSchedule
    status: Literal["ACTIVE", "INACTIVE"] = "ACTIVE"


class SupplierSkuPayload(BaseModel):
    supplier_id: str
    sku_id: str
    supplier_sku_code: str
    lead_time_hours: int = Field(default=24, gt=0)
    moq: int = Field(default=10, gt=0)
    unit_cost: float = Field(..., ge=0.0)
    is_primary: bool = True


class WarehouseNode(BaseModel):
    id: str
    type: Literal["DISPATCH_STATION", "AISLE", "SHELF", "PICK_ZONE"]
    aisle_id: Optional[str] = None
    shelf_id: Optional[str] = None
    x: float
    y: float
    z: float


class WarehouseEdge(BaseModel):
    from_node: str
    to_node: str
    distance: float = Field(..., ge=0.0)
    bidirectional: bool = True


class WarehouseLayoutPayload(BaseModel):
    id: str
    store_id: str
    name: str
    version: int = 1
    status: Literal["DRAFT", "ACTIVE", "ARCHIVED"] = "ACTIVE"
    nodes: List[WarehouseNode]
    edges: List[WarehouseEdge]


class InitialInventoryPayload(BaseModel):
    store_id: str
    sku_id: str
    initial_physical_on_hand: int = Field(..., ge=0)


class HistoricalSaleObservation(BaseModel):
    store_id: str
    sku_id: str
    date: str
    units_sold: int = Field(..., ge=0)
    unit_price: float = Field(..., ge=0.0)


class PurchaseOrderLine(BaseModel):
    sku_id: str
    quantity: int = Field(..., gt=0)
    unit_cost: float = Field(..., ge=0.0)


class PurchaseOrderSchedule(BaseModel):
    po_id: str
    store_id: str
    supplier_id: str
    scheduled_order_date: str
    expected_delivery_date: str
    status: Literal["PLANNED"] = "PLANNED"
    lines: List[PurchaseOrderLine]


class SyntheticWorld(BaseModel):
    scenario_id: str
    seed: int
    stores: List[StorePayload]
    service_zones: List[ServiceZonePayload]
    products: List[ProductPayload]
    skus: List[SkuPayload]
    suppliers: List[SupplierPayload]
    supplier_skus: List[SupplierSkuPayload]
    warehouse_layouts: List[WarehouseLayoutPayload]
    initial_inventory: List[InitialInventoryPayload]
    historical_sales: List[HistoricalSaleObservation]
    purchase_orders: List[PurchaseOrderSchedule]
    sku_to_shelf_mapping: Dict[str, str] = Field(default_factory=dict)
