import { PoolClient } from 'pg';
import { pool } from '../database/db';
import { ReplenishmentRecommendation, ReplenishmentStatus } from '../domain/inventory.types';
import { PaginationParams, PaginatedResult } from '../domain/types';

export interface ReplenishmentFilters {
  store_id?: string;
  sku_id?: string;
  status?: ReplenishmentStatus;
}

export class ReplenishmentRepository {
  async create(rec: ReplenishmentRecommendation, client?: PoolClient): Promise<ReplenishmentRecommendation> {
    const q = client || pool;
    const sql = `
      INSERT INTO replenishment_recommendations (
        id, store_id, sku_id, suggested_quantity, status, reason, calculation_inputs,
        decision_actor_id, decided_at, executed_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, store_id, sku_id, suggested_quantity, status, reason, calculation_inputs,
                decision_actor_id, decided_at, executed_at, created_at, updated_at
    `;
    const { rows } = await q.query(sql, [
      rec.id,
      rec.store_id,
      rec.sku_id,
      rec.suggested_quantity,
      rec.status,
      rec.reason,
      JSON.stringify(rec.calculation_inputs),
      rec.decision_actor_id || null,
      rec.decided_at || null,
      rec.executed_at || null,
      rec.created_at,
      rec.updated_at
    ]);
    return this.mapRow(rows[0]);
  }

  async findById(id: string, client?: PoolClient): Promise<ReplenishmentRecommendation | null> {
    const q = client || pool;
    const sql = `
      SELECT id, store_id, sku_id, suggested_quantity, status, reason, calculation_inputs,
             decision_actor_id, decided_at, executed_at, created_at, updated_at
      FROM replenishment_recommendations
      WHERE id = $1
    `;
    const { rows } = await q.query(sql, [id]);
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async findPendingByStoreAndSku(storeId: string, skuId: string): Promise<ReplenishmentRecommendation | null> {
    const sql = `
      SELECT id, store_id, sku_id, suggested_quantity, status, reason, calculation_inputs,
             decision_actor_id, decided_at, executed_at, created_at, updated_at
      FROM replenishment_recommendations
      WHERE store_id = $1 AND sku_id = $2 AND status = 'PENDING'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const { rows } = await pool.query(sql, [storeId, skuId]);
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async update(rec: ReplenishmentRecommendation, client?: PoolClient): Promise<ReplenishmentRecommendation> {
    const q = client || pool;
    const sql = `
      UPDATE replenishment_recommendations
      SET status = $1,
          reason = $2,
          decision_actor_id = $3,
          decided_at = $4,
          executed_at = $5,
          updated_at = NOW()
      WHERE id = $6
      RETURNING id, store_id, sku_id, suggested_quantity, status, reason, calculation_inputs,
                decision_actor_id, decided_at, executed_at, created_at, updated_at
    `;
    const { rows } = await q.query(sql, [
      rec.status,
      rec.reason,
      rec.decision_actor_id || null,
      rec.decided_at || null,
      rec.executed_at || null,
      rec.id
    ]);
    return this.mapRow(rows[0]);
  }

  async findAll(params: PaginationParams, filters: ReplenishmentFilters): Promise<PaginatedResult<ReplenishmentRecommendation>> {
    const offset = (params.page - 1) * params.limit;
    const whereConditions: string[] = [];
    const values: any[] = [];

    if (filters.store_id) {
      values.push(filters.store_id);
      whereConditions.push(`store_id = $${values.length}`);
    }

    if (filters.sku_id) {
      values.push(filters.sku_id);
      whereConditions.push(`sku_id = $${values.length}`);
    }

    if (filters.status) {
      values.push(filters.status);
      whereConditions.push(`status = $${values.length}`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) AS total FROM replenishment_recommendations ${whereClause}`;
    const countRes = await pool.query(countSql, values);
    const total = parseInt(countRes.rows[0].total, 10);

    values.push(params.limit, offset);
    const sql = `
      SELECT id, store_id, sku_id, suggested_quantity, status, reason, calculation_inputs,
             decision_actor_id, decided_at, executed_at, created_at, updated_at
      FROM replenishment_recommendations
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `;

    const { rows } = await pool.query(sql, values);

    return {
      data: rows.map(r => this.mapRow(r)),
      pagination: {
        total,
        page: params.page,
        limit: params.limit,
        total_pages: Math.ceil(total / params.limit) || 1
      }
    };
  }

  private mapRow(row: any): ReplenishmentRecommendation {
    return {
      id: row.id,
      store_id: row.store_id,
      sku_id: row.sku_id,
      suggested_quantity: parseInt(row.suggested_quantity, 10),
      status: row.status as ReplenishmentStatus,
      reason: row.reason,
      calculation_inputs: row.calculation_inputs,
      decision_actor_id: row.decision_actor_id,
      decided_at: row.decided_at,
      executed_at: row.executed_at,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

export const replenishmentRepository = new ReplenishmentRepository();
