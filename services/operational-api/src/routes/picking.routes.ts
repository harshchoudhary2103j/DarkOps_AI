import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { pickingService } from '../services/picking.service';
import { idempotencyService } from '../services/idempotency.service';
import {
  ListPickingTasksQuerySchema,
  StartPickingTaskSchema,
  ConfirmPickItemSchema,
  ReportPickExceptionSchema,
  FailPickingTaskSchema
} from '../domain/order.schemas';
import { IdempotencyKeyHeaderSchema } from '../domain/inventory.schemas';

export const pickingRouter = Router();

function getIdempotencyKey(req: AuthenticatedRequest): string | undefined {
  const rawKey = req.headers['idempotency-key'];
  if (!rawKey) return undefined;
  return IdempotencyKeyHeaderSchema.parse(rawKey);
}

// -----------------------------------------------------------------------------
// GET /api/v1/picking/tasks - List Picking Tasks
// -----------------------------------------------------------------------------
pickingRouter.get('/tasks', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const query = ListPickingTasksQuerySchema.parse(req.query);
    const result = await pickingService.listTasks(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// GET /api/v1/picking/tasks/:taskId - Get Picking Task Details with Items
// -----------------------------------------------------------------------------
pickingRouter.get('/tasks/:taskId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { taskId } = req.params;
    const task = await pickingService.getTaskById(taskId);
    res.status(200).json({ data: task });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// POST /api/v1/picking/tasks/:taskId/start - Start Picking Task
// -----------------------------------------------------------------------------
pickingRouter.post('/tasks/:taskId/start', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { taskId } = req.params;
    const validated = StartPickingTaskSchema.parse(req.body || {});
    const idempotencyKey = getIdempotencyKey(req);

    if (idempotencyKey) {
      const result = await idempotencyService.executeIdempotent(
        idempotencyKey,
        'picking:start',
        req.actorId || 'picker',
        { taskId, ...validated },
        async () => {
          const task = await pickingService.startTask(
            taskId,
            validated.picker_id,
            req.actorId || 'picker',
            req.correlationId
          );
          return { statusCode: 200, data: task };
        }
      );
      return res.status(result.statusCode).json({ data: result.data });
    }

    const task = await pickingService.startTask(
      taskId,
      validated.picker_id,
      req.actorId || 'picker',
      req.correlationId
    );
    res.status(200).json({ data: task });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// POST /api/v1/picking/tasks/:taskId/items/:itemId/confirm - Confirm Pick Item
// -----------------------------------------------------------------------------
pickingRouter.post(
  '/tasks/:taskId/items/:itemId/confirm',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { taskId, itemId } = req.params;
      const validated = ConfirmPickItemSchema.parse(req.body);
      const idempotencyKey = getIdempotencyKey(req);

      if (idempotencyKey) {
        const result = await idempotencyService.executeIdempotent(
          idempotencyKey,
          'picking:confirm-item',
          req.actorId || 'picker',
          { taskId, itemId, ...validated },
          async () => {
            const outcome = await pickingService.confirmPickItem(
              taskId,
              itemId,
              validated.picked_quantity,
              req.actorId || 'picker',
              req.correlationId,
              idempotencyKey
            );
            return { statusCode: 200, data: outcome };
          }
        );
        return res.status(result.statusCode).json({ data: result.data });
      }

      const outcome = await pickingService.confirmPickItem(
        taskId,
        itemId,
        validated.picked_quantity,
        req.actorId || 'picker',
        req.correlationId
      );
      res.status(200).json({ data: outcome });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------------------
// POST /api/v1/picking/tasks/:taskId/items/:itemId/report-exception
// -----------------------------------------------------------------------------
pickingRouter.post(
  '/tasks/:taskId/items/:itemId/report-exception',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { taskId, itemId } = req.params;
      const validated = ReportPickExceptionSchema.parse(req.body);
      const idempotencyKey = getIdempotencyKey(req);

      if (idempotencyKey) {
        const result = await idempotencyService.executeIdempotent(
          idempotencyKey,
          'picking:exception-item',
          req.actorId || 'picker',
          { taskId, itemId, ...validated },
          async () => {
            const outcome = await pickingService.reportItemException(
              taskId,
              itemId,
              validated.exception_type,
              validated.quantity,
              validated.reason,
              req.actorId || 'picker',
              req.correlationId
            );
            return { statusCode: 200, data: outcome };
          }
        );
        return res.status(result.statusCode).json({ data: result.data });
      }

      const outcome = await pickingService.reportItemException(
        taskId,
        itemId,
        validated.exception_type,
        validated.quantity,
        validated.reason,
        req.actorId || 'picker',
        req.correlationId
      );
      res.status(200).json({ data: outcome });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------------------
// POST /api/v1/picking/tasks/:taskId/fail - Fail Picking Task
// -----------------------------------------------------------------------------
pickingRouter.post('/tasks/:taskId/fail', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { taskId } = req.params;
    const validated = FailPickingTaskSchema.parse(req.body);
    const idempotencyKey = getIdempotencyKey(req);

    if (idempotencyKey) {
      const result = await idempotencyService.executeIdempotent(
        idempotencyKey,
        'picking:fail',
        req.actorId || 'picker',
        { taskId, ...validated },
        async () => {
          const outcome = await pickingService.failTask(
            taskId,
            validated.reason,
            req.actorId || 'picker',
            req.correlationId
          );
          return { statusCode: 200, data: outcome };
        }
      );
      return res.status(result.statusCode).json({ data: result.data });
    }

    const outcome = await pickingService.failTask(
      taskId,
      validated.reason,
      req.actorId || 'picker',
      req.correlationId
    );
    res.status(200).json({ data: outcome });
  } catch (error) {
    next(error);
  }
});
