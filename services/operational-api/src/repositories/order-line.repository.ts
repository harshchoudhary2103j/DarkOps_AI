import { PoolClient } from 'pg';
import { pool } from '../database/db';
import { OrderLine } from '../domain/order.types';

export class OrderLineRepository {
  async createMany(lines: OrderLine[], client?: PoolClient): Promise<OrderLine[]> {
    if (lines.length === 0) return [];
    const q = client || pool;
    const results: OrderLine[] = [];

    for (const line of lines) {
      const sql = `
        INSERT INTO order_lines (
          id, order_id, sku_id, requested_quantity, reserved_quantity,
          picked_quantity, missing_quantity, damaged_quantity, reservation_id,
          status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;
      const { rows } = await q.query(sql, [
        line.id,
        line.order_id,
        line.sku_id,
        line.requested_quantity,
        line.reserved_quantity || 0,
        line.picked_quantity || 0,
        line.missing_quantity || 0,
        line.damaged_quantity || 0,
        line.reservation_id || null,
        line.status || 'PENDING',
        line.created_at || new Date().toISOString(),
        line.updated_at || new Date().toISOString()
      ]);
      results.push(this.mapRow(rows[0]));
    }

    return results;
  }

  async findByOrderId(orderId: string, client?: PoolClient): Promise<OrderLine[]> {
    const q = client || pool;
    const sql = `
      SELECT 
        ol.*,
        s.sku_code,
        s.unit_price,
        p.name AS product_name
      FROM order_lines ol
      LEFT JOIN skus s ON ol.sku_id = s.id
      LEFT JOIN products p ON s.product_id = p.id
      WHERE ol.order_id = $1 
      ORDER BY ol.created_at ASC
    `;
    const { rows } = await q.query(sql, [orderId]);
    return rows.map(this.mapRow);
  }

  async findById(id: string, client?: PoolClient): Promise<OrderLine | null> {
    const q = client || pool;
    const sql = `
      SELECT 
        ol.*,
        s.sku_code,
        s.unit_price,
        p.name AS product_name
      FROM order_lines ol
      LEFT JOIN skus s ON ol.sku_id = s.id
      LEFT JOIN products p ON s.product_id = p.id
      WHERE ol.id = $1
    `;
    const { rows } = await q.query(sql, [id]);
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async findByIdForUpdate(id: string, client: PoolClient): Promise<OrderLine | null> {
    const sql = `SELECT * FROM order_lines WHERE id = $1 FOR UPDATE`;
    const { rows } = await client.query(sql, [id]);
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async update(line: OrderLine, client?: PoolClient): Promise<OrderLine> {
    const q = client || pool;
    const sql = `
      UPDATE order_lines
      SET
        reserved_quantity = $2,
        picked_quantity = $3,
        missing_quantity = $4,
        damaged_quantity = $5,
        reservation_id = $6,
        status = $7,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const { rows } = await q.query(sql, [
      line.id,
      line.reserved_quantity,
      line.picked_quantity,
      line.missing_quantity,
      line.damaged_quantity,
      line.reservation_id || null,
      line.status
    ]);
    return this.mapRow(rows[0]);
  }

  private mapRow(r: any): OrderLine {
    return {
      id: r.id,
      order_id: r.order_id,
      sku_id: r.sku_id,
      requested_quantity: parseInt(r.requested_quantity, 10),
      reserved_quantity: parseInt(r.reserved_quantity, 10),
      picked_quantity: parseInt(r.picked_quantity, 10),
      missing_quantity: parseInt(r.missing_quantity, 10),
      damaged_quantity: parseInt(r.damaged_quantity, 10),
      reservation_id: r.reservation_id,
      status: r.status,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
      sku_code: r.sku_code || undefined,
      product_name: r.product_name || undefined,
      unit_price: r.unit_price != null ? parseFloat(r.unit_price) : undefined
    };
  }
}

export const orderLineRepository = new OrderLineRepository();
