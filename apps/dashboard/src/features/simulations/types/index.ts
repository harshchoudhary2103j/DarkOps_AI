import {
  SimulationRun,
  SimulationEvent,
  EvaluationSummary,
  ComparisonReport,
} from '../../../types/domain';

export type PolicyMode = 'baseline' | 'optimized' | 'paired';

export interface ScenarioExperimentConfig {
  scenario_id: string;
  duration_hours: number;
  seed: number;
  policy_mode: PolicyMode;
  demand_rate_multiplier: number;
  surge_multiplier: number;
  supplier_lead_time_min_hours: number;
  supplier_lead_time_max_hours: number;
  baseline_policy_identifier: string;
  candidate_policy_identifier: string;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface FairComparisonCheck {
  isFair: boolean;
  reasons: string[];
  warnings: string[];
}

export interface SimulationReportExportData {
  report_version: string;
  exported_at: string;
  run: SimulationRun;
  paired_candidate_run?: SimulationRun | null;
  evaluation?: EvaluationSummary | null;
  comparison?: ComparisonReport | null;
  events: SimulationEvent[];
  events_complete: boolean;
  total_events_in_run: number;
  disclaimer: string;
}
