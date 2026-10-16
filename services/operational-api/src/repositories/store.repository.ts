import { PoolClient } from 'pg';
import { pool } from '../database/db';
import { Store, StoreStatus, PaginationParams, PaginatedResult } from '../domain/types';

export class StoreRepository {
  async create(store: Store, client?: PoolClient): Promise<Store> {
    const q = client || pool;
    const sql = `
      INSERT INTO stores (id, name, status, latitude, longitude, service_area, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name, status, latitude::float, longitude::float, service_area, created_at, updated_at
    `;
    const { rows } = await q.query(sql, [
      store.id,
      store.name,
      store.status,
      store.latitude,
      store.longitude,
      JSON.stringify(store.service_area),
      store.created_at,
      store.updated_at
    ]);
    return rows[0];
  }

  async findById(id: string, client?: PoolClient): Promise<Store | null> {
    const q = client || pool;
    const sql = `
      SELECT 
        s.id, 
        s.name, 
        s.status, 
        s.latitude::float, 
        s.longitude::float, 
        s.service_area, 
        s.created_at, 
        s.updated_at,
        COALESCE(COUNT(o.id) FILTER (WHERE o.status IN ('PLACED', 'ALLOCATED', 'PICKING', 'READY')), 0)::int AS current_queue_depth
      FROM stores s
      LEFT JOIN orders o ON s.id = o.store_id
      WHERE s.id = $1
      GROUP BY s.id
    `;
    const { rows } = await q.query(sql, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  async findAll(params: PaginationParams, status?: StoreStatus): Promise<PaginatedResult<Store>> {
    const offset = (params.page - 1) * params.limit;
    const whereConditions: string[] = [];
    const values: any[] = [];

    if (status) {
      values.push(status);
      whereConditions.push(`s.status = $${values.length}`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) AS total FROM stores s ${whereClause}`;
    const countRes = await pool.query(countSql, values);
    const total = parseInt(countRes.rows[0].total, 10);

    values.push(params.limit, offset);
    const sql = `
      SELECT 
        s.id, 
        s.name, 
        s.status, 
        s.latitude::float, 
        s.longitude::float, 
        s.service_area, 
        s.created_at, 
        s.updated_at,
        COALESCE(COUNT(o.id) FILTER (WHERE o.status IN ('PLACED', 'ALLOCATED', 'PICKING', 'READY')), 0)::int AS current_queue_depth
      FROM stores s
      LEFT JOIN orders o ON s.id = o.store_id
      ${whereClause}
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `;

    const { rows } = await pool.query(sql, values);

    return {
      data: rows,
      pagination: {
        total,
        page: params.page,
        limit: params.limit,
        total_pages: Math.ceil(total / params.limit) || 1
      }
    };
  }

  async update(id: string, updates: Partial<Store>, client?: PoolClient): Promise<Store | null> {
    const q = client || pool;
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      values.push(updates.name);
      fields.push(`name = $${values.length}`);
    }
    if (updates.status !== undefined) {
      values.push(updates.status);
      fields.push(`status = $${values.length}`);
    }
    if (updates.latitude !== undefined) {
      values.push(updates.latitude);
      fields.push(`latitude = $${values.length}`);
    }
    if (updates.longitude !== undefined) {
      values.push(updates.longitude);
      fields.push(`longitude = $${values.length}`);
    }
    if (updates.service_area !== undefined) {
      values.push(JSON.stringify(updates.service_area));
      fields.push(`service_area = $${values.length}`);
    }

    if (fields.length === 0) {
      return this.findById(id, client);
    }

    values.push(new Date().toISOString());
    fields.push(`updated_at = $${values.length}`);

    values.push(id);
    const sql = `
      UPDATE stores
      SET ${fields.join(', ')}
      WHERE id = $${values.length}
      RETURNING id, name, status, latitude::float, longitude::float, service_area, created_at, updated_at
    `;

    const { rows } = await q.query(sql, values);
    return rows.length > 0 ? rows[0] : null;
  }

  async delete(id: string, client?: PoolClient): Promise<boolean> {
    const q = client || pool;
    const { rowCount } = await q.query('DELETE FROM stores WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }
}

export const storeRepository = new StoreRepository();
