import { Router, Response, NextFunction } from 'express';
import { catalogService, NotFoundError } from '../services/catalog.service';
import { CreateProductSchema, UpdateProductSchema, PaginationQuerySchema, EntityIdParamSchema } from '../domain/schemas';
import { adminAuthGuard, AuthenticatedRequest } from '../middleware/auth.middleware';

export const productRouter = Router();

// POST /api/v1/products
productRouter.post('/', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const validated = CreateProductSchema.parse(req.body);
    const product = await catalogService.createProduct({
      ...validated,
      description: validated.description ?? null
    }, req.actorId);
    res.status(201).json({ data: product });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/products
productRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pagination = PaginationQuerySchema.parse(req.query);
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const result = await catalogService.listProducts(pagination, category);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/products/:id
productRouter.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = EntityIdParamSchema.parse(req.params);
    const product = await catalogService.getProduct(id);
    if (!product) {
      throw new NotFoundError(`Product with ID '${id}' not found`);
    }
    res.status(200).json({ data: product });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/v1/products/:id
productRouter.patch('/:id', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = EntityIdParamSchema.parse(req.params);
    const validated = UpdateProductSchema.parse(req.body);
    const updated = await catalogService.updateProduct(id, validated, req.actorId);
    res.status(200).json({ data: updated });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/products/:id
productRouter.delete('/:id', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = EntityIdParamSchema.parse(req.params);
    const deleted = await catalogService.deleteProduct(id, req.actorId);
    if (!deleted) {
      throw new NotFoundError(`Product with ID '${id}' not found`);
    }
    res.status(200).json({ data: { success: true, id } });
  } catch (error) {
    next(error);
  }
});
