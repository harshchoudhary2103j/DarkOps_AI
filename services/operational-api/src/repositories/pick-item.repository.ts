import { PoolClient } from 'pg';
import { pool } from '../database/db';
import { PickItem } from '../domain/order.types';

export class PickItemRepository {
  async createMany(items: PickItem[], client?: PoolClient): Promise<PickItem[]> {
    if (items.length === 0) return [];
    const q = client || pool;
    const results: PickItem[] = [];

    for (const item of items) {
      const sql = `
        INSERT INTO pick_items (
          id, picking_task_id, order_line_id, sku_id, shelf_location,
          requested_quantity, confirmed_picked_quantity, missing_quantity,
          damaged_quantity, status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;
      const { rows } = await q.query(sql, [
        item.id,
        item.picking_task_id,
        item.order_line_id,
        item.sku_id,
        item.shelf_location || null,
        item.requested_quantity,
        item.confirmed_picked_quantity || 0,
        item.missing_quantity || 0,
        item.damaged_quantity || 0,
        item.status || 'PENDING',
        item.created_at || new Date().toISOString(),
        item.updated_at || new Date().toISOString()
      ]);
      results.push(this.mapRow(rows[0]));
    }

    return results;
  }

  async findByTaskId(taskId: string, client?: PoolClient): Promise<PickItem[]> {
    const q = client || pool;
    const sql = `SELECT * FROM pick_items WHERE picking_task_id = $1 ORDER BY created_at ASC`;
    const { rows } = await q.query(sql, [taskId]);
    return rows.map(this.mapRow);
  }

  async findById(id: string, client?: PoolClient): Promise<PickItem | null> {
    const q = client || pool;
    const sql = `SELECT * FROM pick_items WHERE id = $1`;
    const { rows } = await q.query(sql, [id]);
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async findByIdForUpdate(id: string, client: PoolClient): Promise<PickItem | null> {
    const sql = `SELECT * FROM pick_items WHERE id = $1 FOR UPDATE`;
    const { rows } = await client.query(sql, [id]);
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async update(item: PickItem, client?: PoolClient): Promise<PickItem> {
    const q = client || pool;
    const sql = `
      UPDATE pick_items
      SET
        confirmed_picked_quantity = $2,
        missing_quantity = $3,
        damaged_quantity = $4,
        status = $5,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const { rows } = await q.query(sql, [
      item.id,
      item.confirmed_picked_quantity,
      item.missing_quantity,
      item.damaged_quantity,
      item.status
    ]);
    return this.mapRow(rows[0]);
  }

  private mapRow(r: any): PickItem {
    return {
      id: r.id,
      picking_task_id: r.picking_task_id,
      order_line_id: r.order_line_id,
      sku_id: r.sku_id,
      shelf_location: r.shelf_location,
      requested_quantity: parseInt(r.requested_quantity, 10),
      confirmed_picked_quantity: parseInt(r.confirmed_picked_quantity, 10),
      missing_quantity: parseInt(r.missing_quantity, 10),
      damaged_quantity: parseInt(r.damaged_quantity, 10),
      status: r.status,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at
    };
  }
}

export const pickItemRepository = new PickItemRepository();
