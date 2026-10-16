import { PoolClient } from 'pg';
import { pool } from '../database/db';
import { Order } from '../domain/order.types';
import { PaginatedResult } from '../domain/types';

export class OrderRepository {
  async create(order: Order, client?: PoolClient): Promise<Order> {
    const q = client || pool;
    const sql = `
      INSERT INTO orders (
        id, customer_id, customer_latitude, customer_longitude, delivery_zone_id,
        store_id, status, line_count, total_requested_units, failure_code,
        failure_reason, version, created_at, updated_at, allocated_at,
        cancelled_at, completed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;
    const { rows } = await q.query(sql, [
      order.id,
      order.customer_id || null,
      order.customer_latitude,
      order.customer_longitude,
      order.delivery_zone_id || null,
      order.store_id || null,
      order.status,
      order.line_count,
      order.total_requested_units,
      order.failure_code || null,
      order.failure_reason || null,
      order.version || 1,
      order.created_at || new Date().toISOString(),
      order.updated_at || new Date().toISOString(),
      order.allocated_at || null,
      order.cancelled_at || null,
      order.completed_at || null
    ]);
    return this.mapRow(rows[0]);
  }

  async findById(id: string, client?: PoolClient): Promise<Order | null> {
    const q = client || pool;
    const sql = `SELECT * FROM orders WHERE id = $1`;
    const { rows } = await q.query(sql, [id]);
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async findByIdForUpdate(id: string, client: PoolClient): Promise<Order | null> {
    const sql = `SELECT * FROM orders WHERE id = $1 FOR UPDATE`;
    const { rows } = await client.query(sql, [id]);
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async update(order: Order, client?: PoolClient): Promise<Order> {
    const q = client || pool;
    const sql = `
      UPDATE orders
      SET
        customer_id = $2,
        customer_latitude = $3,
        customer_longitude = $4,
        delivery_zone_id = $5,
        store_id = $6,
        status = $7,
        line_count = $8,
        total_requested_units = $9,
        failure_code = $10,
        failure_reason = $11,
        version = version + 1,
        updated_at = NOW(),
        allocated_at = $12,
        cancelled_at = $13,
        completed_at = $14
      WHERE id = $1
      RETURNING *
    `;
    const { rows } = await q.query(sql, [
      order.id,
      order.customer_id || null,
      order.customer_latitude,
      order.customer_longitude,
      order.delivery_zone_id || null,
      order.store_id || null,
      order.status,
      order.line_count,
      order.total_requested_units,
      order.failure_code || null,
      order.failure_reason || null,
      order.allocated_at || null,
      order.cancelled_at || null,
      order.completed_at || null
    ]);
    return this.mapRow(rows[0]);
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    status?: string;
    store_id?: string;
    customer_id?: string;
  }): Promise<PaginatedResult<Order>> {
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
    if (params.customer_id) {
      conditions.push(`customer_id = $${idx++}`);
      values.push(params.customer_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) AS total FROM orders ${whereClause}`;
    const countRes = await pool.query(countSql, values);
    const total = parseInt(countRes.rows[0].total, 10);

    const dataSql = `
      SELECT *
      FROM orders
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

  private mapRow(r: any): Order {
    return {
      id: r.id,
      customer_id: r.customer_id,
      customer_latitude: parseFloat(r.customer_latitude),
      customer_longitude: parseFloat(r.customer_longitude),
      delivery_zone_id: r.delivery_zone_id,
      store_id: r.store_id,
      status: r.status,
      line_count: parseInt(r.line_count, 10),
      total_requested_units: parseInt(r.total_requested_units, 10),
      failure_code: r.failure_code,
      failure_reason: r.failure_reason,
      version: parseInt(r.version, 10),
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
      allocated_at: r.allocated_at instanceof Date ? r.allocated_at.toISOString() : r.allocated_at,
      cancelled_at: r.cancelled_at instanceof Date ? r.cancelled_at.toISOString() : r.cancelled_at,
      completed_at: r.completed_at instanceof Date ? r.completed_at.toISOString() : r.completed_at
    };
  }
}

export const orderRepository = new OrderRepository();
