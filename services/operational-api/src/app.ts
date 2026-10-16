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

export function createApp(): Express {
  const app = express();

  // Cross-origin and JSON body parsing
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*'
  }));
  app.use(express.json());

  // Distributed correlation ID middleware
  app.use(correlationMiddleware);

  // Health-check probe
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'operational-api',
      timestamp: new Date().toISOString()
    });
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
