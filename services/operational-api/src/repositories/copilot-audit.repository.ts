// ============================================================================
// File: src/repositories/copilot-audit.repository.ts
// Description: Immutable persistence for AI Copilot tool calls & decision logs.
// ============================================================================

import { pool } from '../database/db';
import { CopilotAuditEvent } from '../copilot/copilot.types';

export class CopilotAuditRepository {
  async record(event: CopilotAuditEvent): Promise<void> {
    const sql = `
      INSERT INTO copilot_audit_events (
        id, correlation_id, actor_id, tool_name, parameters, outcome, execution_result, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    await pool.query(sql, [
      event.id,
      event.correlation_id || null,
      event.actor_id,
      event.tool_name,
      JSON.stringify(event.parameters || {}),
      event.outcome,
      event.execution_result ? JSON.stringify(event.execution_result) : null,
      event.created_at
    ]);
  }

  async listRecent(limit: number = 50): Promise<CopilotAuditEvent[]> {
    const sql = `
      SELECT id, correlation_id, actor_id, tool_name, parameters, outcome, execution_result, created_at
      FROM copilot_audit_events
      ORDER BY created_at DESC
      LIMIT $1
    `;
    const { rows } = await pool.query(sql, [limit]);
    return rows;
  }
}

export const copilotAuditRepository = new CopilotAuditRepository();
