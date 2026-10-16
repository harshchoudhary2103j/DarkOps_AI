import { PoolClient } from 'pg';
import { pool } from '../database/db';
import { CatalogAuditEvent } from '../domain/types';

export class AuditRepository {
  async record(event: CatalogAuditEvent, client?: PoolClient): Promise<void> {
    const queryExecutor = client || pool;
    const sql = `
      INSERT INTO catalog_audit_events (id, entity_type, entity_id, action, actor_id, change_summary, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    await queryExecutor.query(sql, [
      event.id,
      event.entity_type,
      event.entity_id,
      event.action,
      event.actor_id,
      JSON.stringify(event.change_summary),
      event.created_at
    ]);
  }

  async findByEntity(entityType: string, entityId: string): Promise<CatalogAuditEvent[]> {
    const sql = `
      SELECT id, entity_type, entity_id, action, actor_id, change_summary, created_at
      FROM catalog_audit_events
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY created_at DESC
    `;
    const { rows } = await pool.query(sql, [entityType, entityId]);
    return rows;
  }
}

export const auditRepository = new AuditRepository();
