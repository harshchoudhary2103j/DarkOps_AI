import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  actorId?: string;
  correlationId?: string;
}

/**
 * Authentication and authorization middleware for administrative catalog mutations.
 * In Phase 01, validates authorization header / admin secret and extracts actor identity.
 */
export function adminAuthGuard(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const adminKey = req.headers['x-admin-key'];
  const actorHeader = req.headers['x-actor-id'];

  // Check if strict authentication is required (opt-in via REQUIRE_AUTH=true)
  const requireAuth = process.env.REQUIRE_AUTH === 'true';
  const expectedSecret = process.env.JWT_SECRET || 'development_jwt_secret_change_in_production_32chars_min';

  if (requireAuth) {
    let authorized = false;

    if (adminKey && adminKey === expectedSecret) {
      authorized = true;
    } else if (authHeader) {
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
      if (token === expectedSecret) {
        authorized = true;
      }
    }

    if (!authorized) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Administrative authorization is required for catalog mutations',
          correlationId: req.correlationId
        }
      });
      return;
    }
  }

  // Populate actor identity for audit logs
  req.actorId = (typeof actorHeader === 'string' && actorHeader.trim().length > 0)
    ? actorHeader
    : 'admin-system';

  next();
}

/**
 * Ensures correlation ID is present on all requests for distributed tracing.
 */
export function correlationMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const headerId = req.headers['x-correlation-id'];
  const correlationId = (typeof headerId === 'string' && headerId.trim().length > 0)
    ? headerId
    : require('crypto').randomUUID();

  req.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);
  next();
}
