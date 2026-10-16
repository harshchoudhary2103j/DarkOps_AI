import { withTransaction } from '../database/db';
import { PickingTask, PickItem, Order } from '../domain/order.types';
import { pickingTaskRepository } from '../repositories/picking-task.repository';
import { pickItemRepository } from '../repositories/pick-item.repository';
import { orderRepository } from '../repositories/order.repository';
import { orderLineRepository } from '../repositories/order-line.repository';
import { orderEventRepository } from '../repositories/order-event.repository';
import { inventoryService } from './inventory.service';
import { OrderStateMachine } from './order-state-machine';
import {
  PickingTaskNotFoundError,
  PickItemNotFoundError,
  OrderNotFoundError,
  InvalidPickQuantityError,
  InvalidPickingTaskStateTransitionError
} from './order-errors';
import crypto from 'crypto';

export class PickingService {
  /**
   * Starts a picking task, transitions task to IN_PROGRESS and order to PICKING.
   */
  async startTask(
    taskId: string,
    pickerId?: string,
    actorId: string = 'system',
    correlationId?: string
  ): Promise<PickingTask> {
    return withTransaction(async (client) => {
      const task = await pickingTaskRepository.findByIdForUpdate(taskId, client);
      if (!task) {
        throw new PickingTaskNotFoundError(`Picking task '${taskId}' not found`);
      }

      OrderStateMachine.validatePickingTaskTransition(taskId, task.status, 'IN_PROGRESS');

      const order = await orderRepository.findByIdForUpdate(task.order_id, client);
      if (!order) {
        throw new OrderNotFoundError(`Order '${task.order_id}' not found`);
      }

      OrderStateMachine.validateOrderTransition(order.id, order.status, 'PICKING');

      task.status = 'IN_PROGRESS';
      task.assigned_picker_id = pickerId || task.assigned_picker_id || actorId;
      task.started_at = new Date().toISOString();
      const updatedTask = await pickingTaskRepository.update(task, client);

      order.status = 'PICKING';
      await orderRepository.update(order, client);

      await orderEventRepository.create(
        {
          id: crypto.randomUUID(),
          order_id: order.id,
          event_type: 'PICKING_STARTED',
          from_status: 'ALLOCATED',
          to_status: 'PICKING',
          actor_id: actorId,
          payload: { task_id: taskId, picker_id: task.assigned_picker_id },
          created_at: new Date().toISOString()
        },
        client
      );

      updatedTask.items = await pickItemRepository.findByTaskId(taskId, client);
      return updatedTask;
    });
  }

  /**
   * Confirms picked quantity for a specific pick item, consumes reserved inventory,
   * and auto-completes task and order when all items are picked.
   */
  async confirmPickItem(
    taskId: string,
    itemId: string,
    pickedQuantity: number,
    actorId: string = 'system',
    correlationId?: string,
    idempotencyKey?: string
  ): Promise<{ task: PickingTask; item: PickItem; order: Order }> {
    return withTransaction(async (client) => {
      const task = await pickingTaskRepository.findByIdForUpdate(taskId, client);
      if (!task) {
        throw new PickingTaskNotFoundError(`Picking task '${taskId}' not found`);
      }
      if (task.status !== 'IN_PROGRESS') {
        throw new InvalidPickingTaskStateTransitionError(
          `Cannot confirm pick for task '${taskId}' in status '${task.status}' (must be IN_PROGRESS)`
        );
      }

      const item = await pickItemRepository.findByIdForUpdate(itemId, client);
      if (!item || item.picking_task_id !== taskId) {
        throw new PickItemNotFoundError(`Pick item '${itemId}' not found in task '${taskId}'`);
      }

      const remainingToPick = item.requested_quantity - (item.confirmed_picked_quantity + item.missing_quantity + item.damaged_quantity);
      if (pickedQuantity <= 0 || pickedQuantity > remainingToPick) {
        throw new InvalidPickQuantityError(
          `Picked quantity (${pickedQuantity}) must be between 1 and remaining unpicked units (${remainingToPick})`,
          { requested: item.requested_quantity, remaining: remainingToPick, submitted: pickedQuantity }
        );
      }

      const orderLine = await orderLineRepository.findByIdForUpdate(item.order_line_id, client);
      if (!orderLine || !orderLine.reservation_id) {
        throw new Error(`Order line '${item.order_line_id}' or reservation reference missing`);
      }

      // Consume reserved stock atomically in Inventory Core
      await inventoryService.consumeReservation(
        {
          reservation_id: orderLine.reservation_id,
          quantity: pickedQuantity,
          reason: `Picking confirmed for item ${itemId}`
        },
        actorId,
        correlationId,
        idempotencyKey,
        client
      );

      // Update pick item
      item.confirmed_picked_quantity += pickedQuantity;
      const totalProcessed = item.confirmed_picked_quantity + item.missing_quantity + item.damaged_quantity;
      if (totalProcessed === item.requested_quantity) {
        item.status = (item.missing_quantity > 0 || item.damaged_quantity > 0) ? 'PARTIALLY_PICKED' : 'PICKED';
      } else {
        item.status = 'PARTIALLY_PICKED';
      }
      const updatedItem = await pickItemRepository.update(item, client);

      // Update order line
      orderLine.picked_quantity += pickedQuantity;
      orderLine.status = item.status;
      await orderLineRepository.update(orderLine, client);

      // Check if all items in this picking task are complete
      const allItems = await pickItemRepository.findByTaskId(taskId, client);
      const isTaskComplete = allItems.every((i) => {
        const itemObj = i.id === updatedItem.id ? updatedItem : i;
        const total = itemObj.confirmed_picked_quantity + itemObj.missing_quantity + itemObj.damaged_quantity;
        return total === itemObj.requested_quantity;
      });

      const order = await orderRepository.findByIdForUpdate(task.order_id, client);
      if (!order) {
        throw new OrderNotFoundError(`Order '${task.order_id}' not found`);
      }

      if (isTaskComplete) {
        task.status = 'COMPLETED';
        task.completed_at = new Date().toISOString();
        await pickingTaskRepository.update(task, client);

        order.status = 'READY';
        order.completed_at = new Date().toISOString();
        await orderRepository.update(order, client);

        await orderEventRepository.create(
          {
            id: crypto.randomUUID(),
            order_id: order.id,
            event_type: 'PICKING_COMPLETED',
            from_status: 'PICKING',
            to_status: 'READY',
            actor_id: actorId,
            payload: { task_id: taskId },
            created_at: new Date().toISOString()
          },
          client
        );
      }

      task.items = allItems.map((i) => (i.id === updatedItem.id ? updatedItem : i));
      return { task, item: updatedItem, order };
    });
  }

  /**
   * Reports an item exception (MISSING or DAMAGED), releases unfulfilled reserved stock
   * in Inventory Core, and marks task complete if all items finished.
   */
  async reportItemException(
    taskId: string,
    itemId: string,
    exceptionType: 'MISSING' | 'DAMAGED',
    quantity: number,
    reason?: string,
    actorId: string = 'system',
    correlationId?: string
  ): Promise<{ task: PickingTask; item: PickItem; order: Order }> {
    return withTransaction(async (client) => {
      const task = await pickingTaskRepository.findByIdForUpdate(taskId, client);
      if (!task) {
        throw new PickingTaskNotFoundError(`Picking task '${taskId}' not found`);
      }
      if (task.status !== 'IN_PROGRESS') {
        throw new InvalidPickingTaskStateTransitionError(
          `Cannot report exception for task '${taskId}' in status '${task.status}' (must be IN_PROGRESS)`
        );
      }

      const item = await pickItemRepository.findByIdForUpdate(itemId, client);
      if (!item || item.picking_task_id !== taskId) {
        throw new PickItemNotFoundError(`Pick item '${itemId}' not found in task '${taskId}'`);
      }

      const remaining = item.requested_quantity - (item.confirmed_picked_quantity + item.missing_quantity + item.damaged_quantity);
      if (quantity <= 0 || quantity > remaining) {
        throw new InvalidPickQuantityError(
          `Exception quantity (${quantity}) must be between 1 and remaining unpicked units (${remaining})`,
          { requested: item.requested_quantity, remaining, submitted: quantity }
        );
      }

      const orderLine = await orderLineRepository.findByIdForUpdate(item.order_line_id, client);
      if (!orderLine || !orderLine.reservation_id) {
        throw new Error(`Order line '${item.order_line_id}' or reservation reference missing`);
      }

      // Release unfulfilled reserved stock back to available inventory
      await inventoryService.releaseReservation(
        {
          reservation_id: orderLine.reservation_id,
          quantity,
          reason: reason || `Picking exception: ${exceptionType}`
        },
        actorId,
        correlationId,
        undefined,
        client
      );

      // Record exception on pick item
      if (exceptionType === 'MISSING') {
        item.missing_quantity += quantity;
      } else {
        item.damaged_quantity += quantity;
      }

      const totalProcessed = item.confirmed_picked_quantity + item.missing_quantity + item.damaged_quantity;
      if (totalProcessed === item.requested_quantity) {
        item.status = item.confirmed_picked_quantity > 0 ? 'PARTIALLY_PICKED' : exceptionType;
      } else {
        item.status = 'PARTIALLY_PICKED';
      }
      const updatedItem = await pickItemRepository.update(item, client);

      // Update order line
      if (exceptionType === 'MISSING') {
        orderLine.missing_quantity += quantity;
      } else {
        orderLine.damaged_quantity += quantity;
      }
      orderLine.status = orderLine.picked_quantity > 0 ? 'PARTIALLY_PICKED' : 'FAILED';
      await orderLineRepository.update(orderLine, client);

      // Check task completion
      const allItems = await pickItemRepository.findByTaskId(taskId, client);
      const isTaskComplete = allItems.every((i) => {
        const itemObj = i.id === updatedItem.id ? updatedItem : i;
        const total = itemObj.confirmed_picked_quantity + itemObj.missing_quantity + itemObj.damaged_quantity;
        return total === itemObj.requested_quantity;
      });

      const order = await orderRepository.findByIdForUpdate(task.order_id, client);
      if (!order) {
        throw new OrderNotFoundError(`Order '${task.order_id}' not found`);
      }

      if (isTaskComplete) {
        task.status = 'COMPLETED';
        task.completed_at = new Date().toISOString();
        await pickingTaskRepository.update(task, client);

        order.status = 'READY';
        order.completed_at = new Date().toISOString();
        await orderRepository.update(order, client);

        await orderEventRepository.create(
          {
            id: crypto.randomUUID(),
            order_id: order.id,
            event_type: 'PICKING_COMPLETED_WITH_EXCEPTIONS',
            from_status: 'PICKING',
            to_status: 'READY',
            actor_id: actorId,
            payload: { task_id: taskId, exception_item_id: itemId, exception_type: exceptionType, quantity },
            created_at: new Date().toISOString()
          },
          client
        );
      }

      task.items = allItems.map((i) => (i.id === updatedItem.id ? updatedItem : i));
      return { task, item: updatedItem, order };
    });
  }

  /**
   * Fails a picking task and releases all remaining reserved stock.
   */
  async failTask(
    taskId: string,
    reason: string,
    actorId: string = 'system',
    correlationId?: string
  ): Promise<{ task: PickingTask; order: Order }> {
    return withTransaction(async (client) => {
      const task = await pickingTaskRepository.findByIdForUpdate(taskId, client);
      if (!task) {
        throw new PickingTaskNotFoundError(`Picking task '${taskId}' not found`);
      }
      if (task.status === 'COMPLETED' || task.status === 'FAILED') {
        throw new InvalidPickingTaskStateTransitionError(
          `Cannot fail picking task '${taskId}' in status '${task.status}'`
        );
      }

      const order = await orderRepository.findByIdForUpdate(task.order_id, client);
      if (!order) {
        throw new OrderNotFoundError(`Order '${task.order_id}' not found`);
      }

      task.status = 'FAILED';
      task.failure_reason = reason;
      const updatedTask = await pickingTaskRepository.update(task, client);

      // Reconcile and release unconsumed reservations
      const lines = await orderLineRepository.findByOrderId(order.id, client);
      for (const line of lines) {
        if (line.reservation_id) {
          const unconsumed = line.reserved_quantity - line.picked_quantity;
          if (unconsumed > 0) {
            await inventoryService.releaseReservation(
              {
                reservation_id: line.reservation_id,
                quantity: unconsumed,
                reason: `Picking task failure: ${reason}`
              },
              actorId,
              correlationId,
              undefined,
              client
            );
          }
          line.status = 'FAILED';
          await orderLineRepository.update(line, client);
        }
      }

      order.status = 'FAILED';
      order.failure_code = 'PICKING_FAILED';
      order.failure_reason = reason;
      const updatedOrder = await orderRepository.update(order, client);

      await orderEventRepository.create(
        {
          id: crypto.randomUUID(),
          order_id: order.id,
          event_type: 'PICKING_FAILED',
          from_status: 'PICKING',
          to_status: 'FAILED',
          actor_id: actorId,
          payload: { task_id: taskId, reason },
          created_at: new Date().toISOString()
        },
        client
      );

      return { task: updatedTask, order: updatedOrder };
    });
  }

  async getTaskById(taskId: string): Promise<PickingTask> {
    const task = await pickingTaskRepository.findById(taskId);
    if (!task) {
      throw new PickingTaskNotFoundError(`Picking task '${taskId}' not found`);
    }
    task.items = await pickItemRepository.findByTaskId(taskId);
    return task;
  }

  async listTasks(params: {
    page?: number;
    limit?: number;
    status?: string;
    store_id?: string;
    assigned_picker_id?: string;
  }) {
    return pickingTaskRepository.findAll(params);
  }
}

export const pickingService = new PickingService();
