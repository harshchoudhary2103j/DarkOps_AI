import { createApp } from './app';
import { closePool } from './database/db';

const app = createApp();
const port = process.env.PORT || 3000;

const server = app.listen(port, () => {
  console.log(`[operational-api] Server listening on port ${port}`);
});

process.on('SIGTERM', () => {
  console.log('[operational-api] SIGTERM received, shutting down gracefully');
  server.close(async () => {
    await closePool();
    console.log('[operational-api] Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[operational-api] SIGINT received, shutting down gracefully');
  server.close(async () => {
    await closePool();
    console.log('[operational-api] Process terminated');
    process.exit(0);
  });
});
