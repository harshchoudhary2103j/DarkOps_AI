import { Router, Response, NextFunction } from 'express';
import { adminAuthGuard, AuthenticatedRequest } from '../middleware/auth.middleware';
import { inventoryPositionRepository } from '../repositories/inventory-position.repository';
import { inventoryMovementRepository } from '../repositories/inventory-movement.repository';
import { inventoryService } from '../services/inventory.service';
import { replenishmentService } from '../services/replenishment.service';
import { idempotencyService } from '../services/idempotency.service';
import {
  IdempotencyKeyHeaderSchema,
  InitializeInventorySchema,
  ReceiveStockSchema,
  AdjustStockSchema,
  ReserveStockSchema,
  ReleaseReservationSchema,
  ConsumeReservationSchema,
  GenerateRecommendationsSchema,
  DecisionRecommendationSchema,
  InventoryQuerySchema,
  MovementQuerySchema
} from '../domain/inventory.schemas';
import { InventoryPositionNotFoundError } from '../services/inventory-errors';

export const inventoryRouter = Router();

// Helper to validate and extract Idempotency-Key header
function requireIdempotencyKey(req: AuthenticatedRequest): string {
  const rawKey = req.headers['idempotency-key'];
  return IdempotencyKeyHeaderSchema.parse(rawKey);
}

// -----------------------------------------------------------------------------
// 1. Inventory Positions & Queries
// -----------------------------------------------------------------------------

// GET /api/v1/inventory
inventoryRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const query = InventoryQuerySchema.parse(req.query);
    const result = await inventoryPositionRepository.findAll(
      { page: query.page, limit: query.limit },
      {
        store_id: query.store_id,
        sku_id: query.sku_id,
        low_stock_only: query.low_stock_only
      }
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/inventory/:storeId/:skuId
inventoryRouter.get('/:storeId/:skuId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { storeId, skuId } = req.params;
    const position = await inventoryPositionRepository.findByStoreAndSku(storeId, skuId);
    if (!position) {
      throw new InventoryPositionNotFoundError(`Inventory position for store '${storeId}' and SKU '${skuId}' not found`);
    }
    res.status(200).json({ data: position });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// 2. Inventory Mutations with Durable Idempotency
// -----------------------------------------------------------------------------

// POST /api/v1/inventory/initialize
inventoryRouter.post('/initialize', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const idempotencyKey = requireIdempotencyKey(req);
    const validated = InitializeInventorySchema.parse(req.body);

    const result = await idempotencyService.executeIdempotent(
      idempotencyKey,
      'inventory:initialize',
      req.actorId || 'admin',
      validated,
      async () => {
        const position = await inventoryService.initializeInventory(
          validated,
          req.actorId,
          req.correlationId,
          idempotencyKey
        );
        return { statusCode: 201, data: position };
      }
    );

    res.status(result.statusCode).json({ data: result.data });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/inventory/receipts
inventoryRouter.post('/receipts', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const idempotencyKey = requireIdempotencyKey(req);
    const validated = ReceiveStockSchema.parse(req.body);

    const result = await idempotencyService.executeIdempotent(
      idempotencyKey,
      'inventory:receipts',
      req.actorId || 'admin',
      validated,
      async () => {
        const position = await inventoryService.receiveStock(
          validated,
          req.actorId,
          req.correlationId,
          idempotencyKey
        );
        return { statusCode: 200, data: position };
      }
    );

    res.status(result.statusCode).json({ data: result.data });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/inventory/adjustments
inventoryRouter.post('/adjustments', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const idempotencyKey = requireIdempotencyKey(req);
    const validated = AdjustStockSchema.parse(req.body);

    const result = await idempotencyService.executeIdempotent(
      idempotencyKey,
      'inventory:adjustments',
      req.actorId || 'admin',
      validated,
      async () => {
        const position = await inventoryService.adjustStock(
          validated,
          req.actorId,
          req.correlationId,
          idempotencyKey
        );
        return { statusCode: 200, data: position };
      }
    );

    res.status(result.statusCode).json({ data: result.data });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/inventory/reserve
inventoryRouter.post('/reserve', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const idempotencyKey = requireIdempotencyKey(req);
    const validated = ReserveStockSchema.parse(req.body);

    const result = await idempotencyService.executeIdempotent(
      idempotencyKey,
      'inventory:reserve',
      req.actorId || 'system',
      validated,
      async () => {
        const reservation = await inventoryService.reserveStock(
          validated,
          req.actorId,
          req.correlationId,
          idempotencyKey
        );
        return { statusCode: 201, data: reservation };
      }
    );

    res.status(result.statusCode).json({ data: result.data });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/inventory/release
inventoryRouter.post('/release', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const idempotencyKey = requireIdempotencyKey(req);
    const validated = ReleaseReservationSchema.parse(req.body);

    const result = await idempotencyService.executeIdempotent(
      idempotencyKey,
      'inventory:release',
      req.actorId || 'system',
      validated,
      async () => {
        const reservation = await inventoryService.releaseReservation(
          validated,
          req.actorId,
          req.correlationId,
          idempotencyKey
        );
        return { statusCode: 200, data: reservation };
      }
    );

    res.status(result.statusCode).json({ data: result.data });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/inventory/consume
inventoryRouter.post('/consume', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const idempotencyKey = requireIdempotencyKey(req);
    const validated = ConsumeReservationSchema.parse(req.body);

    const result = await idempotencyService.executeIdempotent(
      idempotencyKey,
      'inventory:consume',
      req.actorId || 'system',
      validated,
      async () => {
        const reservation = await inventoryService.consumeReservation(
          validated,
          req.actorId,
          req.correlationId,
          idempotencyKey
        );
        return { statusCode: 200, data: reservation };
      }
    );

    res.status(result.statusCode).json({ data: result.data });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// 3. Movement Ledger & Reconciliation
// -----------------------------------------------------------------------------

// GET /api/v1/inventory/movements
inventoryRouter.get('/movements', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const query = MovementQuerySchema.parse(req.query);
    const result = await inventoryMovementRepository.findAll(
      { page: query.page, limit: query.limit },
      {
        store_id: query.store_id,
        sku_id: query.sku_id,
        movement_type: query.movement_type
      }
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/inventory/reconcile/:storeId/:skuId
inventoryRouter.get('/reconcile/:storeId/:skuId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { storeId, skuId } = req.params;
    const report = await inventoryService.reconcile(storeId, skuId);
    res.status(200).json({ data: report });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// 4. Replenishment Recommendations
// -----------------------------------------------------------------------------

// GET /api/v1/inventory/recommendations
inventoryRouter.get('/recommendations', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const store_id = req.query.store_id as string | undefined;
    const sku_id = req.query.sku_id as string | undefined;
    const status = req.query.status as any | undefined;

    const result = await replenishmentService.list(
      { page, limit },
      { store_id, sku_id, status }
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/inventory/recommendations/generate
inventoryRouter.post('/recommendations/generate', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const validated = GenerateRecommendationsSchema.parse(req.body);
    const generated = await replenishmentService.generateRecommendations(
      validated.store_id,
      validated.safety_stock_factor,
      validated.lead_time_buffer_hours
    );
    res.status(201).json({ data: generated });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/inventory/recommendations/:id/approve
inventoryRouter.post('/recommendations/:id/approve', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const body = DecisionRecommendationSchema.parse(req.body || {});
    const approved = await replenishmentService.approve(id, req.actorId || 'admin', body.reason);
    res.status(200).json({ data: approved });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/inventory/recommendations/:id/reject
inventoryRouter.post('/recommendations/:id/reject', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const body = DecisionRecommendationSchema.parse(req.body || {});
    const rejected = await replenishmentService.reject(id, req.actorId || 'admin', body.reason);
    res.status(200).json({ data: rejected });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/inventory/recommendations/:id/execute
inventoryRouter.post('/recommendations/:id/execute', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const executed = await replenishmentService.execute(id, req.actorId || 'admin');
    res.status(200).json({ data: executed });
  } catch (error) {
    next(error);
  }
});
