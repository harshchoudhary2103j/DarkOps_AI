import { z } from 'zod';

export const SimulationRunStatusEnum = z.enum([
  'QUEUED',
  'RUNNING',
  'PAUSED',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED'
]);

export const SimulationEventStatusEnum = z.enum([
  'SCHEDULED',
  'PROCESSED',
  'FAILED'
]);

export const CreateSimulationRunRequestSchema = z.object({
  scenario_id: z.string().min(1, 'scenario_id is required').default('manhattan-demo'),
  seed: z.number().int().min(0, 'seed must be a non-negative integer').default(101),
  duration_hours: z.number().positive('duration_hours must be positive').max(168, 'duration cannot exceed 168 hours (7 days)').default(12.0),
  policy_identifier: z.string().default('baseline_policies_v1'),
  policy_config: z.record(z.any()).optional().default({}),
  demand_config: z.object({
    base_hourly_rate: z.number().nonnegative().optional(),
    surge_multiplier: z.number().positive().optional(),
    min_basket_size: z.number().int().positive().optional(),
    max_basket_size: z.number().int().positive().optional()
  }).optional(),
  supplier_lead_time_min_hours: z.number().positive().optional(),
  supplier_lead_time_max_hours: z.number().positive().optional(),
  scenario_config_override: z.record(z.any()).optional()
});

export const SimulationRunSchema = z.object({
  id: z.string(),
  scenario_id: z.string(),
  seed: z.union([z.number(), z.string()]),
  status: SimulationRunStatusEnum,
  start_time: z.string(),
  end_time: z.string(),
  current_virtual_time: z.string(),
  event_count: z.number().int().nonnegative(),
  config_snapshot: z.record(z.any()),
  failure_reason: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string()
});

export const SimulationEventSchema = z.object({
  id: z.string(),
  run_id: z.string(),
  sequence_number: z.number().int().nonnegative(),
  event_type: z.string(),
  virtual_timestamp: z.string(),
  priority: z.number().int(),
  payload: z.record(z.any()),
  status: SimulationEventStatusEnum,
  error_message: z.string().nullable().optional(),
  causation_id: z.string().nullable().optional(),
  created_at: z.string()
});

export const GetSimulationEventsQuerySchema = z.object({
  event_type: z.string().optional(),
  search: z.string().optional(),
  after_sequence_number: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(500).default(50),
  offset: z.coerce.number().int().nonnegative().default(0)
});

export const ListSimulationRunsQuerySchema = z.object({
  scenario_id: z.string().optional(),
  status: SimulationRunStatusEnum.optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0)
});

export type CreateSimulationRunRequest = z.infer<typeof CreateSimulationRunRequestSchema>;
export type SimulationRun = z.infer<typeof SimulationRunSchema>;
export type SimulationEvent = z.infer<typeof SimulationEventSchema>;
export type GetSimulationEventsQuery = z.infer<typeof GetSimulationEventsQuerySchema>;
export type ListSimulationRunsQuery = z.infer<typeof ListSimulationRunsQuerySchema>;
