import { PoolClient } from 'pg';
import { pool } from '../database/db';
import { AllocationWorkflowRecord } from '../domain/order.types';

export class AllocationWorkflowRepository {
  async create(record: AllocationWorkflowRecord, client?: PoolClient): Promise<AllocationWorkflowRecord> {
    const q = client || pool;
    const sql = `
      INSERT INTO allocation_workflows (
        id, order_id, candidate_store_id, status, reserved_lines, error_message, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const { rows } = await q.query(sql, [
      record.id,
      record.order_id,
      record.candidate_store_id || null,
      record.status,
      JSON.stringify(record.reserved_lines || []),
      record.error_message || null,
      record.created_at || new Date().toISOString(),
      record.updated_at || new Date().toISOString()
    ]);
    return this.mapRow(rows[0]);
  }

  async update(record: AllocationWorkflowRecord, client?: PoolClient): Promise<AllocationWorkflowRecord> {
    const q = client || pool;
    const sql = `
      UPDATE allocation_workflows
      SET
        candidate_store_id = $2,
        status = $3,
        reserved_lines = $4,
        error_message = $5,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const { rows } = await q.query(sql, [
      record.id,
      record.candidate_store_id || null,
      record.status,
      JSON.stringify(record.reserved_lines || []),
      record.error_message || null
    ]);
    return this.mapRow(rows[0]);
  }

  async findByOrderId(orderId: string, client?: PoolClient): Promise<AllocationWorkflowRecord | null> {
    const q = client || pool;
    const sql = `
      SELECT *
      FROM allocation_workflows
      WHERE order_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const { rows } = await q.query(sql, [orderId]);
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  private mapRow(r: any): AllocationWorkflowRecord {
    return {
      id: r.id,
      order_id: r.order_id,
      candidate_store_id: r.candidate_store_id,
      status: r.status,
      reserved_lines: typeof r.reserved_lines === 'string' ? JSON.parse(r.reserved_lines) : r.reserved_lines,
      error_message: r.error_message,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at
    };
  }
}

export const allocationWorkflowRepository = new AllocationWorkflowRepository();
