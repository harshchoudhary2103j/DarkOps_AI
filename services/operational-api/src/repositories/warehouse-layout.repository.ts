import { PoolClient } from 'pg';
import { pool } from '../database/db';
import { WarehouseLayout, PaginationParams, PaginatedResult } from '../domain/types';

export class WarehouseLayoutRepository {
  async create(layout: WarehouseLayout, client?: PoolClient): Promise<WarehouseLayout> {
    const q = client || pool;
    const sql = `
      INSERT INTO warehouse_layouts (id, store_id, name, version, status, nodes, edges, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, store_id, name, version, status, nodes, edges, created_at, updated_at
    `;
    const { rows } = await q.query(sql, [
      layout.id,
      layout.store_id,
      layout.name,
      layout.version,
      layout.status,
      JSON.stringify(layout.nodes),
      JSON.stringify(layout.edges),
      layout.created_at,
      layout.updated_at
    ]);
    return rows[0];
  }

  async findById(id: string, client?: PoolClient): Promise<WarehouseLayout | null> {
    const q = client || pool;
    const sql = `
      SELECT id, store_id, name, version, status, nodes, edges, created_at, updated_at
      FROM warehouse_layouts
      WHERE id = $1
    `;
    const { rows } = await q.query(sql, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  async findByStoreId(storeId: string, params?: PaginationParams): Promise<PaginatedResult<WarehouseLayout>> {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const offset = (page - 1) * limit;

    const countRes = await pool.query('SELECT COUNT(*) AS total FROM warehouse_layouts WHERE store_id = $1', [storeId]);
    const total = parseInt(countRes.rows[0].total, 10);

    const sql = `
      SELECT id, store_id, name, version, status, nodes, edges, created_at, updated_at
      FROM warehouse_layouts
      WHERE store_id = $1
      ORDER BY version DESC
      LIMIT $2 OFFSET $3
    `;
    const { rows } = await pool.query(sql, [storeId, limit, offset]);

    return {
      data: rows,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit) || 1
      }
    };
  }

  async findActiveByStoreId(storeId: string): Promise<WarehouseLayout | null> {
    const sql = `
      SELECT id, store_id, name, version, status, nodes, edges, created_at, updated_at
      FROM warehouse_layouts
      WHERE store_id = $1 AND status = 'ACTIVE'
      ORDER BY version DESC
      LIMIT 1
    `;
    const { rows } = await pool.query(sql, [storeId]);
    return rows.length > 0 ? rows[0] : null;
  }

  async activate(id: string, client?: PoolClient): Promise<WarehouseLayout | null> {
    const q = client || pool;
    const existing = await this.findById(id, client);
    if (!existing) return null;

    // Archive any currently active layout for this store
    await q.query(
      `UPDATE warehouse_layouts SET status = 'ARCHIVED', updated_at = NOW() WHERE store_id = $1 AND id != $2 AND status = 'ACTIVE'`,
      [existing.store_id, id]
    );

    const sql = `
      UPDATE warehouse_layouts
      SET status = 'ACTIVE', updated_at = NOW()
      WHERE id = $1
      RETURNING id, store_id, name, version, status, nodes, edges, created_at, updated_at
    `;
    const { rows } = await q.query(sql, [id]);
    return rows.length > 0 ? rows[0] : null;
  }
}

export const warehouseLayoutRepository = new WarehouseLayoutRepository();

