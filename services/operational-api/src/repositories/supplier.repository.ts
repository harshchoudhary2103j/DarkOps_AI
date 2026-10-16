import { PoolClient } from 'pg';
import { pool } from '../database/db';
import { Supplier, SupplierSKU, SupplierStatus, PaginationParams, PaginatedResult } from '../domain/types';

export class SupplierRepository {
  async create(supplier: Supplier, client?: PoolClient): Promise<Supplier> {
    const q = client || pool;
    const sql = `
      INSERT INTO suppliers (id, name, default_lead_time_hours, default_moq, review_schedule, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name, default_lead_time_hours, default_moq, review_schedule, status, created_at, updated_at
    `;
    const { rows } = await q.query(sql, [
      supplier.id,
      supplier.name,
      supplier.default_lead_time_hours,
      supplier.default_moq,
      JSON.stringify(supplier.review_schedule),
      supplier.status,
      supplier.created_at,
      supplier.updated_at
    ]);
    return rows[0];
  }

  async findById(id: string, client?: PoolClient): Promise<Supplier | null> {
    const q = client || pool;
    const sql = `
      SELECT id, name, default_lead_time_hours, default_moq, review_schedule, status, created_at, updated_at
      FROM suppliers
      WHERE id = $1
    `;
    const { rows } = await q.query(sql, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  async findAll(params: PaginationParams, status?: SupplierStatus): Promise<PaginatedResult<Supplier>> {
    const offset = (params.page - 1) * params.limit;
    const whereConditions: string[] = [];
    const values: any[] = [];

    if (status) {
      values.push(status);
      whereConditions.push(`status = $${values.length}`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) AS total FROM suppliers ${whereClause}`;
    const countRes = await pool.query(countSql, values);
    const total = parseInt(countRes.rows[0].total, 10);

    values.push(params.limit, offset);
    const sql = `
      SELECT id, name, default_lead_time_hours, default_moq, review_schedule, status, created_at, updated_at
      FROM suppliers
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


  async update(id: string, updates: Partial<Supplier>, client?: PoolClient): Promise<Supplier | null> {
    const q = client || pool;
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      values.push(updates.name);
      fields.push(`name = $${values.length}`);
    }
    if (updates.default_lead_time_hours !== undefined) {
      values.push(updates.default_lead_time_hours);
      fields.push(`default_lead_time_hours = $${values.length}`);
    }
    if (updates.default_moq !== undefined) {
      values.push(updates.default_moq);
      fields.push(`default_moq = $${values.length}`);
    }
    if (updates.review_schedule !== undefined) {
      values.push(JSON.stringify(updates.review_schedule));
      fields.push(`review_schedule = $${values.length}`);
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
      UPDATE suppliers
      SET ${fields.join(', ')}
      WHERE id = $${values.length}
      RETURNING id, name, default_lead_time_hours, default_moq, review_schedule, status, created_at, updated_at
    `;

    const { rows } = await q.query(sql, values);
    return rows.length > 0 ? rows[0] : null;
  }

  async delete(id: string, client?: PoolClient): Promise<boolean> {
    const q = client || pool;
    const { rowCount } = await q.query('DELETE FROM suppliers WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }

  // ---------------------------------------------------------------------------
  // Supplier-SKU Relationship Methods
  // ---------------------------------------------------------------------------
  async linkSKU(link: SupplierSKU, client?: PoolClient): Promise<SupplierSKU> {
    const q = client || pool;
    const sql = `
      INSERT INTO supplier_skus (supplier_id, sku_id, supplier_sku_code, lead_time_hours, moq, unit_cost, is_primary, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (supplier_id, sku_id) DO UPDATE SET
        supplier_sku_code = EXCLUDED.supplier_sku_code,
        lead_time_hours = EXCLUDED.lead_time_hours,
        moq = EXCLUDED.moq,
        unit_cost = EXCLUDED.unit_cost,
        is_primary = EXCLUDED.is_primary,
        updated_at = NOW()
      RETURNING supplier_id, sku_id, supplier_sku_code, lead_time_hours, moq, unit_cost::float, is_primary, created_at, updated_at
    `;
    const { rows } = await q.query(sql, [
      link.supplier_id,
      link.sku_id,
      link.supplier_sku_code || null,
      link.lead_time_hours,
      link.moq,
      link.unit_cost,
      link.is_primary,
      link.created_at,
      link.updated_at
    ]);
    return rows[0];
  }

  async getSKUsForSupplier(supplierId: string): Promise<SupplierSKU[]> {
    const sql = `
      SELECT supplier_id, sku_id, supplier_sku_code, lead_time_hours, moq, unit_cost::float, is_primary, created_at, updated_at
      FROM supplier_skus
      WHERE supplier_id = $1
    `;
    const { rows } = await pool.query(sql, [supplierId]);
    return rows;
  }

  async unlinkSKU(supplierId: string, skuId: string, client?: PoolClient): Promise<boolean> {
    const q = client || pool;
    const { rowCount } = await q.query(
      'DELETE FROM supplier_skus WHERE supplier_id = $1 AND sku_id = $2',
      [supplierId, skuId]
    );
    return (rowCount ?? 0) > 0;
  }
}

export const supplierRepository = new SupplierRepository();

