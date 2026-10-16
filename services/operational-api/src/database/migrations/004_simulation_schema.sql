-- ============================================================================
-- Migration: 004_simulation_schema.sql
-- Description: Simulation runs, run-scoped event persistence, and execution
--              lifecycle tracking.
-- ============================================================================

-- 1. SIMULATION RUNS TABLE
CREATE TABLE IF NOT EXISTS simulation_runs (
  id VARCHAR(64) PRIMARY KEY,
  scenario_id VARCHAR(64) NOT NULL,
  seed BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'QUEUED' CHECK (status IN (
    'QUEUED',
    'RUNNING',
    'PAUSED',
    'SUCCEEDED',
    'FAILED',
    'CANCELLED'
  )),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  current_virtual_time TIMESTAMPTZ NOT NULL,
  event_count INT NOT NULL DEFAULT 0,
  config_snapshot JSONB NOT NULL DEFAULT '{}',
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sim_runs_status ON simulation_runs(status);
CREATE INDEX IF NOT EXISTS idx_sim_runs_scenario ON simulation_runs(scenario_id);
CREATE INDEX IF NOT EXISTS idx_sim_runs_created_at ON simulation_runs(created_at DESC);

-- 2. SIMULATION EVENTS TABLE
CREATE TABLE IF NOT EXISTS simulation_events (
  id VARCHAR(64) PRIMARY KEY,
  run_id VARCHAR(64) NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
  sequence_number INT NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  virtual_timestamp TIMESTAMPTZ NOT NULL,
  priority INT NOT NULL DEFAULT 5,
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(32) NOT NULL DEFAULT 'PROCESSED' CHECK (status IN (
    'SCHEDULED',
    'PROCESSED',
    'FAILED'
  )),
  error_message TEXT,
  causation_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sim_events_run_seq UNIQUE (run_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_sim_events_run_time ON simulation_events(run_id, virtual_timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_sim_events_type ON simulation_events(run_id, event_type);
