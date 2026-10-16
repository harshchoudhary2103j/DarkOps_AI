import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://darkops_user:darkops_password@localhost:5432/darkops_db';

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[operational-api:db] Unexpected error on idle client', err);
});

export async function query<R extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<R>> {
  const start = Date.now();
  const res = await pool.query<R>(text, params);
  const duration = Date.now() - start;
  if (process.env.LOG_SQL === 'true') {
    console.log('[operational-api:db]', { text, duration, rows: res.rowCount });
  }
  return res;
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
