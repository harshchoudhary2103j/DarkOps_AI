import { Router, Response, NextFunction } from 'express';
import { catalogService, NotFoundError } from '../services/catalog.service';
import {
  CreateSupplierSchema,
  UpdateSupplierSchema,
  CreateSupplierSKUSchema,
  PaginationQuerySchema,
  EntityIdParamSchema,
  SupplierStatusSchema
} from '../domain/schemas';
import { adminAuthGuard, AuthenticatedRequest } from '../middleware/auth.middleware';

export const supplierRouter = Router();

// POST /api/v1/suppliers
supplierRouter.post('/', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const validated = CreateSupplierSchema.parse(req.body);
    const supplier = await catalogService.createSupplier(validated, req.actorId);
    res.status(201).json({ data: supplier });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/suppliers
supplierRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pagination = PaginationQuerySchema.parse(req.query);
    const status = req.query.status ? SupplierStatusSchema.parse(req.query.status) : undefined;
    const result = await catalogService.listSuppliers(pagination, status);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/suppliers/:id
supplierRouter.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = EntityIdParamSchema.parse(req.params);
    const supplier = await catalogService.getSupplier(id);
    if (!supplier) {
      throw new NotFoundError(`Supplier with ID '${id}' not found`);
    }
    res.status(200).json({ data: supplier });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/v1/suppliers/:id
supplierRouter.patch('/:id', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = EntityIdParamSchema.parse(req.params);
    const validated = UpdateSupplierSchema.parse(req.body);
    const updated = await catalogService.updateSupplier(id, validated, req.actorId);
    res.status(200).json({ data: updated });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/suppliers/:id
supplierRouter.delete('/:id', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = EntityIdParamSchema.parse(req.params);
    const deleted = await catalogService.deleteSupplier(id, req.actorId);
    if (!deleted) {
      throw new NotFoundError(`Supplier with ID '${id}' not found`);
    }
    res.status(200).json({ data: { success: true, id } });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// Supplier-SKU Link Endpoints
// -----------------------------------------------------------------------------

// POST /api/v1/suppliers/:id/skus
supplierRouter.post('/:id/skus', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = EntityIdParamSchema.parse(req.params);
    const payload = { ...req.body, supplier_id: id };
    const validated = CreateSupplierSKUSchema.parse(payload);
    const link = await catalogService.linkSupplierSKU(validated, req.actorId);
    res.status(201).json({ data: link });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/suppliers/:id/skus
supplierRouter.get('/:id/skus', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = EntityIdParamSchema.parse(req.params);
    const links = await catalogService.listSupplierSKUs(id);
    res.status(200).json({ data: links });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/suppliers/:id/skus/:skuId
supplierRouter.delete('/:id/skus/:skuId', adminAuthGuard, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id: supplierId } = EntityIdParamSchema.parse(req.params);
    const skuId = req.params.skuId;
    const deleted = await catalogService.unlinkSupplierSKU(supplierId, skuId, req.actorId);
    if (!deleted) {
      throw new NotFoundError(`Supplier-SKU association between supplier '${supplierId}' and SKU '${skuId}' not found`);
    }
    res.status(200).json({ data: { success: true, supplier_id: supplierId, sku_id: skuId } });
  } catch (error) {
    next(error);
  }
});
