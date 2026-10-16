import { PoolClient } from 'pg';
import { pool } from '../database/db';
import { OrderLifecycleEvent } from '../domain/order.types';

export class OrderEventRepository {
  async create(event: OrderLifecycleEvent, client?: PoolClient): Promise<OrderLifecycleEvent> {
    const q = client || pool;
    const sql = `
      INSERT INTO order_lifecycle_events (
        id, order_id, event_type, from_status, to_status, actor_id, payload, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const { rows } = await q.query(sql, [
      event.id,
      event.order_id,
      event.event_type,
      event.from_status || null,
      event.to_status || null,
      event.actor_id || 'system',
      JSON.stringify(event.payload || {}),
      event.created_at || new Date().toISOString()
    ]);
    return this.mapRow(rows[0]);
  }

  async findByOrderId(orderId: string, client?: PoolClient): Promise<OrderLifecycleEvent[]> {
    const q = client || pool;
    const sql = `
      SELECT *
      FROM order_lifecycle_events
      WHERE order_id = $1
      ORDER BY created_at ASC
    `;
    const { rows } = await q.query(sql, [orderId]);
    return rows.map(this.mapRow);
  }

  private mapRow(r: any): OrderLifecycleEvent {
    return {
      id: r.id,
      order_id: r.order_id,
      event_type: r.event_type,
      from_status: r.from_status,
      to_status: r.to_status,
      actor_id: r.actor_id,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at
    };
  }
}

export const orderEventRepository = new OrderEventRepository();
