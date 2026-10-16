import { PoolClient } from 'pg';
import { pool } from '../database/db';
import { SKU, SKUStatus, PaginationParams, PaginatedResult } from '../domain/types';

export class SKURepository {
  async create(sku: SKU, client?: PoolClient): Promise<SKU> {
    const q = client || pool;
    const sql = `
      INSERT INTO skus (id, product_id, sku_code, pack_size, shelf_life_days, storage_temp, unit_price, currency, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, product_id, sku_code, pack_size, shelf_life_days, storage_temp, unit_price::float, currency, status, created_at, updated_at
    `;
    const { rows } = await q.query(sql, [
      sku.id,
      sku.product_id,
      sku.sku_code,
      sku.pack_size,
      sku.shelf_life_days,
      JSON.stringify(sku.storage_temp),
      sku.unit_price,
      sku.currency,
      sku.status,
      sku.created_at,
      sku.updated_at
    ]);
    return rows[0];
  }

  async findById(id: string, client?: PoolClient): Promise<SKU | null> {
    const q = client || pool;
    const sql = `
      SELECT id, product_id, sku_code, pack_size, shelf_life_days, storage_temp, unit_price::float, currency, status, created_at, updated_at
      FROM skus
      WHERE id = $1
    `;
    const { rows } = await q.query(sql, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  async findBySkuCode(skuCode: string, client?: PoolClient): Promise<SKU | null> {
    const q = client || pool;
    const sql = `
      SELECT id, product_id, sku_code, pack_size, shelf_life_days, storage_temp, unit_price::float, currency, status, created_at, updated_at
      FROM skus
      WHERE sku_code = $1
    `;
    const { rows } = await q.query(sql, [skuCode]);
    return rows.length > 0 ? rows[0] : null;
  }

  async findAll(params: PaginationParams, productId?: string, status?: SKUStatus): Promise<PaginatedResult<SKU>> {
    const offset = (params.page - 1) * params.limit;
    const whereConditions: string[] = [];
    const values: any[] = [];

    if (productId) {
      values.push(productId);
      whereConditions.push(`product_id = $${values.length}`);
    }

    if (status) {
      values.push(status);
      whereConditions.push(`status = $${values.length}`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) AS total FROM skus ${whereClause}`;
    const countRes = await pool.query(countSql, values);
    const total = parseInt(countRes.rows[0].total, 10);

    values.push(params.limit, offset);
    const sql = `
      SELECT id, product_id, sku_code, pack_size, shelf_life_days, storage_temp, unit_price::float, currency, status, created_at, updated_at
      FROM skus
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

  async update(id: string, updates: Partial<SKU>, client?: PoolClient): Promise<SKU | null> {
    const q = client || pool;
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.product_id !== undefined) {
      values.push(updates.product_id);
      fields.push(`product_id = $${values.length}`);
    }
    if (updates.pack_size !== undefined) {
      values.push(updates.pack_size);
      fields.push(`pack_size = $${values.length}`);
    }
    if (updates.shelf_life_days !== undefined) {
      values.push(updates.shelf_life_days);
      fields.push(`shelf_life_days = $${values.length}`);
    }
    if (updates.storage_temp !== undefined) {
      values.push(JSON.stringify(updates.storage_temp));
      fields.push(`storage_temp = $${values.length}`);
    }
    if (updates.unit_price !== undefined) {
      values.push(updates.unit_price);
      fields.push(`unit_price = $${values.length}`);
    }
    if (updates.currency !== undefined) {
      values.push(updates.currency);
      fields.push(`currency = $${values.length}`);
    }
    if (updates.status !== undefined) {
      values.push(updates.status);
      fields.push(`status = $${values.length}`);
    }

    if (fields.length === 0) {
      return this.findById(id, client);
    }

    values.push(new Date().toISOString());
    fields.push(`updated_at = $${values.length}`);

    values.push(id);
    const sql = `
      UPDATE skus
      SET ${fields.join(', ')}
      WHERE id = $${values.length}
      RETURNING id, product_id, sku_code, pack_size, shelf_life_days, storage_temp, unit_price::float, currency, status, created_at, updated_at
    `;

    const { rows } = await q.query(sql, values);
    return rows.length > 0 ? rows[0] : null;
  }

  async delete(id: string, client?: PoolClient): Promise<boolean> {
    const q = client || pool;
    const { rowCount } = await q.query('DELETE FROM skus WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }
}

export const skuRepository = new SKURepository();
