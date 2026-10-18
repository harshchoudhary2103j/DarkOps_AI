-- ============================================================================
-- Migration: 006_copilot_schema.sql
-- Description: AI Operations Copilot audit ledger and two-stage action proposals.
-- ============================================================================

-- 1. COPILOT AUDIT EVENTS TABLE (Immutable tool-call log)
CREATE TABLE IF NOT EXISTS copilot_audit_events (
    id VARCHAR(64) PRIMARY KEY,
    correlation_id VARCHAR(64),
    actor_id VARCHAR(64) NOT NULL DEFAULT 'operator',
    tool_name VARCHAR(128) NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}',
    outcome VARCHAR(32) NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILURE', 'PROPOSED', 'APPROVED', 'REJECTED')),
    execution_result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_audit_tool ON copilot_audit_events (tool_name);
CREATE INDEX IF NOT EXISTS idx_copilot_audit_actor ON copilot_audit_events (actor_id);
CREATE INDEX IF NOT EXISTS idx_copilot_audit_created_at ON copilot_audit_events (created_at DESC);

-- 2. COPILOT ACTION PROPOSALS TABLE (Two-stage human approval workflow)
CREATE TABLE IF NOT EXISTS copilot_action_proposals (
    id VARCHAR(64) PRIMARY KEY,
    action_type VARCHAR(64) NOT NULL CHECK (action_type IN ('EMERGENCY_RESTOCK', 'APPROVE_REPLENISHMENT', 'LAUNCH_SURGE_TRAFFIC', 'REALLOCATE_ORDER')),
    tool_name VARCHAR(128) NOT NULL,
    target_entity_type VARCHAR(64),
    target_entity_id VARCHAR(64),
    parameters JSONB NOT NULL,
    projected_impact JSONB NOT NULL,
    rationale TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTED', 'EXPIRED')),
    proposed_by VARCHAR(64) NOT NULL DEFAULT 'copilot',
    decided_by VARCHAR(64),
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_proposals_status ON copilot_action_proposals (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copilot_proposals_entity ON copilot_action_proposals (target_entity_type, target_entity_id);
