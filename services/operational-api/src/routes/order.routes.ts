import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { orderService } from '../services/order.service';
import { idempotencyService } from '../services/idempotency.service';
import {
  CreateOrderSchema,
  CancelOrderSchema,
  ListOrdersQuerySchema
} from '../domain/order.schemas';
import { IdempotencyKeyHeaderSchema } from '../domain/inventory.schemas';

export const orderRouter = Router();

function getIdempotencyKey(req: AuthenticatedRequest): string | undefined {
  const rawKey = req.headers['idempotency-key'];
  if (!rawKey) return undefined;
  return IdempotencyKeyHeaderSchema.parse(rawKey);
}

// -----------------------------------------------------------------------------
// POST /api/v1/orders - Create Order
// -----------------------------------------------------------------------------
orderRouter.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const validated = CreateOrderSchema.parse(req.body);
    const idempotencyKey = getIdempotencyKey(req);

    if (idempotencyKey) {
      const result = await idempotencyService.executeIdempotent(
        idempotencyKey,
        'orders:create',
        req.actorId || 'customer',
        validated,
        async () => {
          const order = await orderService.createOrder(
            validated,
            req.actorId || 'customer',
            req.correlationId
          );
          return { statusCode: 201, data: order };
        }
      );
      return res.status(result.statusCode).json({ data: result.data });
    }

    const order = await orderService.createOrder(
      validated,
      req.actorId || 'customer',
      req.correlationId
    );
    res.status(201).json({ data: order });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// GET /api/v1/orders - List Orders
// -----------------------------------------------------------------------------
orderRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const query = ListOrdersQuerySchema.parse(req.query);
    const result = await orderService.listOrders(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// GET /api/v1/orders/:orderId - Get Order Details with Lines & Events
// -----------------------------------------------------------------------------
orderRouter.get('/:orderId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params;
    const order = await orderService.getOrderById(orderId);
    res.status(200).json({ data: order });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// POST /api/v1/orders/:orderId/allocate - Allocate Order
// -----------------------------------------------------------------------------
orderRouter.post('/:orderId/allocate', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params;
    const idempotencyKey = getIdempotencyKey(req);

    if (idempotencyKey) {
      const result = await idempotencyService.executeIdempotent(
        idempotencyKey,
        'orders:allocate',
        req.actorId || 'system',
        { orderId },
        async () => {
          const order = await orderService.allocateOrder(
            orderId,
            req.actorId || 'system',
            req.correlationId,
            idempotencyKey
          );
          return { statusCode: 200, data: order };
        }
      );
      return res.status(result.statusCode).json({ data: result.data });
    }

    const order = await orderService.allocateOrder(
      orderId,
      req.actorId || 'system',
      req.correlationId
    );
    res.status(200).json({ data: order });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// POST /api/v1/orders/:orderId/cancel - Cancel Order
// -----------------------------------------------------------------------------
orderRouter.post('/:orderId/cancel', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params;
    const validated = CancelOrderSchema.parse(req.body || {});
    const idempotencyKey = getIdempotencyKey(req);

    if (idempotencyKey) {
      const result = await idempotencyService.executeIdempotent(
        idempotencyKey,
        'orders:cancel',
        req.actorId || 'customer',
        { orderId, ...validated },
        async () => {
          const order = await orderService.cancelOrder(
            orderId,
            validated.reason,
            req.actorId || 'customer',
            req.correlationId
          );
          return { statusCode: 200, data: order };
        }
      );
      return res.status(result.statusCode).json({ data: result.data });
    }

    const order = await orderService.cancelOrder(
      orderId,
      validated.reason,
      req.actorId || 'customer',
      req.correlationId
    );
    res.status(200).json({ data: order });
  } catch (error) {
    next(error);
  }
});
