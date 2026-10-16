import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { DomainValidationError, NotFoundError } from '../services/catalog.service';
import {
  InsufficientStockError,
  ConcurrencyConflictError,
  IdempotencyKeyReusedError,
  InvalidReservationStateError,
  InventoryPositionNotFoundError,
  ReservationNotFoundError,
  ReplenishmentRecommendationNotFoundError
} from '../services/inventory-errors';
import { AuthenticatedRequest } from './auth.middleware';

export function errorHandler(
  err: any,
  req: AuthenticatedRequest,
  res: Response,
  _next: NextFunction
): void {
  const correlationId = req.correlationId || 'unknown';

  // 1. Zod Request Validation Error
  if (err instanceof ZodError) {
    const details = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message
    }));

    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload validation failed',
        details,
        correlationId
      }
    });
    return;
  }

  // 2. Inventory Specific Domain Errors
  if (err instanceof InsufficientStockError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        correlationId
      }
    });
    return;
  }

  if (err instanceof ConcurrencyConflictError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        correlationId
      }
    });
    return;
  }

  if (err instanceof IdempotencyKeyReusedError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        correlationId
      }
    });
    return;
  }

  if (err instanceof InvalidReservationStateError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        correlationId
      }
    });
    return;
  }

  if (
    err instanceof InventoryPositionNotFoundError ||
    err instanceof ReservationNotFoundError ||
    err instanceof ReplenishmentRecommendationNotFoundError
  ) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        correlationId
      }
    });
    return;
  }

  // 3. Catalog Domain Validation Error
  if (err instanceof DomainValidationError) {
    res.status(400).json({
      error: {
        code: 'DOMAIN_VALIDATION_ERROR',
        message: err.message,
        details: err.details,
        correlationId
      }
    });
    return;
  }

  // 4. Resource Not Found Error
  if (err instanceof NotFoundError) {
    res.status(404).json({
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: err.message,
        correlationId
      }
    });
    return;
  }

  // 5. PostgreSQL Specific Errors
  if (err && typeof err === 'object' && err.code) {
    // Unique violation (23505)
    if (err.code === '23505') {
      res.status(409).json({
        error: {
          code: 'RESOURCE_CONFLICT',
          message: 'A resource with this identifier or unique attribute already exists',
          correlationId
        }
      });
      return;
    }

    // Foreign key violation (23503)
    if (err.code === '23503') {
      res.status(409).json({
        error: {
          code: 'FOREIGN_KEY_VIOLATION',
          message: 'Referenced entity does not exist or is constrained by existing dependencies',
          correlationId
        }
      });
      return;
    }

    // Check constraint violation (23514)
    if (err.code === '23514') {
      res.status(400).json({
        error: {
          code: 'CHECK_CONSTRAINT_VIOLATION',
          message: 'Provided data violates database validation constraints',
          correlationId
        }
      });
      return;
    }
  }

  // 6. Default Internal Server Error
  console.error(`[Error] [Correlation: ${correlationId}]`, err);

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred',
      correlationId
    }
  });
}
