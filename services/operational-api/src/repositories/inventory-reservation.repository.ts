import { PoolClient } from 'pg';
import { pool } from '../database/db';
import { InventoryReservation, ReservationStatus } from '../domain/inventory.types';

export class InventoryReservationRepository {
  async create(reservation: InventoryReservation, client?: PoolClient): Promise<InventoryReservation> {
    const q = client || pool;
    const sql = `
      INSERT INTO inventory_reservations (
        id, store_id, sku_id, quantity, remaining_quantity, status, external_reference, created_at, updated_at, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, store_id, sku_id, quantity, remaining_quantity, status, external_reference, created_at, updated_at, expires_at
    `;
    const { rows } = await q.query(sql, [
      reservation.id,
      reservation.store_id,
      reservation.sku_id,
      reservation.quantity,
      reservation.remaining_quantity,
      reservation.status,
      reservation.external_reference || null,
      reservation.created_at,
      reservation.updated_at,
      reservation.expires_at || null
    ]);
    return this.mapRow(rows[0]);
  }

  async findById(id: string, client?: PoolClient): Promise<InventoryReservation | null> {
    const q = client || pool;
    const sql = `
      SELECT id, store_id, sku_id, quantity, remaining_quantity, status, external_reference, created_at, updated_at, expires_at
      FROM inventory_reservations
      WHERE id = $1
    `;
    const { rows } = await q.query(sql, [id]);
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  /**
   * Concurrency-safe lookup acquiring row-level lock on the reservation.
   * MUST be executed inside an active transaction.
   */
  async findByIdForUpdate(id: string, client: PoolClient): Promise<InventoryReservation | null> {
    const sql = `
      SELECT id, store_id, sku_id, quantity, remaining_quantity, status, external_reference, created_at, updated_at, expires_at
      FROM inventory_reservations
      WHERE id = $1
      FOR UPDATE
    `;
    const { rows } = await client.query(sql, [id]);
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async update(reservation: InventoryReservation, client: PoolClient): Promise<InventoryReservation> {
    const sql = `
      UPDATE inventory_reservations
      SET remaining_quantity = $1,
          status = $2,
          updated_at = NOW()
      WHERE id = $3
      RETURNING id, store_id, sku_id, quantity, remaining_quantity, status, external_reference, created_at, updated_at, expires_at
    `;
    const { rows } = await client.query(sql, [
      reservation.remaining_quantity,
      reservation.status,
      reservation.id
    ]);
    return this.mapRow(rows[0]);
  }

  async findByStoreAndSku(storeId: string, skuId: string, status?: ReservationStatus): Promise<InventoryReservation[]> {
    const whereConditions = ['store_id = $1', 'sku_id = $2'];
    const values: any[] = [storeId, skuId];

    if (status) {
      values.push(status);
      whereConditions.push(`status = $${values.length}`);
    }

    const sql = `
      SELECT id, store_id, sku_id, quantity, remaining_quantity, status, external_reference, created_at, updated_at, expires_at
      FROM inventory_reservations
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY created_at DESC
    `;
    const { rows } = await pool.query(sql, values);
    return rows.map(r => this.mapRow(r));
  }

  private mapRow(row: any): InventoryReservation {
    return {
      id: row.id,
      store_id: row.store_id,
      sku_id: row.sku_id,
      quantity: parseInt(row.quantity, 10),
      remaining_quantity: parseInt(row.remaining_quantity, 10),
      status: row.status,
      external_reference: row.external_reference,
      created_at: row.created_at,
      updated_at: row.updated_at,
      expires_at: row.expires_at
    };
  }
}

export const inventoryReservationRepository = new InventoryReservationRepository();
