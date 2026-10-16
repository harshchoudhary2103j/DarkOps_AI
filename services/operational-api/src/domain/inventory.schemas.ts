import { z } from 'zod';

export const IdempotencyKeyHeaderSchema = z.string({
  required_error: 'Idempotency-Key header is required for this operation',
  invalid_type_error: 'Idempotency-Key header must be a string'
})
  .min(1, 'Idempotency-Key header cannot be empty')
  .max(255, 'Idempotency-Key exceeds maximum length of 255 characters');

export const InitializeInventorySchema = z.object({
  store_id: z.string().min(1, 'Store ID is required').max(64),
  sku_id: z.string().min(1, 'SKU ID is required').max(64),
  initial_physical_on_hand: z.number().int().min(0, 'Physical on-hand must be a non-negative integer'),
  initial_reserved_stock: z.number().int().min(0, 'Reserved stock must be a non-negative integer').default(0),
  initial_incoming_units: z.number().int().min(0, 'Incoming units must be a non-negative integer').default(0),
  reason: z.string().max(255).optional().default('Initial stock opening balance')
}).strict().refine(
  data => data.initial_reserved_stock <= data.initial_physical_on_hand,
  {
    message: 'Initial reserved stock cannot exceed initial physical on-hand',
    path: ['initial_reserved_stock']
  }
);

export const ReceiveStockSchema = z.object({
  store_id: z.string().min(1, 'Store ID is required').max(64),
  sku_id: z.string().min(1, 'SKU ID is required').max(64),
  quantity: z.number().int().positive('Received quantity must be a positive integer'),
  decrease_incoming: z.boolean().default(true),
  reason: z.string().max(255).optional().default('Supplier shipment receipt')
}).strict();

export const AdjustStockSchema = z.object({
  store_id: z.string().min(1, 'Store ID is required').max(64),
  sku_id: z.string().min(1, 'SKU ID is required').max(64),
  quantity: z.number().int().positive('Adjustment quantity must be a positive integer'),
  adjustment_type: z.enum(['POSITIVE', 'NEGATIVE']),
  reason: z.string().min(3, 'A valid reason of at least 3 characters is required for adjustments').max(255)
}).strict();

export const ReserveStockSchema = z.object({
  store_id: z.string().min(1, 'Store ID is required').max(64),
  sku_id: z.string().min(1, 'SKU ID is required').max(64),
  quantity: z.number().int().positive('Reservation quantity must be a positive integer'),
  external_reference: z.string().max(255).optional(),
  expires_in_minutes: z.number().int().positive('Expiry minutes must be a positive integer').optional()
}).strict();

export const ReleaseReservationSchema = z.object({
  reservation_id: z.string().min(1, 'Reservation ID is required').max(64),
  quantity: z.number().int().positive('Release quantity must be a positive integer').optional(),
  reason: z.string().max(255).optional().default('Reservation released')
}).strict();

export const ConsumeReservationSchema = z.object({
  reservation_id: z.string().min(1, 'Reservation ID is required').max(64),
  quantity: z.number().int().positive('Consumption quantity must be a positive integer').optional(),
  reason: z.string().max(255).optional().default('Picking verified consumption')
}).strict();

export const GenerateRecommendationsSchema = z.object({
  store_id: z.string().min(1, 'Store ID is required').max(64),
  safety_stock_factor: z.number().min(0).default(1.5),
  lead_time_buffer_hours: z.number().min(0).default(24)
}).strict();

export const DecisionRecommendationSchema = z.object({
  reason: z.string().max(500).optional()
}).strict();

export const InventoryQuerySchema = z.object({
  store_id: z.string().max(64).optional(),
  sku_id: z.string().max(64).optional(),
  low_stock_only: z.coerce.boolean().optional().default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const MovementQuerySchema = z.object({
  store_id: z.string().max(64).optional(),
  sku_id: z.string().max(64).optional(),
  movement_type: z.enum([
    'OPENING_STOCK',
    'RECEIPT',
    'POSITIVE_ADJUSTMENT',
    'NEGATIVE_ADJUSTMENT',
    'RESERVATION',
    'RESERVATION_RELEASE',
    'PICK_CONSUMPTION'
  ]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});
