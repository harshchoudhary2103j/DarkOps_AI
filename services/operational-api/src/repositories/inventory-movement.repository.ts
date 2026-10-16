import { PoolClient } from 'pg';
import { pool } from '../database/db';
import { InventoryMovement, InventoryMovementType } from '../domain/inventory.types';
import { PaginationParams, PaginatedResult } from '../domain/types';

export interface MovementFilters {
  store_id?: string;
  sku_id?: string;
  movement_type?: InventoryMovementType;
}

export class InventoryMovementRepository {
  /**
   * Appends an immutable stock movement record to the ledger.
   * Modifying or deleting movements is strictly disallowed by domain rules.
   */
  async create(movement: InventoryMovement, client?: PoolClient): Promise<InventoryMovement> {
    const q = client || pool;
    const sql = `
      INSERT INTO inventory_movements (
        id, store_id, sku_id, movement_type, quantity, reservation_id,
        reason, actor_id, correlation_id, idempotency_key, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, store_id, sku_id, movement_type, quantity, reservation_id,
                reason, actor_id, correlation_id, idempotency_key, metadata, created_at
    `;
    const { rows } = await q.query(sql, [
      movement.id,
      movement.store_id,
      movement.sku_id,
      movement.movement_type,
      movement.quantity,
      movement.reservation_id || null,
      movement.reason || null,
      movement.actor_id,
      movement.correlation_id || null,
      movement.idempotency_key || null,
      movement.metadata ? JSON.stringify(movement.metadata) : null,
      movement.created_at
    ]);
    return this.mapRow(rows[0]);
  }

  async findAll(params: PaginationParams, filters: MovementFilters): Promise<PaginatedResult<InventoryMovement>> {
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

    if (filters.movement_type) {
      values.push(filters.movement_type);
      whereConditions.push(`movement_type = $${values.length}`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) AS total FROM inventory_movements ${whereClause}`;
    const countRes = await pool.query(countSql, values);
    const total = parseInt(countRes.rows[0].total, 10);

    values.push(params.limit, offset);
    const sql = `
      SELECT id, store_id, sku_id, movement_type, quantity, reservation_id,
             reason, actor_id, correlation_id, idempotency_key, metadata, created_at
      FROM inventory_movements
      ${whereClause}
      ORDER BY created_at DESC
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

  /**
   * Aggregates movement ledger history to compute authoritative stock quantities for reconciliation.
   */
  async getLedgerTotals(storeId: string, skuId: string): Promise<{
    expected_physical: number;
    expected_reserved: number;
    movement_count: number;
  }> {
    const sql = `
      SELECT
        COALESCE(SUM(CASE
          WHEN movement_type IN ('OPENING_STOCK', 'RECEIPT', 'POSITIVE_ADJUSTMENT') THEN quantity
          WHEN movement_type IN ('NEGATIVE_ADJUSTMENT', 'PICK_CONSUMPTION') THEN -quantity
          ELSE 0
        END), 0) AS expected_physical,
        COALESCE(SUM(CASE
          WHEN movement_type = 'RESERVATION' THEN quantity
          WHEN movement_type IN ('RESERVATION_RELEASE', 'PICK_CONSUMPTION') THEN -quantity
          ELSE 0
        END), 0) AS expected_reserved,
        COUNT(*) AS movement_count
      FROM inventory_movements
      WHERE store_id = $1 AND sku_id = $2
    `;
    const { rows } = await pool.query(sql, [storeId, skuId]);
    return {
      expected_physical: parseInt(rows[0].expected_physical, 10),
      expected_reserved: parseInt(rows[0].expected_reserved, 10),
      movement_count: parseInt(rows[0].movement_count, 10)
    };
  }

  private mapRow(row: any): InventoryMovement {
    return {
      id: row.id,
      store_id: row.store_id,
      sku_id: row.sku_id,
      movement_type: row.movement_type,
      quantity: parseInt(row.quantity, 10),
      reservation_id: row.reservation_id,
      reason: row.reason,
      actor_id: row.actor_id,
      correlation_id: row.correlation_id,
      idempotency_key: row.idempotency_key,
      metadata: row.metadata,
      created_at: row.created_at
    };
  }
}

export const inventoryMovementRepository = new InventoryMovementRepository();
