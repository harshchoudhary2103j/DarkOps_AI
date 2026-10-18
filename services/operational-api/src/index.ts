import { createApp } from './app';
import { closePool } from './database/db';
import { runMigrations } from './database/migrate';

async function executeMigrationsWithRetry(maxRetries = 10, delayMs = 3000): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[operational-api] Attempting database migrations (attempt ${attempt}/${maxRetries})...`);
      const applied = await runMigrations();
      console.log(`[operational-api] Migrations completed successfully. Applied ${applied.length} new migration(s).`);
      return;
    } catch (err: any) {
      console.warn(`[operational-api] Migration attempt ${attempt} failed: ${err.message}`);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        console.error('[operational-api] All migration attempts exhausted. Database may be initializing or unreachable.');
      }
    }
  }
}

async function bootstrap() {
  const app = createApp();
  const port = Number(process.env.PORT || 3000);
  const host = '0.0.0.0';

  const server = app.listen(port, host, () => {
    console.log(`[operational-api] Server listening on http://${host}:${port}`);
  });

  if (process.env.AUTO_MIGRATE === 'true') {
    executeMigrationsWithRetry().catch((err) => {
      console.error('[operational-api] Background migration error:', err);
    });
  }

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
