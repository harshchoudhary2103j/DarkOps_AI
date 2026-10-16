export class DomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;

  constructor(message: string, code: string, statusCode: number, details?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class OrderNotFoundError extends DomainError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'ORDER_NOT_FOUND', 404, details);
  }
}

export class OrderLineNotFoundError extends DomainError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'ORDER_LINE_NOT_FOUND', 404, details);
  }
}

export class PickingTaskNotFoundError extends DomainError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'PICKING_TASK_NOT_FOUND', 404, details);
  }
}

export class PickItemNotFoundError extends DomainError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'PICK_ITEM_NOT_FOUND', 404, details);
  }
}

export class InvalidOrderStateTransitionError extends DomainError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'INVALID_ORDER_STATE_TRANSITION', 409, details);
  }
}

export class InvalidPickingTaskStateTransitionError extends DomainError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'INVALID_PICKING_TASK_STATE_TRANSITION', 409, details);
  }
}

export class OrderAlreadyAllocatedError extends DomainError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'ORDER_ALREADY_ALLOCATED', 409, details);
  }
}

export class OrderAllocationFailedError extends DomainError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'ORDER_ALLOCATION_FAILED', 422, details);
  }
}

export class NoEligibleStoreError extends DomainError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'NO_ELIGIBLE_STORE', 422, details);
  }
}

export class InvalidPickQuantityError extends DomainError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'INVALID_PICK_QUANTITY', 400, details);
  }
}

export class OrderCannotBeCancelledError extends DomainError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'ORDER_CANNOT_BE_CANCELLED', 409, details);
  }
}
