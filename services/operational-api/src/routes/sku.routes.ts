import { Router, Response, NextFunction } from 'express';
import { catalogService, NotFoundError } from '../services/catalog.service';
import { CreateSKUSchema, UpdateSKUSchema, PaginationQuerySchema, EntityIdParamSchema, SKUStatusSchema } from '../domain/schemas';
import { adminAuthGuard, AuthenticatedRequest } from '../middleware/auth.middleware';

export const skuRouter = Router();

// POST /api/v1/skus
skuRouter.post('/', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const validated = CreateSKUSchema.parse(req.body);
    const sku = await catalogService.createSKU(validated, req.actorId);
    res.status(201).json({ data: sku });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/skus
skuRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pagination = PaginationQuerySchema.parse(req.query);
    const productId = typeof req.query.product_id === 'string' ? req.query.product_id : undefined;
    const status = req.query.status ? SKUStatusSchema.parse(req.query.status) : undefined;
    const result = await catalogService.listSKUs(pagination, productId, status);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/skus/code/:code
skuRouter.get('/code/:code', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const skuCode = req.params.code;
    const sku = await catalogService.getSKUByCode(skuCode);
    if (!sku) {
      throw new NotFoundError(`SKU with code '${skuCode}' not found`);
    }
    res.status(200).json({ data: sku });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/skus/:id
skuRouter.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = EntityIdParamSchema.parse(req.params);
    const sku = await catalogService.getSKU(id);
    if (!sku) {
      throw new NotFoundError(`SKU with ID '${id}' not found`);
    }
    res.status(200).json({ data: sku });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/v1/skus/:id
skuRouter.patch('/:id', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = EntityIdParamSchema.parse(req.params);
    const validated = UpdateSKUSchema.parse(req.body);
    const updated = await catalogService.updateSKU(id, validated, req.actorId);
    res.status(200).json({ data: updated });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/skus/:id
skuRouter.delete('/:id', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = EntityIdParamSchema.parse(req.params);
    const deleted = await catalogService.deleteSKU(id, req.actorId);
    if (!deleted) {
      throw new NotFoundError(`SKU with ID '${id}' not found`);
    }
    res.status(200).json({ data: { success: true, id } });
  } catch (error) {
    next(error);
  }
});
