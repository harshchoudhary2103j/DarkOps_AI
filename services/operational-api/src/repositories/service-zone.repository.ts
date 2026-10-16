import { PoolClient } from 'pg';
import { pool } from '../database/db';
import { ServiceZone, ServiceZoneStatus, PaginationParams, PaginatedResult } from '../domain/types';

export class ServiceZoneRepository {
  async create(zone: ServiceZone, client?: PoolClient): Promise<ServiceZone> {
    const q = client || pool;
    const sql = `
      INSERT INTO service_zones (id, store_id, name, boundary, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, store_id, name, boundary, status, created_at, updated_at
    `;
    const { rows } = await q.query(sql, [
      zone.id,
      zone.store_id,
      zone.name,
      JSON.stringify(zone.boundary),
      zone.status,
      zone.created_at,
      zone.updated_at
    ]);
    return rows[0];
  }

  async findById(id: string, client?: PoolClient): Promise<ServiceZone | null> {
    const q = client || pool;
    const sql = `
      SELECT id, store_id, name, boundary, status, created_at, updated_at
      FROM service_zones
      WHERE id = $1
    `;
    const { rows } = await q.query(sql, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  async findByStoreId(storeId: string): Promise<ServiceZone[]> {
    const sql = `
      SELECT id, store_id, name, boundary, status, created_at, updated_at
      FROM service_zones
      WHERE store_id = $1
      ORDER BY created_at ASC
    `;
    const { rows } = await pool.query(sql, [storeId]);
    return rows;
  }

  async findAll(params: PaginationParams, storeId?: string, status?: ServiceZoneStatus): Promise<PaginatedResult<ServiceZone>> {
    const offset = (params.page - 1) * params.limit;
    const whereConditions: string[] = [];
    const values: any[] = [];

    if (storeId) {
      values.push(storeId);
      whereConditions.push(`store_id = $${values.length}`);
    }

    if (status) {
      values.push(status);
      whereConditions.push(`status = $${values.length}`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) AS total FROM service_zones ${whereClause}`;
    const countRes = await pool.query(countSql, values);
    const total = parseInt(countRes.rows[0].total, 10);

    values.push(params.limit, offset);
    const sql = `
      SELECT id, store_id, name, boundary, status, created_at, updated_at
      FROM service_zones
      ${whereClause}
      ORDER BY created_at DESC
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

  async update(id: string, updates: Partial<ServiceZone>, client?: PoolClient): Promise<ServiceZone | null> {
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
    if (updates.boundary !== undefined) {
      values.push(JSON.stringify(updates.boundary));
      fields.push(`boundary = $${values.length}`);
    }

    if (fields.length === 0) {
      return this.findById(id, client);
    }

    values.push(new Date().toISOString());
    fields.push(`updated_at = $${values.length}`);

    values.push(id);
    const sql = `
      UPDATE service_zones
      SET ${fields.join(', ')}
      WHERE id = $${values.length}
      RETURNING id, store_id, name, boundary, status, created_at, updated_at
    `;

    const { rows } = await q.query(sql, values);
    return rows.length > 0 ? rows[0] : null;
  }

  async delete(id: string, client?: PoolClient): Promise<boolean> {
    const q = client || pool;
    const { rowCount } = await q.query('DELETE FROM service_zones WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }
}

export const serviceZoneRepository = new ServiceZoneRepository();
