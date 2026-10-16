import { PoolClient } from 'pg';
import { pool } from '../database/db';
import { Product, ProductStatus, PaginationParams, PaginatedResult } from '../domain/types';

export class ProductRepository {
  async create(product: Product, client?: PoolClient): Promise<Product> {
    const q = client || pool;
    const sql = `
      INSERT INTO products (id, name, category, description, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, category, description, status, created_at, updated_at
    `;
    const { rows } = await q.query(sql, [
      product.id,
      product.name,
      product.category,
      product.description,
      product.status,
      product.created_at,
      product.updated_at
    ]);
    return rows[0];
  }

  async findById(id: string, client?: PoolClient): Promise<Product | null> {
    const q = client || pool;
    const sql = `
      SELECT id, name, category, description, status, created_at, updated_at
      FROM products
      WHERE id = $1
    `;
    const { rows } = await q.query(sql, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  async findAll(params: PaginationParams, category?: string): Promise<PaginatedResult<Product>> {
    const offset = (params.page - 1) * params.limit;
    const whereConditions: string[] = [];
    const values: any[] = [];

    if (category) {
      values.push(category);
      whereConditions.push(`category = $${values.length}`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) AS total FROM products ${whereClause}`;
    const countRes = await pool.query(countSql, values);
    const total = parseInt(countRes.rows[0].total, 10);

    values.push(params.limit, offset);
    const sql = `
      SELECT id, name, category, description, status, created_at, updated_at
      FROM products
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

  async update(id: string, updates: Partial<Product>, client?: PoolClient): Promise<Product | null> {
    const q = client || pool;
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      values.push(updates.name);
      fields.push(`name = $${values.length}`);
    }
    if (updates.category !== undefined) {
      values.push(updates.category);
      fields.push(`category = $${values.length}`);
    }
    if (updates.description !== undefined) {
      values.push(updates.description);
      fields.push(`description = $${values.length}`);
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
      UPDATE products
      SET ${fields.join(', ')}
      WHERE id = $${values.length}
      RETURNING id, name, category, description, status, created_at, updated_at
    `;

    const { rows } = await q.query(sql, values);
    return rows.length > 0 ? rows[0] : null;
  }

  async delete(id: string, client?: PoolClient): Promise<boolean> {
    const q = client || pool;
    const { rowCount } = await q.query('DELETE FROM products WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }
}

export const productRepository = new ProductRepository();
