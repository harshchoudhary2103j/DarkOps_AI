import { z } from 'zod';

export const OrderLineInputSchema = z.object({
  sku_id: z.string().min(1, 'SKU ID is required'),
  quantity: z.number().int().positive('Quantity must be a positive integer')
});

export const CreateOrderSchema = z.object({
  customer_id: z.string().optional(),
  customer_latitude: z
    .number()
    .min(-90, 'Latitude must be >= -90')
    .max(90, 'Latitude must be <= 90'),
  customer_longitude: z
    .number()
    .min(-180, 'Longitude must be >= -180')
    .max(180, 'Longitude must be <= 180'),
  delivery_zone_id: z.string().optional(),
  lines: z
    .array(OrderLineInputSchema)
    .min(1, 'Order must contain at least one line')
    .refine(
      (lines) => {
        const skuSet = new Set(lines.map((l) => l.sku_id));
        return skuSet.size === lines.length;
      },
      { message: 'Duplicate SKUs in order lines are not permitted' }
    )
});

export const CancelOrderSchema = z.object({
  reason: z.string().max(255).optional()
});

export const StartPickingTaskSchema = z.object({
  picker_id: z.string().min(1, 'Picker ID is required').optional()
});

export const ConfirmPickItemSchema = z.object({
  picked_quantity: z
    .number()
    .int()
    .positive('Picked quantity must be a positive integer')
});

export const ReportPickExceptionSchema = z.object({
  exception_type: z.enum(['MISSING', 'DAMAGED']),
  quantity: z
    .number()
    .int()
    .positive('Exception quantity must be a positive integer'),
  reason: z.string().max(255).optional()
});

export const FailPickingTaskSchema = z.object({
  reason: z.string().min(1, 'Failure reason is required').max(255)
});

export const ListOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum([
      'CREATED',
      'ALLOCATION_PENDING',
      'ALLOCATED',
      'PICKING',
      'PICKED',
      'READY',
      'CANCELLED',
      'FAILED'
    ])
    .optional(),
  store_id: z.string().optional(),
  customer_id: z.string().optional()
});

export const ListPickingTasksQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED']).optional(),
  store_id: z.string().optional(),
  assigned_picker_id: z.string().optional()
});
