import { describe, it, expect } from 'vitest';
import { OrderStateMachine } from '../../src/services/order-state-machine';
import {
  InvalidOrderStateTransitionError,
  InvalidPickingTaskStateTransitionError
} from '../../src/services/order-errors';

describe('Order State Machine', () => {
  describe('Valid Order Transitions', () => {
    it('allows CREATED -> ALLOCATION_PENDING', () => {
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'CREATED', 'ALLOCATION_PENDING')
      ).not.toThrow();
    });

    it('allows ALLOCATION_PENDING -> ALLOCATED', () => {
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'ALLOCATION_PENDING', 'ALLOCATED')
      ).not.toThrow();
    });

    it('allows ALLOCATED -> PICKING', () => {
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'ALLOCATED', 'PICKING')
      ).not.toThrow();
    });

    it('allows PICKING -> PICKED', () => {
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'PICKING', 'PICKED')
      ).not.toThrow();
    });

    it('allows PICKED -> READY', () => {
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'PICKED', 'READY')
      ).not.toThrow();
    });

    it('allows pre-terminal states to transition to CANCELLED', () => {
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'CREATED', 'CANCELLED')
      ).not.toThrow();
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'ALLOCATION_PENDING', 'CANCELLED')
      ).not.toThrow();
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'ALLOCATED', 'CANCELLED')
      ).not.toThrow();
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'PICKING', 'CANCELLED')
      ).not.toThrow();
    });

    it('allows ALLOCATION_PENDING and PICKING to transition to FAILED', () => {
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'ALLOCATION_PENDING', 'FAILED')
      ).not.toThrow();
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'PICKING', 'FAILED')
      ).not.toThrow();
    });

    it('allows idempotent self-transitions', () => {
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'ALLOCATED', 'ALLOCATED')
      ).not.toThrow();
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'CANCELLED', 'CANCELLED')
      ).not.toThrow();
    });
  });

  describe('Prohibited Order Transitions (Direct Jumps & Terminal Violations)', () => {
    it('rejects direct jump CREATED -> ALLOCATED', () => {
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'CREATED', 'ALLOCATED')
      ).toThrow(InvalidOrderStateTransitionError);
    });

    it('rejects direct jump CREATED -> READY', () => {
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'CREATED', 'READY')
      ).toThrow(InvalidOrderStateTransitionError);
    });

    it('rejects direct jump ALLOCATED -> READY (bypassing picking)', () => {
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'ALLOCATED', 'READY')
      ).toThrow(InvalidOrderStateTransitionError);
    });

    it('rejects post-pick cancellation: PICKED -> CANCELLED', () => {
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'PICKED', 'CANCELLED')
      ).toThrow(InvalidOrderStateTransitionError);
    });

    it('rejects READY -> CANCELLED', () => {
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'READY', 'CANCELLED')
      ).toThrow(InvalidOrderStateTransitionError);
    });

    it('rejects any transition out of terminal CANCELLED state', () => {
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'CANCELLED', 'CREATED')
      ).toThrow(InvalidOrderStateTransitionError);
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'CANCELLED', 'ALLOCATED')
      ).toThrow(InvalidOrderStateTransitionError);
    });

    it('rejects any transition out of terminal FAILED state', () => {
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'FAILED', 'CREATED')
      ).toThrow(InvalidOrderStateTransitionError);
      expect(() =>
        OrderStateMachine.validateOrderTransition('order-1', 'FAILED', 'ALLOCATION_PENDING')
      ).toThrow(InvalidOrderStateTransitionError);
    });
  });

  describe('Picking Task State Machine', () => {
    it('allows valid task transitions', () => {
      expect(() =>
        OrderStateMachine.validatePickingTaskTransition('task-1', 'PENDING', 'IN_PROGRESS')
      ).not.toThrow();
      expect(() =>
        OrderStateMachine.validatePickingTaskTransition('task-1', 'IN_PROGRESS', 'COMPLETED')
      ).not.toThrow();
      expect(() =>
        OrderStateMachine.validatePickingTaskTransition('task-1', 'PENDING', 'FAILED')
      ).not.toThrow();
      expect(() =>
        OrderStateMachine.validatePickingTaskTransition('task-1', 'IN_PROGRESS', 'FAILED')
      ).not.toThrow();
    });

    it('rejects direct jump PENDING -> COMPLETED', () => {
      expect(() =>
        OrderStateMachine.validatePickingTaskTransition('task-1', 'PENDING', 'COMPLETED')
      ).toThrow(InvalidPickingTaskStateTransitionError);
    });

    it('rejects transition from terminal COMPLETED', () => {
      expect(() =>
        OrderStateMachine.validatePickingTaskTransition('task-1', 'COMPLETED', 'IN_PROGRESS')
      ).toThrow(InvalidPickingTaskStateTransitionError);
    });

    it('rejects transition from terminal FAILED', () => {
      expect(() =>
        OrderStateMachine.validatePickingTaskTransition('task-1', 'FAILED', 'PENDING')
      ).toThrow(InvalidPickingTaskStateTransitionError);
    });
  });
});
