import { Router, Response, NextFunction } from 'express';
import { catalogService, NotFoundError } from '../services/catalog.service';
import { CreateServiceZoneSchema, UpdateServiceZoneSchema, PaginationQuerySchema, EntityIdParamSchema, ServiceZoneStatusSchema } from '../domain/schemas';
import { adminAuthGuard, AuthenticatedRequest } from '../middleware/auth.middleware';

export const serviceZoneRouter = Router();

// POST /api/v1/service-zones
serviceZoneRouter.post('/', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const validated = CreateServiceZoneSchema.parse(req.body);
    const zone = await catalogService.createServiceZone(validated, req.actorId);
    res.status(201).json({ data: zone });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/service-zones
serviceZoneRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pagination = PaginationQuerySchema.parse(req.query);
    const storeId = typeof req.query.store_id === 'string' ? req.query.store_id : undefined;
    const status = req.query.status ? ServiceZoneStatusSchema.parse(req.query.status) : undefined;
    const result = await catalogService.listServiceZones(pagination, storeId, status);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/service-zones/:id
serviceZoneRouter.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = EntityIdParamSchema.parse(req.params);
    const zone = await catalogService.getServiceZone(id);
    if (!zone) {
      throw new NotFoundError(`Service zone with ID '${id}' not found`);
    }
    res.status(200).json({ data: zone });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/v1/service-zones/:id
serviceZoneRouter.patch('/:id', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = EntityIdParamSchema.parse(req.params);
    const validated = UpdateServiceZoneSchema.parse(req.body);
    const updated = await catalogService.updateServiceZone(id, validated, req.actorId);
    res.status(200).json({ data: updated });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/service-zones/:id
serviceZoneRouter.delete('/:id', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = EntityIdParamSchema.parse(req.params);
    const deleted = await catalogService.deleteServiceZone(id, req.actorId);
    if (!deleted) {
      throw new NotFoundError(`Service zone with ID '${id}' not found`);
    }
    res.status(200).json({ data: { success: true, id } });
  } catch (error) {
    next(error);
  }
});
