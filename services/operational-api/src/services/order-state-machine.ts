import { OrderStatus, PickingTaskStatus, PickItemStatus } from '../domain/order.types';
import {
  InvalidOrderStateTransitionError,
  InvalidPickingTaskStateTransitionError
} from './order-errors';

const VALID_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ['ALLOCATION_PENDING', 'CANCELLED'],
  ALLOCATION_PENDING: ['ALLOCATED', 'FAILED', 'CANCELLED'],
  ALLOCATED: ['PICKING', 'CANCELLED'],
  PICKING: ['PICKED', 'CANCELLED', 'FAILED'],
  PICKED: ['READY'],
  READY: [],
  CANCELLED: [],
  FAILED: []
};

const VALID_PICKING_TASK_TRANSITIONS: Record<PickingTaskStatus, PickingTaskStatus[]> = {
  PENDING: ['IN_PROGRESS', 'FAILED'],
  IN_PROGRESS: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: []
};

export class OrderStateMachine {
  /**
   * Validates whether an order can transition from currentStatus to nextStatus.
   * Throws InvalidOrderStateTransitionError if prohibited.
   */
  static validateOrderTransition(
    orderId: string,
    currentStatus: OrderStatus,
    nextStatus: OrderStatus
  ): void {
    if (currentStatus === nextStatus) {
      // Idempotent self-transition allowed
      return;
    }

    const allowed = VALID_ORDER_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(nextStatus)) {
      throw new InvalidOrderStateTransitionError(
        `Invalid order status transition from '${currentStatus}' to '${nextStatus}' for order '${orderId}'`,
        {
          order_id: orderId,
          current_status: currentStatus,
          target_status: nextStatus,
          allowed_transitions: allowed
        }
      );
    }
  }

  /**
   * Validates picking task transitions.
   */
  static validatePickingTaskTransition(
    taskId: string,
    currentStatus: PickingTaskStatus,
    nextStatus: PickingTaskStatus
  ): void {
    if (currentStatus === nextStatus) {
      return;
    }

    const allowed = VALID_PICKING_TASK_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(nextStatus)) {
      throw new InvalidPickingTaskStateTransitionError(
        `Invalid picking task status transition from '${currentStatus}' to '${nextStatus}' for task '${taskId}'`,
        {
          task_id: taskId,
          current_status: currentStatus,
          target_status: nextStatus,
          allowed_transitions: allowed
        }
      );
    }
  }
}
