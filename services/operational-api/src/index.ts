import { createApp } from './app';
import { closePool } from './database/db';
import { runMigrations } from './database/migrate';

async function bootstrap() {
  if (process.env.AUTO_MIGRATE === 'true') {
    console.log('[operational-api] AUTO_MIGRATE=true, executing database migrations...');
    try {
      const applied = await runMigrations();
      console.log(`[operational-api] Migrations completed. Applied ${applied.length} new migration(s).`);
    } catch (err) {
      console.error('[operational-api] Migration failed during startup:', err);
      // In production, continue or exit depending on config; let's log and exit if migration fails
      process.exit(1);
    }
  }

  const app = createApp();
  const port = Number(process.env.PORT || 3000);
  const host = '0.0.0.0';

  const server = app.listen(port, host, () => {
    console.log(`[operational-api] Server listening on http://${host}:${port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`[operational-api] ${signal} received, shutting down gracefully...`);
    server.close(async () => {
      await closePool();
      console.log('[operational-api] Resources closed. Process terminated.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('[operational-api] Fatal bootstrap error:', err);
  process.exit(1);
});
