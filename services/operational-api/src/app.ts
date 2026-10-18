import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { correlationMiddleware } from './middleware/auth.middleware';
import { errorHandler } from './middleware/error.middleware';
import { storeRouter } from './routes/store.routes';
import { serviceZoneRouter } from './routes/service-zone.routes';
import { productRouter } from './routes/product.routes';
import { skuRouter } from './routes/sku.routes';
import { supplierRouter } from './routes/supplier.routes';
import { warehouseLayoutRouter } from './routes/warehouse-layout.routes';
import { inventoryRouter } from './routes/inventory.routes';
import { orderRouter } from './routes/order.routes';
import { pickingRouter } from './routes/picking.routes';
import { simulationRouter, evaluationRouter } from './routes/evaluation.routes';
import { copilotRouter } from './routes/copilot.routes';
import { pool } from './database/db';

export function createApp(): Express {
  const app = express();

  // Cross-origin and JSON body parsing
  const rawCorsOrigin = process.env.CORS_ORIGIN;
  const corsOrigin =
    !rawCorsOrigin || rawCorsOrigin === '*'
      ? '*'
      : rawCorsOrigin.includes(',')
        ? rawCorsOrigin.split(',').map((o) => o.trim())
        : rawCorsOrigin;

  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json());

  // Distributed correlation ID middleware
  app.use(correlationMiddleware);

  // Health-check (Liveness) probe
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'operational-api',
      timestamp: new Date().toISOString()
    });
  });

  // Readiness probe verifying database connectivity
  app.get('/readyz', async (_req: Request, res: Response) => {
    try {
      await pool.query('SELECT 1');
      res.status(200).json({
        status: 'ready',
        service: 'operational-api',
        database: 'connected',
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(503).json({
        status: 'not_ready',
        service: 'operational-api',
        database: 'disconnected',
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Metrics endpoint for basic service telemetry
  app.get('/metrics', async (_req: Request, res: Response) => {
    try {
      const dbStats = {
        totalConnections: pool.totalCount,
        idleConnections: pool.idleCount,
        waitingClients: pool.waitingCount
      };
      res.status(200).json({
        service: 'operational-api',
        uptimeSeconds: Math.floor(process.uptime()),
        memoryUsage: process.memoryUsage(),
        dbPool: dbStats,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // REST API v1 Resource Families
  app.use('/api/v1/stores', storeRouter);
  app.use('/api/v1/service-zones', serviceZoneRouter);
  app.use('/api/v1/products', productRouter);
  app.use('/api/v1/skus', skuRouter);
  app.use('/api/v1/suppliers', supplierRouter);
  app.use('/api/v1/warehouse-layouts', warehouseLayoutRouter);
  app.use('/api/v1/inventory', inventoryRouter);
  app.use('/api/v1/orders', orderRouter);
  app.use('/api/v1/picking', pickingRouter);
  app.use('/api/v1/simulation', simulationRouter);
  app.use('/api/v1/evaluation', evaluationRouter);
  app.use('/api/v1/copilot', copilotRouter);

  // Fallback for unhandled 404 endpoints
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: {
        code: 'ENDPOINT_NOT_FOUND',
        message: `Endpoint ${req.method} ${req.path} not found`,
        correlationId: (req as any).correlationId
      }
    });
  });

  // Standardized Error Handler (ADR-003)
  app.use(errorHandler);

  return app;
}
