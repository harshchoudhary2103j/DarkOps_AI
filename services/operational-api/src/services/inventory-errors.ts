export class InsufficientStockError extends Error {
  public code = 'INSUFFICIENT_STOCK';
  public statusCode = 409;
  public details: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = 'InsufficientStockError';
    this.details = details;
  }
}

export class ConcurrencyConflictError extends Error {
  public code = 'CONCURRENCY_CONFLICT';
  public statusCode = 409;
  public details: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = 'ConcurrencyConflictError';
    this.details = details;
  }
}

export class IdempotencyKeyReusedError extends Error {
  public code = 'IDEMPOTENCY_KEY_REUSED';
  public statusCode = 409;
  public details: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = 'IdempotencyKeyReusedError';
    this.details = details;
  }
}

export class InvalidReservationStateError extends Error {
  public code = 'INVALID_RESERVATION_STATE';
  public statusCode = 400;
  public details: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = 'InvalidReservationStateError';
    this.details = details;
  }
}

export class InventoryPositionNotFoundError extends Error {
  public code = 'INVENTORY_POSITION_NOT_FOUND';
  public statusCode = 404;
  public details: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = 'InventoryPositionNotFoundError';
    this.details = details;
  }
}

export class ReservationNotFoundError extends Error {
  public code = 'RESERVATION_NOT_FOUND';
  public statusCode = 404;
  public details: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = 'ReservationNotFoundError';
    this.details = details;
  }
}

export class ReplenishmentRecommendationNotFoundError extends Error {
  public code = 'REPLENISHMENT_RECOMMENDATION_NOT_FOUND';
  public statusCode = 404;
  public details: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = 'ReplenishmentRecommendationNotFoundError';
    this.details = details;
  }
}
