-- ============================================================================
-- Migration: 005_evaluation_schema.sql
-- Description: Standardized simulation evaluation summaries, versioned KPI
--              persistence, and experiment comparison models.
-- ============================================================================

CREATE TABLE IF NOT EXISTS simulation_evaluations (
  id VARCHAR(64) PRIMARY KEY,
  run_id VARCHAR(64) NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
  scenario_id VARCHAR(64) NOT NULL,
  seed BIGINT NOT NULL,
  evaluator_version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
  formula_version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
  status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN (
    'COMPLETED',
    'PARTIAL',
    'FAILED'
  )),
  simulated_duration_seconds DOUBLE PRECISION NOT NULL,
  cost_config JSONB NOT NULL DEFAULT '{}',
  policy_config JSONB NOT NULL DEFAULT '{}',
  kpis JSONB NOT NULL DEFAULT '{}',
  summary JSONB NOT NULL DEFAULT '{}',
  data_quality_warnings JSONB NOT NULL DEFAULT '[]',
  disclaimer TEXT NOT NULL DEFAULT 'Simulated outcomes derived from synthetic scenarios — not verified real-world results.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sim_eval_run_version UNIQUE (run_id, evaluator_version, formula_version)
);

CREATE INDEX IF NOT EXISTS idx_sim_eval_run_id ON simulation_evaluations(run_id);
CREATE INDEX IF NOT EXISTS idx_sim_eval_scenario ON simulation_evaluations(scenario_id);
CREATE INDEX IF NOT EXISTS idx_sim_eval_created_at ON simulation_evaluations(created_at DESC);
