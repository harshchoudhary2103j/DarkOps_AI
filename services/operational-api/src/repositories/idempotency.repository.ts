import { PoolClient } from 'pg';
import { pool } from '../database/db';
import { IdempotencyRecord, IdempotencyStatus } from '../domain/inventory.types';

export class IdempotencyRepository {
  /**
   * Attempts to claim an idempotency key atomically.
   * If the key already exists for the scope, returns the existing record.
   */
  async claim(
    key: string,
    scope: string,
    actorId: string,
    requestHash: string,
    ttlHours: number = 24,
    client?: PoolClient
  ): Promise<{ claimed: boolean; existingRecord?: IdempotencyRecord }> {
    const q = client || pool;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString();

    const insertSql = `
      INSERT INTO idempotency_records (
        key, scope, actor_id, request_hash, status, created_at, updated_at, expires_at
      )
      VALUES ($1, $2, $3, $4, 'PROCESSING', NOW(), NOW(), $5)
      ON CONFLICT (key, scope) DO NOTHING
      RETURNING key, scope, actor_id, request_hash, status, response_status, response_body, created_at, updated_at, expires_at
    `;

    const { rows } = await q.query(insertSql, [key, scope, actorId, requestHash, expiresAt]);

    if (rows.length > 0) {
      return { claimed: true };
    }

    // Key already exists, retrieve existing record
    const findSql = `
      SELECT key, scope, actor_id, request_hash, status, response_status, response_body, created_at, updated_at, expires_at
      FROM idempotency_records
      WHERE key = $1 AND scope = $2
    `;
    const findRes = await q.query(findSql, [key, scope]);
    if (findRes.rows.length === 0) {
      // Rare race condition: row deleted between insert and select
      return { claimed: false };
    }

    return {
      claimed: false,
      existingRecord: this.mapRow(findRes.rows[0])
    };
  }

  async complete(
    key: string,
    scope: string,
    responseStatus: number,
    responseBody: any,
    client?: PoolClient
  ): Promise<void> {
    const q = client || pool;
    const sql = `
      UPDATE idempotency_records
      SET status = 'COMPLETED',
          response_status = $1,
          response_body = $2,
          updated_at = NOW()
      WHERE key = $3 AND scope = $4
    `;
    await q.query(sql, [responseStatus, JSON.stringify(responseBody), key, scope]);
  }

  async fail(key: string, scope: string, client?: PoolClient): Promise<void> {
    const q = client || pool;
    // Remove failed/incomplete reservation attempts so clients can retry safely
    const sql = `
      DELETE FROM idempotency_records
      WHERE key = $1 AND scope = $2 AND status = 'PROCESSING'
    `;
    await q.query(sql, [key, scope]);
  }

  private mapRow(row: any): IdempotencyRecord {
    return {
      key: row.key,
      scope: row.scope,
      actor_id: row.actor_id,
      request_hash: row.request_hash,
      status: row.status as IdempotencyStatus,
      response_status: row.response_status ? parseInt(row.response_status, 10) : null,
      response_body: row.response_body,
      created_at: row.created_at,
      updated_at: row.updated_at,
      expires_at: row.expires_at
    };
  }
}

export const idempotencyRepository = new IdempotencyRepository();
