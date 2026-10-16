import { Router, Response, NextFunction } from 'express';
import { catalogService, NotFoundError } from '../services/catalog.service';
import {
  CreateWarehouseLayoutSchema,
  PaginationQuerySchema,
  EntityIdParamSchema
} from '../domain/schemas';
import { adminAuthGuard, AuthenticatedRequest } from '../middleware/auth.middleware';

export const warehouseLayoutRouter = Router();

// POST /api/v1/warehouse-layouts
warehouseLayoutRouter.post('/', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const validated = CreateWarehouseLayoutSchema.parse(req.body);
    const layout = await catalogService.createWarehouseLayout(validated, req.actorId);
    res.status(201).json({ data: layout });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/warehouse-layouts/store/:storeId
warehouseLayoutRouter.get('/store/:storeId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId;
    const pagination = PaginationQuerySchema.parse(req.query);
    const result = await catalogService.listWarehouseLayouts(storeId, pagination);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/warehouse-layouts/store/:storeId/active
warehouseLayoutRouter.get('/store/:storeId/active', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId;
    const layout = await catalogService.getActiveWarehouseLayout(storeId);
    if (!layout) {
      throw new NotFoundError(`No active warehouse layout found for store '${storeId}'`);
    }
    res.status(200).json({ data: layout });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/warehouse-layouts/:id
warehouseLayoutRouter.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = EntityIdParamSchema.parse(req.params);
    const layout = await catalogService.getWarehouseLayout(id);
    if (!layout) {
      throw new NotFoundError(`Warehouse layout with ID '${id}' not found`);
    }
    res.status(200).json({ data: layout });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/warehouse-layouts/:id/activate
warehouseLayoutRouter.post('/:id/activate', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = EntityIdParamSchema.parse(req.params);
    const activated = await catalogService.activateWarehouseLayout(id, req.actorId);
    res.status(200).json({ data: activated });
  } catch (error) {
    next(error);
  }
});
