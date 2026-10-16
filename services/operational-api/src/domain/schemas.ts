import { z } from 'zod';

// Coordinate Pair: [longitude, latitude]
export const CoordinatePairSchema = z.tuple([
  z.number().min(-180, 'Longitude must be >= -180').max(180, 'Longitude must be <= 180'),
  z.number().min(-90, 'Latitude must be >= -90').max(90, 'Latitude must be <= 90')
]);

// Linear Ring: At least 4 points, first and last point must be identical
export const LinearRingSchema = z.array(CoordinatePairSchema)
  .min(4, 'A polygon ring must have at least 4 coordinates (closed ring)')
  .refine(
    (pts) => {
      const first = pts[0];
      const last = pts[pts.length - 1];
      return Math.abs(first[0] - last[0]) < 1e-7 && Math.abs(first[1] - last[1]) < 1e-7;
    },
    { message: 'First and last coordinates of a polygon ring must be identical to close the boundary' }
  );

// GeoJSON Polygon
export const GeoJSONPolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(LinearRingSchema).min(1, 'Polygon must have at least one linear ring')
}).strict();

// -----------------------------------------------------------------------------
// Store Schemas
// -----------------------------------------------------------------------------
export const StoreStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE']);

export const CreateStoreSchema = z.object({
  id: z.string().min(1, 'Store ID is required').max(64),
  name: z.string().min(2, 'Name must be at least 2 characters').max(255),
  status: StoreStatusSchema.default('ACTIVE'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  service_area: GeoJSONPolygonSchema
}).strict();

export const UpdateStoreSchema = CreateStoreSchema.partial().omit({ id: true }).strict();

// -----------------------------------------------------------------------------
// Service Zone Schemas
// -----------------------------------------------------------------------------
export const ServiceZoneStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

export const CreateServiceZoneSchema = z.object({
  id: z.string().min(1, 'Zone ID is required').max(64),
  store_id: z.string().min(1, 'Store ID reference is required').max(64),
  name: z.string().min(2, 'Name must be at least 2 characters').max(255),
  boundary: GeoJSONPolygonSchema,
  status: ServiceZoneStatusSchema.default('ACTIVE')
}).strict();

export const UpdateServiceZoneSchema = CreateServiceZoneSchema.partial().omit({ id: true }).strict();

// -----------------------------------------------------------------------------
// Product Schemas
// -----------------------------------------------------------------------------
export const ProductStatusSchema = z.enum(['ACTIVE', 'DISCONTINUED']);

export const CreateProductSchema = z.object({
  id: z.string().min(1, 'Product ID is required').max(64),
  name: z.string().min(2, 'Product name must be at least 2 characters').max(255),
  category: z.string().min(2, 'Category is required').max(100),
  description: z.string().max(1000).nullable().optional(),
  status: ProductStatusSchema.default('ACTIVE')
}).strict();

export const UpdateProductSchema = CreateProductSchema.partial().omit({ id: true }).strict();

// -----------------------------------------------------------------------------
// SKU Schemas
// -----------------------------------------------------------------------------
export const SKUStatusSchema = z.enum(['ACTIVE', 'DISCONTINUED']);

export const StorageTempSchema = z.object({
  unit: z.enum(['CELSIUS', 'FAHRENHEIT']).default('CELSIUS'),
  min: z.number(),
  max: z.number(),
  zone: z.enum(['AMBIENT', 'CHILLED', 'FROZEN']).optional()
}).refine(data => data.min <= data.max, {
  message: 'Minimum storage temperature must be less than or equal to maximum storage temperature',
  path: ['min']
});

export const CreateSKUSchema = z.object({
  id: z.string().min(1, 'SKU ID is required').max(64),
  product_id: z.string().min(1, 'Product ID reference is required').max(64),
  sku_code: z.string().min(2, 'SKU code must be at least 2 characters').max(100),
  pack_size: z.number().int().positive('Pack size must be a positive integer'),
  shelf_life_days: z.number().int().positive('Shelf life must be a positive integer of days'),
  storage_temp: StorageTempSchema,
  unit_price: z.number().min(0, 'Unit price cannot be negative')
    .refine(val => Math.round(val * 100) === val * 100, {
      message: 'Unit price must not exceed 2 decimal places'
    }),
  currency: z.string().length(3, 'Currency must be a 3-character ISO code').default('USD'),
  status: SKUStatusSchema.default('ACTIVE')
}).strict();

export const UpdateSKUSchema = CreateSKUSchema.partial().omit({ id: true, sku_code: true }).strict();

// -----------------------------------------------------------------------------
// Supplier Schemas
// -----------------------------------------------------------------------------
export const SupplierStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

export const ReviewScheduleSchema = z.object({
  cadence: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']),
  review_time_utc: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:MM format').optional(),
  days_of_week: z.array(z.number().int().min(0).max(6)).optional(),
  cron_expression: z.string().optional()
});

export const CreateSupplierSchema = z.object({
  id: z.string().min(1, 'Supplier ID is required').max(64),
  name: z.string().min(2).max(255),
  default_lead_time_hours: z.number().int().positive('Lead time must be positive hours'),
  default_moq: z.number().int().positive('MOQ must be a positive integer'),
  review_schedule: ReviewScheduleSchema,
  status: SupplierStatusSchema.default('ACTIVE')
}).strict();

export const UpdateSupplierSchema = CreateSupplierSchema.partial().omit({ id: true }).strict();

export const CreateSupplierSKUSchema = z.object({
  supplier_id: z.string().min(1).max(64),
  sku_id: z.string().min(1).max(64),
  supplier_sku_code: z.string().max(100).nullable().optional(),
  lead_time_hours: z.number().int().positive('Lead time must be positive hours'),
  moq: z.number().int().positive('MOQ must be a positive integer'),
  unit_cost: z.number().min(0, 'Unit cost cannot be negative'),
  is_primary: z.boolean().default(false)
}).strict();

// -----------------------------------------------------------------------------
// Warehouse Layout Schemas
// -----------------------------------------------------------------------------
export const WarehouseLayoutStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);
export const WarehouseNodeTypeSchema = z.enum(['DISPATCH_STATION', 'AISLE', 'SHELF', 'PICK_ZONE']);

export const WarehouseNodeSchema = z.object({
  id: z.string().min(1, 'Node ID is required').max(64),
  type: WarehouseNodeTypeSchema,
  aisle_id: z.string().max(64).nullable().optional(),
  shelf_id: z.string().max(64).nullable().optional(),
  x: z.number(),
  y: z.number(),
  z: z.number().default(0)
}).strict();

export const WarehouseEdgeSchema = z.object({
  from_node: z.string().min(1).max(64),
  to_node: z.string().min(1).max(64),
  distance: z.number().positive('Edge distance must be greater than 0 meters'),
  bidirectional: z.boolean().default(true)
}).strict();

export const CreateWarehouseLayoutSchema = z.object({
  id: z.string().min(1, 'Layout ID is required').max(64),
  store_id: z.string().min(1, 'Store reference is required').max(64),
  name: z.string().min(2).max(255),
  version: z.number().int().positive('Version must be a positive integer'),
  status: WarehouseLayoutStatusSchema.default('DRAFT'),
  nodes: z.array(WarehouseNodeSchema).min(2, 'Layout must contain at least 2 nodes'),
  edges: z.array(WarehouseEdgeSchema).min(1, 'Layout must contain at least 1 edge')
}).strict();

export const UpdateWarehouseLayoutSchema = CreateWarehouseLayoutSchema.partial().omit({ id: true, store_id: true, version: true }).strict();

// -----------------------------------------------------------------------------
// Query & Path Param Schemas
// -----------------------------------------------------------------------------
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const EntityIdParamSchema = z.object({
  id: z.string().min(1).max(64)
});
