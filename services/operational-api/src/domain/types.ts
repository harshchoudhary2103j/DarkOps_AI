export type StoreStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
export type ServiceZoneStatus = 'ACTIVE' | 'INACTIVE';
export type ProductStatus = 'ACTIVE' | 'DISCONTINUED';
export type SKUStatus = 'ACTIVE' | 'DISCONTINUED';
export type SupplierStatus = 'ACTIVE' | 'INACTIVE';
export type WarehouseLayoutStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';
export type AuditEntityType = 'STORE' | 'SERVICE_ZONE' | 'PRODUCT' | 'SKU' | 'SUPPLIER' | 'WAREHOUSE_LAYOUT';

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][]; // [ [ [lon, lat], ... ] ]
}

export interface Store {
  id: string;
  name: string;
  status: StoreStatus;
  latitude: number;
  longitude: number;
  service_area: GeoJSONPolygon;
  created_at: string;
  updated_at: string;
}

export interface ServiceZone {
  id: string;
  store_id: string;
  name: string;
  boundary: GeoJSONPolygon;
  status: ServiceZoneStatus;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  description: string | null;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
}

export interface StorageTempRequirement {
  unit: 'CELSIUS' | 'FAHRENHEIT';
  min: number;
  max: number;
  zone?: 'AMBIENT' | 'CHILLED' | 'FROZEN';
}

export interface SKU {
  id: string;
  product_id: string;
  sku_code: string;
  pack_size: number;
  shelf_life_days: number;
  storage_temp: StorageTempRequirement;
  unit_price: number;
  currency: string;
  status: SKUStatus;
  created_at: string;
  updated_at: string;
}

export interface ReviewSchedule {
  cadence: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  review_time_utc?: string;
  days_of_week?: number[];
  cron_expression?: string;
}

export interface Supplier {
  id: string;
  name: string;
  default_lead_time_hours: number;
  default_moq: number;
  review_schedule: ReviewSchedule;
  status: SupplierStatus;
  created_at: string;
  updated_at: string;
}

export interface SupplierSKU {
  supplier_id: string;
  sku_id: string;
  supplier_sku_code?: string | null;
  lead_time_hours: number;
  moq: number;
  unit_cost: number;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export type WarehouseNodeType = 'DISPATCH_STATION' | 'AISLE' | 'SHELF' | 'PICK_ZONE';

export interface WarehouseNode {
  id: string;
  type: WarehouseNodeType;
  aisle_id?: string | null;
  shelf_id?: string | null;
  x: number;
  y: number;
  z: number;
}

export interface WarehouseEdge {
  from_node: string;
  to_node: string;
  distance: number;
  bidirectional: boolean;
}

export interface WarehouseLayout {
  id: string;
  store_id: string;
  name: string;
  version: number;
  status: WarehouseLayoutStatus;
  nodes: WarehouseNode[];
  edges: WarehouseEdge[];
  created_at: string;
  updated_at: string;
}

export interface CatalogAuditEvent {
  id: string;
  entity_type: AuditEntityType;
  entity_id: string;
  action: AuditAction;
  actor_id: string;
  change_summary: Record<string, any>;
  created_at: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export interface SuccessEnvelope<T> {
  data: T;
  meta?: Record<string, any>;
}

export interface ErrorDetails {
  code: string;
  message: string;
  details?: any;
  correlationId?: string;
}

export interface ErrorEnvelope {
  error: ErrorDetails;
}
