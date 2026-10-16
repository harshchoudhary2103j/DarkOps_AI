import { PoolClient } from 'pg';
import { pool } from '../database/db';
import { InventoryPosition } from '../domain/inventory.types';
import { PaginationParams, PaginatedResult } from '../domain/types';

export interface InventoryPositionFilters {
  store_id?: string;
  sku_id?: string;
  low_stock_only?: boolean;
}

export class InventoryPositionRepository {
  async create(position: InventoryPosition, client?: PoolClient): Promise<InventoryPosition> {
    const q = client || pool;
    const sql = `
      INSERT INTO inventory_positions (
        id, store_id, sku_id, physical_on_hand, reserved_stock, incoming_units, version, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, store_id, sku_id, physical_on_hand, reserved_stock,
                (physical_on_hand - reserved_stock) AS available_stock,
                incoming_units, version, created_at, updated_at
    `;
    const { rows } = await q.query(sql, [
      position.id,
      position.store_id,
      position.sku_id,
      position.physical_on_hand,
      position.reserved_stock,
      position.incoming_units,
      position.version,
      position.created_at,
      position.updated_at
    ]);
    return this.mapRow(rows[0]);
  }

  async findByStoreAndSku(storeId: string, skuId: string, client?: PoolClient): Promise<InventoryPosition | null> {
    const q = client || pool;
    const sql = `
      SELECT id, store_id, sku_id, physical_on_hand, reserved_stock,
             (physical_on_hand - reserved_stock) AS available_stock,
             incoming_units, version, created_at, updated_at
      FROM inventory_positions
      WHERE store_id = $1 AND sku_id = $2
    `;
    const { rows } = await q.query(sql, [storeId, skuId]);
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  /**
   * Concurrency-safe lookup acquiring an exclusive row-level lock.
   * MUST be executed inside an active transaction.
   */
  async findByStoreAndSkuForUpdate(storeId: string, skuId: string, client: PoolClient): Promise<InventoryPosition | null> {
    const sql = `
      SELECT id, store_id, sku_id, physical_on_hand, reserved_stock,
             (physical_on_hand - reserved_stock) AS available_stock,
             incoming_units, version, created_at, updated_at
      FROM inventory_positions
      WHERE store_id = $1 AND sku_id = $2
      FOR UPDATE
    `;
    const { rows } = await client.query(sql, [storeId, skuId]);
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async update(position: InventoryPosition, client: PoolClient): Promise<InventoryPosition> {
    const sql = `
      UPDATE inventory_positions
      SET physical_on_hand = $1,
          reserved_stock = $2,
          incoming_units = $3,
          version = version + 1,
          updated_at = NOW()
      WHERE id = $4
      RETURNING id, store_id, sku_id, physical_on_hand, reserved_stock,
                (physical_on_hand - reserved_stock) AS available_stock,
                incoming_units, version, created_at, updated_at
    `;
    const { rows } = await client.query(sql, [
      position.physical_on_hand,
      position.reserved_stock,
      position.incoming_units,
      position.id
    ]);
    return this.mapRow(rows[0]);
  }

  async findAll(params: PaginationParams, filters: InventoryPositionFilters): Promise<PaginatedResult<InventoryPosition>> {
    const offset = (params.page - 1) * params.limit;
    const whereConditions: string[] = [];
    const values: any[] = [];

    if (filters.store_id) {
      values.push(filters.store_id);
      whereConditions.push(`store_id = $${values.length}`);
    }

    if (filters.sku_id) {
      values.push(filters.sku_id);
      whereConditions.push(`sku_id = $${values.length}`);
    }

    if (filters.low_stock_only) {
      whereConditions.push(`(physical_on_hand - reserved_stock) <= 10`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) AS total FROM inventory_positions ${whereClause}`;
    const countRes = await pool.query(countSql, values);
    const total = parseInt(countRes.rows[0].total, 10);

    values.push(params.limit, offset);
    const sql = `
      SELECT id, store_id, sku_id, physical_on_hand, reserved_stock,
             (physical_on_hand - reserved_stock) AS available_stock,
             incoming_units, version, created_at, updated_at
      FROM inventory_positions
      ${whereClause}
      ORDER BY store_id ASC, sku_id ASC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `;

    const { rows } = await pool.query(sql, values);

    return {
      data: rows.map(r => this.mapRow(r)),
      pagination: {
        total,
        page: params.page,
        limit: params.limit,
        total_pages: Math.ceil(total / params.limit) || 1
      }
    };
  }

  private mapRow(row: any): InventoryPosition {
    return {
      id: row.id,
      store_id: row.store_id,
      sku_id: row.sku_id,
      physical_on_hand: parseInt(row.physical_on_hand, 10),
      reserved_stock: parseInt(row.reserved_stock, 10),
      available_stock: parseInt(row.available_stock, 10),
      incoming_units: parseInt(row.incoming_units, 10),
      version: parseInt(row.version, 10),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

export const inventoryPositionRepository = new InventoryPositionRepository();
