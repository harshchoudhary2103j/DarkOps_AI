import { ScenarioExperimentConfig } from '../types';

export const DEFAULT_EXPERIMENT_CONFIG: ScenarioExperimentConfig = {
  scenario_id: 'manhattan-demo',
  duration_hours: 12.0,
  seed: 101,
  policy_mode: 'paired',
  demand_rate_multiplier: 1.0,
  surge_multiplier: 1.0,
  supplier_lead_time_min_hours: 12,
  supplier_lead_time_max_hours: 48,
  baseline_policy_identifier: 'baseline_policies_v1',
  candidate_policy_identifier: 'optimized_policies_v1'
};

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export function validateExperimentConfig(config: ScenarioExperimentConfig): ValidationResult {
  const errors: Record<string, string> = {};

  // 1. Scenario selection
  if (!config.scenario_id || config.scenario_id.trim() === '') {
    errors.scenario_id = 'A scenario template must be selected.';
  }

  // 2. Duration bounds (0.1 to 168 hours)
  if (isNaN(config.duration_hours) || config.duration_hours <= 0) {
    errors.duration_hours = 'Simulation duration must be a positive number of hours.';
  } else if (config.duration_hours > 168) {
    errors.duration_hours = 'Simulation duration cannot exceed 168 hours (7 days).';
  } else if (config.duration_hours < 0.1) {
    errors.duration_hours = 'Simulation duration must be at least 0.1 hours (6 minutes).';
  }

  // 3. Seed validation (non-negative integer)
  if (isNaN(config.seed) || !Number.isInteger(config.seed)) {
    errors.seed = 'Random seed must be a valid whole integer.';
  } else if (config.seed < 0) {
    errors.seed = 'Random seed must be non-negative (>= 0).';
  } else if (config.seed > 2147483647) {
    errors.seed = 'Random seed cannot exceed 2,147,483,647.';
  }

  // 4. Demand rates & surge multipliers
  if (isNaN(config.demand_rate_multiplier) || config.demand_rate_multiplier <= 0) {
    errors.demand_rate_multiplier = 'Demand arrival rate multiplier must be greater than zero.';
  } else if (config.demand_rate_multiplier > 10.0) {
    errors.demand_rate_multiplier = 'Demand arrival rate multiplier cannot exceed 10x.';
  }

  if (isNaN(config.surge_multiplier) || config.surge_multiplier <= 0) {
    errors.surge_multiplier = 'Surge multiplier must be positive.';
  } else if (config.surge_multiplier > 5.0) {
    errors.surge_multiplier = 'Surge multiplier cannot exceed 5.0x.';
  }

  // 5. Supplier lead-time constraints
  if (isNaN(config.supplier_lead_time_min_hours) || config.supplier_lead_time_min_hours < 1) {
    errors.supplier_lead_time_min_hours = 'Minimum supplier lead time must be at least 1 hour.';
  }

  if (isNaN(config.supplier_lead_time_max_hours) || config.supplier_lead_time_max_hours < 1) {
    errors.supplier_lead_time_max_hours = 'Maximum supplier lead time must be at least 1 hour.';
  } else if (config.supplier_lead_time_max_hours < config.supplier_lead_time_min_hours) {
    errors.supplier_lead_time_max_hours = 'Maximum lead time must be greater than or equal to minimum lead time.';
  } else if (config.supplier_lead_time_max_hours > 336) {
    errors.supplier_lead_time_max_hours = 'Maximum supplier lead time cannot exceed 336 hours (14 days).';
  }

  // 6. Policy selection
  if (config.policy_mode === 'paired') {
    if (!config.baseline_policy_identifier) {
      errors.baseline_policy_identifier = 'Baseline policy must be identified.';
    }
    if (!config.candidate_policy_identifier) {
      errors.candidate_policy_identifier = 'Candidate policy must be identified.';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}
