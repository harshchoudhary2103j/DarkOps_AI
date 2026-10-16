import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}));
app.use(express.json());

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'operational-api',
    timestamp: new Date().toISOString()
  });
});

const server = app.listen(port, () => {
  console.log(`[operational-api] Server listening on port ${port}`);
});

process.on('SIGTERM', () => {
  console.log('[operational-api] SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('[operational-api] Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[operational-api] SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('[operational-api] Process terminated');
    process.exit(0);
  });
});
