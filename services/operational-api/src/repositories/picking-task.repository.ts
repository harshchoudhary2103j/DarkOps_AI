import { PoolClient } from 'pg';
import { pool } from '../database/db';
import { PickingTask } from '../domain/order.types';
import { PaginatedResult } from '../domain/types';

export class PickingTaskRepository {
  async create(task: PickingTask, client?: PoolClient): Promise<PickingTask> {
    const q = client || pool;
    const sql = `
      INSERT INTO picking_tasks (
        id, order_id, store_id, status, assigned_picker_id,
        version, started_at, completed_at, failure_reason, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    const { rows } = await q.query(sql, [
      task.id,
      task.order_id,
      task.store_id,
      task.status || 'PENDING',
      task.assigned_picker_id || null,
      task.version || 1,
      task.started_at || null,
      task.completed_at || null,
      task.failure_reason || null,
      task.created_at || new Date().toISOString(),
      task.updated_at || new Date().toISOString()
    ]);
    return this.mapRow(rows[0]);
  }

  async findById(id: string, client?: PoolClient): Promise<PickingTask | null> {
    const q = client || pool;
    const sql = `SELECT * FROM picking_tasks WHERE id = $1`;
    const { rows } = await q.query(sql, [id]);
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async findByIdForUpdate(id: string, client: PoolClient): Promise<PickingTask | null> {
    const sql = `SELECT * FROM picking_tasks WHERE id = $1 FOR UPDATE`;
    const { rows } = await client.query(sql, [id]);
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async findByOrderId(orderId: string, client?: PoolClient): Promise<PickingTask | null> {
    const q = client || pool;
    const sql = `SELECT * FROM picking_tasks WHERE order_id = $1`;
    const { rows } = await q.query(sql, [orderId]);
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async update(task: PickingTask, client?: PoolClient): Promise<PickingTask> {
    const q = client || pool;
    const sql = `
      UPDATE picking_tasks
      SET
        status = $2,
        assigned_picker_id = $3,
        version = version + 1,
        started_at = $4,
        completed_at = $5,
        failure_reason = $6,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const { rows } = await q.query(sql, [
      task.id,
      task.status,
      task.assigned_picker_id || null,
      task.started_at || null,
      task.completed_at || null,
      task.failure_reason || null
    ]);
    return this.mapRow(rows[0]);
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    status?: string;
    store_id?: string;
    assigned_picker_id?: string;
  }): Promise<PaginatedResult<PickingTask>> {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (params.status) {
      conditions.push(`status = $${idx++}`);
      values.push(params.status);
    }
    if (params.store_id) {
      conditions.push(`store_id = $${idx++}`);
      values.push(params.store_id);
    }
    if (params.assigned_picker_id) {
      conditions.push(`assigned_picker_id = $${idx++}`);
      values.push(params.assigned_picker_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) AS total FROM picking_tasks ${whereClause}`;
    const countRes = await pool.query(countSql, values);
    const total = parseInt(countRes.rows[0].total, 10);

    const dataSql = `
      SELECT *
      FROM picking_tasks
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    const { rows } = await pool.query(dataSql, [...values, limit, offset]);

    return {
      data: rows.map(this.mapRow),
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit) || 1
      }
    };
  }

  private mapRow(r: any): PickingTask {
    return {
      id: r.id,
      order_id: r.order_id,
      store_id: r.store_id,
      status: r.status,
      assigned_picker_id: r.assigned_picker_id,
      version: parseInt(r.version, 10),
      started_at: r.started_at instanceof Date ? r.started_at.toISOString() : r.started_at,
      completed_at: r.completed_at instanceof Date ? r.completed_at.toISOString() : r.completed_at,
      failure_reason: r.failure_reason,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at
    };
  }
}

export const pickingTaskRepository = new PickingTaskRepository();
