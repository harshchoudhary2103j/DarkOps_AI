import { withTransaction } from '../database/db';
import { Order, OrderLine, OrderLifecycleEvent } from '../domain/order.types';
import { orderRepository } from '../repositories/order.repository';
import { orderLineRepository } from '../repositories/order-line.repository';
import { pickingTaskRepository } from '../repositories/picking-task.repository';
import { pickItemRepository } from '../repositories/pick-item.repository';
import { orderEventRepository } from '../repositories/order-event.repository';
import { orderAllocationService } from './order-allocation.service';
import { inventoryService } from './inventory.service';
import { OrderStateMachine } from './order-state-machine';
import {
  OrderNotFoundError,
  OrderCannotBeCancelledError,
  OrderAlreadyAllocatedError
} from './order-errors';
import crypto from 'crypto';

export class OrderService {
  /**
   * Creates an order with validated lines in 'CREATED' status.
   */
  async createOrder(
    input: {
      customer_id?: string;
      customer_latitude: number;
      customer_longitude: number;
      delivery_zone_id?: string;
      lines: Array<{ sku_id: string; quantity: number }>;
    },
    actorId: string = 'system',
    correlationId?: string
  ): Promise<Order> {
    return withTransaction(async (client) => {
      const orderId = crypto.randomUUID();
      const now = new Date().toISOString();
      const totalUnits = input.lines.reduce((sum, l) => sum + l.quantity, 0);

      const order: Order = {
        id: orderId,
        customer_id: input.customer_id || null,
        customer_latitude: input.customer_latitude,
        customer_longitude: input.customer_longitude,
        delivery_zone_id: input.delivery_zone_id || null,
        status: 'CREATED',
        line_count: input.lines.length,
        total_requested_units: totalUnits,
        version: 1,
        created_at: now,
        updated_at: now
      };

      const createdOrder = await orderRepository.create(order, client);

      const lines: OrderLine[] = input.lines.map((l) => ({
        id: crypto.randomUUID(),
        order_id: orderId,
        sku_id: l.sku_id,
        requested_quantity: l.quantity,
        reserved_quantity: 0,
        picked_quantity: 0,
        missing_quantity: 0,
        damaged_quantity: 0,
        status: 'PENDING',
        created_at: now,
        updated_at: now
      }));

      const createdLines = await orderLineRepository.createMany(lines, client);

      await orderEventRepository.create(
        {
          id: crypto.randomUUID(),
          order_id: orderId,
          event_type: 'ORDER_CREATED',
          from_status: null,
          to_status: 'CREATED',
          actor_id: actorId,
          payload: { line_count: lines.length, total_units: totalUnits },
          created_at: now
        },
        client
      );

      createdOrder.lines = createdLines;
      return createdOrder;
    });
  }

  /**
   * Triggers single-store candidate evaluation, basket inventory reservation,
   * and picking task generation.
   */
  async allocateOrder(
    orderId: string,
    actorId: string = 'system',
    correlationId?: string,
    idempotencyKey?: string
  ): Promise<Order> {
    // Acquire row-level lock on order
    const orderAndLines = await withTransaction(async (client) => {
      const order = await orderRepository.findByIdForUpdate(orderId, client);
      if (!order) {
        throw new OrderNotFoundError(`Order '${orderId}' not found`);
      }

      // Check idempotent replay if already allocated
      if (order.status === 'ALLOCATED') {
        const lines = await orderLineRepository.findByOrderId(orderId, client);
        order.lines = lines;
        return { order, lines, alreadyAllocated: true };
      }

      // Validate state transition
      OrderStateMachine.validateOrderTransition(orderId, order.status, 'ALLOCATION_PENDING');

      order.status = 'ALLOCATION_PENDING';
      await orderRepository.update(order, client);

      const lines = await orderLineRepository.findByOrderId(orderId, client);
      return { order, lines, alreadyAllocated: false };
    });

    if (orderAndLines.alreadyAllocated) {
      return orderAndLines.order;
    }

    // Delegate to allocation service
    const { order } = await orderAllocationService.allocate(
      orderAndLines.order,
      orderAndLines.lines,
      actorId,
      correlationId,
      idempotencyKey
    );

    return order;
  }

  /**
   * Cancels an order and releases any unconsumed reserved inventory.
   */
  async cancelOrder(
    orderId: string,
    reason?: string,
    actorId: string = 'system',
    correlationId?: string
  ): Promise<Order> {
    return withTransaction(async (client) => {
      const order = await orderRepository.findByIdForUpdate(orderId, client);
      if (!order) {
        throw new OrderNotFoundError(`Order '${orderId}' not found`);
      }

      // Idempotent cancellation
      if (order.status === 'CANCELLED') {
        order.lines = await orderLineRepository.findByOrderId(orderId, client);
        return order;
      }

      if (['PICKED', 'READY', 'FAILED'].includes(order.status)) {
        throw new OrderCannotBeCancelledError(
          `Cannot cancel order '${orderId}' with status '${order.status}'`,
          { order_id: orderId, current_status: order.status }
        );
      }

      OrderStateMachine.validateOrderTransition(orderId, order.status, 'CANCELLED');

      const lines = await orderLineRepository.findByOrderId(orderId, client);

      // Release unconsumed reserved stock if allocated
      if (['ALLOCATED', 'PICKING'].includes(order.status)) {
        for (const line of lines) {
          if (line.reservation_id) {
            const unconsumedQty = line.reserved_quantity - line.picked_quantity;
            if (unconsumedQty > 0) {
              await inventoryService.releaseReservation(
                {
                  reservation_id: line.reservation_id,
                  quantity: unconsumedQty,
                  reason: reason || 'Order cancellation'
                },
                actorId,
                correlationId,
                undefined,
                client
              );
            }
            line.status = 'CANCELLED';
            await orderLineRepository.update(line, client);
          }
        }

        // Cancel picking task if exists
        const task = await pickingTaskRepository.findByOrderId(orderId, client);
        if (task && (task.status === 'PENDING' || task.status === 'IN_PROGRESS')) {
          task.status = 'FAILED';
          task.failure_reason = reason || 'Order cancelled by customer/operator';
          await pickingTaskRepository.update(task, client);
        }
      }

      const prevStatus = order.status;
      order.status = 'CANCELLED';
      order.cancelled_at = new Date().toISOString();
      const updatedOrder = await orderRepository.update(order, client);

      await orderEventRepository.create(
        {
          id: crypto.randomUUID(),
          order_id: orderId,
          event_type: 'ORDER_CANCELLED',
          from_status: prevStatus,
          to_status: 'CANCELLED',
          actor_id: actorId,
          payload: { reason: reason || 'Order cancelled' },
          created_at: new Date().toISOString()
        },
        client
      );

      updatedOrder.lines = lines;
      return updatedOrder;
    });
  }

  async getOrderById(orderId: string): Promise<Order & { events: OrderLifecycleEvent[]; picking_task?: any }> {
    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw new OrderNotFoundError(`Order '${orderId}' not found`);
    }

    const lines = await orderLineRepository.findByOrderId(orderId);
    const events = await orderEventRepository.findByOrderId(orderId);
    const task = await pickingTaskRepository.findByOrderId(orderId);
    if (task) {
      task.items = await pickItemRepository.findByTaskId(task.id);
    }

    return {
      ...order,
      lines,
      events,
      picking_task: task || null
    };
  }

  async listOrders(params: {
    page?: number;
    limit?: number;
    status?: string;
    store_id?: string;
    customer_id?: string;
  }) {
    return orderRepository.findAll(params);
  }
}

export const orderService = new OrderService();
