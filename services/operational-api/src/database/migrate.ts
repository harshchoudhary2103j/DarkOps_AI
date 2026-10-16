import fs from 'fs';
import path from 'path';
import { pool, withTransaction } from './db';

export async function runMigrations(): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];

  try {
    // Ensure migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Determine migrations directory
    const candidates = [
      path.join(__dirname, 'migrations'),
      path.join(process.cwd(), 'src', 'database', 'migrations'),
      path.join(process.cwd(), 'services', 'operational-api', 'src', 'database', 'migrations'),
      path.resolve(__dirname, '..', '..', 'src', 'database', 'migrations')
    ];
    const migrationsDir = candidates.find(dir => fs.existsSync(dir));
    if (!migrationsDir) {
      console.warn('[operational-api:migrate] Migrations directory not found in candidate paths:', candidates);
      return applied;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const appliedSet = new Set(rows.map(r => r.version));

    for (const file of files) {
      if (!appliedSet.has(file)) {
        console.log(`[operational-api:migrate] Applying migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

        await withTransaction(async (txClient) => {
          await txClient.query(sql);
          await txClient.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        });

        applied.push(file);
        console.log(`[operational-api:migrate] Applied: ${file}`);
      }
    }

    if (applied.length === 0) {
      console.log('[operational-api:migrate] Schema is up to date.');
    }
  } finally {
    client.release();
  }

  return applied;
}

// Allow direct CLI invocation
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('[operational-api:migrate] Migration process finished successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[operational-api:migrate] Migration failed:', err);
      process.exit(1);
    });
}
