import { z } from 'zod';

export const SurgeOrderBasketItemSchema = z.object({
  sku_id: z.string(),
  sku_name: z.string().optional(),
  quantity: z.number().int().positive()
});

export const SurgeStoreStateSchema = z.object({
  store_id: z.string(),
  store_name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  active_queue: z.number().int().nonnegative().default(0),
  picker_count: z.number().int().positive().default(2),
  inventory: z.record(z.string(), z.number().int().nonnegative()),
  total_units_consumed: z.number().int().nonnegative().optional().default(0)
});

export const EvaluateSurgeOrderRequestSchema = z.object({
  order: z.object({
    id: z.string(),
    customer_name: z.string(),
    customer_latitude: z.number(),
    customer_longitude: z.number(),
    items: z.array(SurgeOrderBasketItemSchema).min(1),
    virtual_timestamp_seconds: z.number().nonnegative().default(0)
  }),
  stores: z.array(SurgeStoreStateSchema).min(1),
  elapsed_virtual_minutes: z.number().positive().default(1.0),
  persist_to_db: z.boolean().default(true).optional()
});

export const AllocationEvaluationResultSchema = z.object({
  store_id: z.string(),
  store_name: z.string(),
  travel_distance_km: z.number(),
  travel_minutes: z.number(),
  queue_wait_minutes: z.number(),
  stockout_penalty_minutes: z.number(),
  total_turnaround_minutes: z.number(),
  has_stockout: z.boolean(),
  missing_items: z.array(z.string()),
  rationale: z.string()
});

export const StoreReplenishmentAdvisorySchema = z.object({
  store_id: z.string(),
  store_name: z.string(),
  current_total_stock: z.number(),
  burn_rate_units_per_min: z.number(),
  stock_runway_minutes: z.number(),
  is_critical_runway: z.boolean(),
  emergency_restock_recommended: z.boolean(),
  recommended_restock_units: z.number()
});

export const EvaluateSurgeOrderResponseSchema = z.object({
  naive_allocation: AllocationEvaluationResultSchema,
  smart_allocation: AllocationEvaluationResultSchema,
  time_saved_minutes: z.number(),
  distance_saved_km: z.number(),
  stockout_averted: z.boolean(),
  persisted_order_id: z.string().optional(),
  replenishment_advisories: z.array(StoreReplenishmentAdvisorySchema)
});

export const EmergencySurgeRestockRequestSchema = z.object({
  store_id: z.string(),
  quantity: z.number().int().positive().default(50)
});

export type SurgeOrderBasketItem = z.infer<typeof SurgeOrderBasketItemSchema>;
export type SurgeStoreState = z.infer<typeof SurgeStoreStateSchema>;
export type EvaluateSurgeOrderRequest = z.infer<typeof EvaluateSurgeOrderRequestSchema>;
export type AllocationEvaluationResult = z.infer<typeof AllocationEvaluationResultSchema>;
export type StoreReplenishmentAdvisory = z.infer<typeof StoreReplenishmentAdvisorySchema>;
export type EvaluateSurgeOrderResponse = z.infer<typeof EvaluateSurgeOrderResponseSchema>;
export type EmergencySurgeRestockRequest = z.infer<typeof EmergencySurgeRestockRequestSchema>;
