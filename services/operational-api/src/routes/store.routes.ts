import { Router, Response, NextFunction } from 'express';
import { catalogService, NotFoundError } from '../services/catalog.service';
import { CreateStoreSchema, UpdateStoreSchema, PaginationQuerySchema, EntityIdParamSchema, StoreStatusSchema } from '../domain/schemas';
import { adminAuthGuard, AuthenticatedRequest } from '../middleware/auth.middleware';

export const storeRouter = Router();

// POST /api/v1/stores
storeRouter.post('/', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const validated = CreateStoreSchema.parse(req.body);
    const store = await catalogService.createStore(validated, req.actorId);
    res.status(201).json({ data: store });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/stores
storeRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pagination = PaginationQuerySchema.parse(req.query);
    const status = req.query.status ? StoreStatusSchema.parse(req.query.status) : undefined;
    const result = await catalogService.listStores(pagination, status);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/stores/:id
storeRouter.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = EntityIdParamSchema.parse(req.params);
    const store = await catalogService.getStore(id);
    if (!store) {
      throw new NotFoundError(`Store with ID '${id}' not found`);
    }
    res.status(200).json({ data: store });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/v1/stores/:id
storeRouter.patch('/:id', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = EntityIdParamSchema.parse(req.params);
    const validated = UpdateStoreSchema.parse(req.body);
    const updated = await catalogService.updateStore(id, validated, req.actorId);
    res.status(200).json({ data: updated });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/stores/:id
storeRouter.delete('/:id', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = EntityIdParamSchema.parse(req.params);
    const deleted = await catalogService.deleteStore(id, req.actorId);
    if (!deleted) {
      throw new NotFoundError(`Store with ID '${id}' not found`);
    }
    res.status(200).json({ data: { success: true, id } });
  } catch (error) {
    next(error);
  }
});
