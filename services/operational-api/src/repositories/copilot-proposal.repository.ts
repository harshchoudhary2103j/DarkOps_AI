// ============================================================================
// File: src/repositories/copilot-proposal.repository.ts
// Description: Repository for two-stage approval action proposals.
// ============================================================================

import { pool } from '../database/db';
import { CopilotActionProposal, CopilotProposalStatus } from '../copilot/copilot.types';

export class CopilotProposalRepository {
  async create(proposal: CopilotActionProposal): Promise<CopilotActionProposal> {
    const sql = `
      INSERT INTO copilot_action_proposals (
        id, action_type, tool_name, target_entity_type, target_entity_id,
        parameters, projected_impact, rationale, status, proposed_by,
        decided_by, decided_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
    const { rows } = await pool.query(sql, [
      proposal.id,
      proposal.action_type,
      proposal.tool_name,
      proposal.target_entity_type || null,
      proposal.target_entity_id || null,
      JSON.stringify(proposal.parameters),
      JSON.stringify(proposal.projected_impact),
      proposal.rationale,
      proposal.status,
      proposal.proposed_by,
      proposal.decided_by || null,
      proposal.decided_at || null,
      proposal.created_at,
      proposal.updated_at
    ]);
    return rows[0];
  }

  async findById(id: string): Promise<CopilotActionProposal | null> {
    const sql = `
      SELECT id, action_type, tool_name, target_entity_type, target_entity_id,
             parameters, projected_impact, rationale, status, proposed_by,
             decided_by, decided_at, created_at, updated_at
      FROM copilot_action_proposals
      WHERE id = $1
    `;
    const { rows } = await pool.query(sql, [id]);
    return rows[0] || null;
  }

  async updateStatus(
    id: string,
    status: CopilotProposalStatus,
    decidedBy: string,
    decidedAt: string
  ): Promise<CopilotActionProposal> {
    const sql = `
      UPDATE copilot_action_proposals
      SET status = $2,
          decided_by = $3,
          decided_at = $4,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const { rows } = await pool.query(sql, [id, status, decidedBy, decidedAt]);
    if (rows.length === 0) {
      throw new Error(`Proposal '${id}' not found`);
    }
    return rows[0];
  }

  async listRecent(limit: number = 20): Promise<CopilotActionProposal[]> {
    const sql = `
      SELECT id, action_type, tool_name, target_entity_type, target_entity_id,
             parameters, projected_impact, rationale, status, proposed_by,
             decided_by, decided_at, created_at, updated_at
      FROM copilot_action_proposals
      ORDER BY created_at DESC
      LIMIT $1
    `;
    const { rows } = await pool.query(sql, [limit]);
    return rows;
  }
}

export const copilotProposalRepository = new CopilotProposalRepository();
