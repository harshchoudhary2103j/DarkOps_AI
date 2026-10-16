import { z } from 'zod';

export const MetricStatusEnum = z.enum([
  'AVAILABLE',
  'ZERO',
  'NOT_APPLICABLE',
  'INSUFFICIENT_DATA',
  'INVALID_EVENT_STREAM'
]);

export const MetricObjectiveEnum = z.enum([
  'HIGHER_IS_BETTER',
  'LOWER_IS_BETTER',
  'NEUTRAL'
]);

export const MetricValueSchema = z.object({
  metric_name: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
  formula_ref: z.string(),
  status: MetricStatusEnum,
  objective: MetricObjectiveEnum.default('NEUTRAL'),
  numerator: z.number().nullable().optional(),
  denominator: z.number().nullable().optional(),
  sample_count: z.number().nullable().optional(),
  mean: z.number().nullable().optional(),
  median: z.number().nullable().optional(),
  warnings: z.array(z.string()).default([])
});

export const CostConfigSchema = z.object({
  carrying_cost_per_unit_hour: z.number().nonnegative().default(0.002),
  stockout_penalty_per_unit: z.number().nonnegative().default(5.0),
  cost_per_purchase_order: z.number().nonnegative().default(25.0),
  unit_waste_cost: z.number().nonnegative().default(2.0),
  currency: z.string().default('USD')
});

export const EvaluationSummarySchema = z.object({
  evaluation_id: z.string(),
  run_id: z.string(),
  scenario_id: z.string(),
  seed: z.union([z.number(), z.string()]),
  status: z.string(),
  simulated_duration_seconds: z.number().nonnegative(),
  evaluator_version: z.string(),
  formula_version: z.string(),
  evaluated_at: z.string(),
  event_count: z.number().int().nonnegative(),
  policy_identifiers: z.array(z.string()),
  policy_config: z.record(z.any()),
  cost_config: z.record(z.any()),
  kpis: z.record(MetricValueSchema),
  data_quality_warnings: z.array(z.string()),
  disclaimer: z.string()
});

export const CompareRunsRequestSchema = z.object({
  baseline_run_id: z.string().min(1, 'baseline_run_id is required'),
  candidate_run_id: z.string().min(1, 'candidate_run_id is required'),
  cost_config_override: CostConfigSchema.partial().optional()
});

export const MetricComparisonSchema = z.object({
  metric_name: z.string(),
  unit: z.string(),
  baseline_value: z.number().nullable(),
  candidate_value: z.number().nullable(),
  baseline_status: MetricStatusEnum,
  candidate_status: MetricStatusEnum,
  absolute_difference: z.number().nullable().optional(),
  percentage_change: z.number().nullable().optional(),
  percentage_change_explanation: z.string().nullable().optional(),
  objective: MetricObjectiveEnum,
  is_improvement: z.boolean().nullable().optional(),
  improvement_status: z.enum(['IMPROVED', 'DEGRADED', 'UNCHANGED', 'INCOMPARABLE', 'CHANGED'])
});

export const ComparisonReportSchema = z.object({
  baseline_run_id: z.string(),
  candidate_run_id: z.string(),
  scenario_compatible: z.boolean(),
  duration_compatible: z.boolean(),
  cost_config_compatible: z.boolean(),
  policy_variation_detected: z.boolean(),
  comparisons: z.record(MetricComparisonSchema),
  compatibility_warnings: z.array(z.string()),
  disclaimer: z.string()
});

export type MetricValue = z.infer<typeof MetricValueSchema>;
export type CostConfig = z.infer<typeof CostConfigSchema>;
export type EvaluationSummary = z.infer<typeof EvaluationSummarySchema>;
export type CompareRunsRequest = z.infer<typeof CompareRunsRequestSchema>;
export type MetricComparison = z.infer<typeof MetricComparisonSchema>;
export type ComparisonReport = z.infer<typeof ComparisonReportSchema>;
