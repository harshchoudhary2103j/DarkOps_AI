import { pool, withTransaction } from '../database/db';
import { Order, OrderLine, PickingTask, PickItem } from '../domain/order.types';
import { storeRepository } from '../repositories/store.repository';
import { serviceZoneRepository } from '../repositories/service-zone.repository';
import { warehouseLayoutRepository } from '../repositories/warehouse-layout.repository';
import { orderRepository } from '../repositories/order.repository';
import { orderLineRepository } from '../repositories/order-line.repository';
import { pickingTaskRepository } from '../repositories/picking-task.repository';
import { pickItemRepository } from '../repositories/pick-item.repository';
import { orderEventRepository } from '../repositories/order-event.repository';
import { allocationWorkflowRepository } from '../repositories/allocation-workflow.repository';
import { inventoryService } from './inventory.service';
import { isPointInPolygon } from '../domain/polygon.utils';
import { NoEligibleStoreError, OrderAllocationFailedError } from './order-errors';
import crypto from 'crypto';

interface CandidateEvaluation {
  storeId: string;
  hasDirectZoneMatch: boolean;
  priorityScore: number;
}

export class OrderAllocationService {
  /**
   * Allocates an order to a single eligible store that can fulfill the entire requested basket.
   * Coordinates basket reservation, picking task generation, and failure recovery.
   */
  async allocate(
    order: Order,
    lines: OrderLine[],
    actorId: string = 'system',
    correlationId?: string,
    idempotencyKey?: string
  ): Promise<{ order: Order; pickingTask: PickingTask }> {
    const point = {
      latitude: order.customer_latitude,
      longitude: order.customer_longitude
    };

    // 1. Evaluate candidate stores by status and geographic eligibility
    const candidateStores = await this.findEligibleCandidateStores(point, order.delivery_zone_id);

    if (candidateStores.length === 0) {
      await withTransaction(async (client) => {
        order.status = 'FAILED';
        order.failure_code = 'NO_ELIGIBLE_STORE';
        order.failure_reason = 'No active store or service zone covers the customer delivery coordinates';
        await orderRepository.update(order, client);

        await orderEventRepository.create(
          {
            id: crypto.randomUUID(),
            order_id: order.id,
            event_type: 'ALLOCATION_FAILED',
            from_status: 'ALLOCATION_PENDING',
            to_status: 'FAILED',
            actor_id: actorId,
            payload: { reason: order.failure_reason, point },
            created_at: new Date().toISOString()
          },
          client
        );
      });

      throw new NoEligibleStoreError(
        `No active store or service zone services location (${point.latitude}, ${point.longitude})`,
        { latitude: point.latitude, longitude: point.longitude }
      );
    }

    // 2. Initialize workflow record
    const workflowId = crypto.randomUUID();
    let workflowRecord = await allocationWorkflowRepository.create({
      id: workflowId,
      order_id: order.id,
      candidate_store_id: candidateStores[0].storeId,
      status: 'EVALUATING',
      reserved_lines: [],
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const basketItems = lines.map((l) => ({
      sku_id: l.sku_id,
      quantity: l.requested_quantity
    }));

    // 3. Deterministic candidate evaluation
    for (const candidate of candidateStores) {
      try {
        workflowRecord.candidate_store_id = candidate.storeId;
        workflowRecord.status = 'RESERVING';
        workflowRecord = await allocationWorkflowRepository.update(workflowRecord);

        // Attempt atomic multi-SKU basket reservation in Inventory Core
        const reservations = await inventoryService.reserveBasket(
          {
            store_id: candidate.storeId,
            items: basketItems,
            external_reference: `order-${order.id}`
          },
          actorId,
          correlationId,
          idempotencyKey ? `${idempotencyKey}:res:${candidate.storeId}` : undefined
        );

        // Reservation succeeded! Finalize allocation atomically
        return await withTransaction(async (client) => {
          // Re-verify order row lock
          const lockedOrder = await orderRepository.findByIdForUpdate(order.id, client);
          if (!lockedOrder || lockedOrder.status !== 'ALLOCATION_PENDING') {
            // Compensate/release if order was concurrently altered
            for (const res of reservations) {
              await inventoryService.releaseReservation(
                { reservation_id: res.id, quantity: res.quantity, reason: 'Order allocation race cancellation' },
                actorId,
                correlationId,
                undefined,
                client
              );
            }
            throw new OrderAllocationFailedError(`Order '${order.id}' is no longer in ALLOCATION_PENDING state`);
          }

          // Map reservations to order lines
          const resBySku = new Map(reservations.map((r) => [r.sku_id, r]));
          for (const line of lines) {
            const res = resBySku.get(line.sku_id);
            if (res) {
              line.reservation_id = res.id;
              line.reserved_quantity = line.requested_quantity;
              line.status = 'ALLOCATED';
              await orderLineRepository.update(line, client);
            }
          }

          // Update order status
          lockedOrder.store_id = candidate.storeId;
          lockedOrder.status = 'ALLOCATED';
          lockedOrder.allocated_at = new Date().toISOString();
          const updatedOrder = await orderRepository.update(lockedOrder, client);

          // Find active warehouse layout for shelf locations
          const activeLayout = await warehouseLayoutRepository.findActiveByStoreId(candidate.storeId);
          const shelfNodes = activeLayout?.nodes?.filter((n) => n.type === 'SHELF') || [];

          // Generate initial picking task
          const taskId = crypto.randomUUID();
          const pickingTask: PickingTask = {
            id: taskId,
            order_id: order.id,
            store_id: candidate.storeId,
            status: 'PENDING',
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          const createdTask = await pickingTaskRepository.create(pickingTask, client);

          // Generate pick items
          const pickItems: PickItem[] = lines.map((line, idx) => {
            const assignedShelf = shelfNodes.length > 0 ? (shelfNodes[idx % shelfNodes.length].shelf_id || shelfNodes[idx % shelfNodes.length].id) : null;
            return {
              id: crypto.randomUUID(),
              picking_task_id: taskId,
              order_line_id: line.id,
              sku_id: line.sku_id,
              shelf_location: assignedShelf,
              requested_quantity: line.requested_quantity,
              confirmed_picked_quantity: 0,
              missing_quantity: 0,
              damaged_quantity: 0,
              status: 'PENDING',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
          });
          await pickItemRepository.createMany(pickItems, client);

          // Update workflow record to SUCCEEDED
          workflowRecord.status = 'SUCCEEDED';
          workflowRecord.reserved_lines = reservations.map((r) => ({
            sku_id: r.sku_id,
            reservation_id: r.id,
            quantity: r.quantity
          }));
          await allocationWorkflowRepository.update(workflowRecord, client);

          // Record lifecycle events
          await orderEventRepository.create(
            {
              id: crypto.randomUUID(),
              order_id: order.id,
              event_type: 'ORDER_ALLOCATED',
              from_status: 'ALLOCATION_PENDING',
              to_status: 'ALLOCATED',
              actor_id: actorId,
              payload: {
                store_id: candidate.storeId,
                reservations: workflowRecord.reserved_lines,
                picking_task_id: taskId
              },
              created_at: new Date().toISOString()
            },
            client
          );

          createdTask.items = pickItems;
          updatedOrder.lines = lines;

          return { order: updatedOrder, pickingTask: createdTask };
        });
      } catch (err: any) {
        // If reservation or validation failed for this candidate, log and try next candidate
        workflowRecord.error_message = `Candidate store '${candidate.storeId}' failed: ${err.message}`;
        await allocationWorkflowRepository.update(workflowRecord);
        // Continue to next candidate store
      }
    }

    // 4. All candidate stores failed
    await withTransaction(async (client) => {
      order.status = 'FAILED';
      order.failure_code = 'INSUFFICIENT_STOCK_ALL_CANDIDATES';
      order.failure_reason = 'None of the eligible candidate stores had sufficient stock for the complete basket';
      await orderRepository.update(order, client);

      workflowRecord.status = 'FAILED';
      workflowRecord.error_message = order.failure_reason;
      await allocationWorkflowRepository.update(workflowRecord, client);

      await orderEventRepository.create(
        {
          id: crypto.randomUUID(),
          order_id: order.id,
          event_type: 'ALLOCATION_FAILED',
          from_status: 'ALLOCATION_PENDING',
          to_status: 'FAILED',
          actor_id: actorId,
          payload: { reason: order.failure_reason },
          created_at: new Date().toISOString()
        },
        client
      );
    });

    throw new OrderAllocationFailedError(
      'Unable to allocate order: all eligible stores have insufficient inventory for the complete basket',
      { order_id: order.id, candidate_count: candidateStores.length }
    );
  }

  private async findEligibleCandidateStores(
    point: { latitude: number; longitude: number },
    deliveryZoneId?: string | null
  ): Promise<CandidateEvaluation[]> {
    const storesResult = await storeRepository.findAll({ page: 1, limit: 100 }, 'ACTIVE');
    const activeStores = storesResult.data;
    const candidates: CandidateEvaluation[] = [];

    for (const store of activeStores) {
      let isEligible = false;
      let hasDirectZoneMatch = false;

      // Check service zones belonging to this store
      const zones = await serviceZoneRepository.findByStoreId(store.id);
      const activeZones = zones.filter((z) => z.status === 'ACTIVE');

      if (deliveryZoneId) {
        const matchingZone = activeZones.find((z) => z.id === deliveryZoneId);
        if (matchingZone) {
          isEligible = true;
          hasDirectZoneMatch = true;
        }
      } else {
        for (const zone of activeZones) {
          if (isPointInPolygon(point, zone.boundary)) {
            isEligible = true;
            hasDirectZoneMatch = true;
            break;
          }
        }
      }

      // Check store general service area if not matched by specific zone
      if (!isEligible && store.service_area) {
        if (isPointInPolygon(point, store.service_area)) {
          isEligible = true;
        }
      }

      if (isEligible) {
        candidates.push({
          storeId: store.id,
          hasDirectZoneMatch,
          priorityScore: hasDirectZoneMatch ? 1 : 2
        });
      }
    }

    // Deterministic ordering:
    // 1. Direct active service-zone match (priorityScore = 1) over store boundary (priorityScore = 2)
    // 2. Stable tie-breaker: storeId ascending
    candidates.sort((a, b) => {
      if (a.priorityScore !== b.priorityScore) {
        return a.priorityScore - b.priorityScore;
      }
      return a.storeId.localeCompare(b.storeId);
    });

    return candidates;
  }
}

export const orderAllocationService = new OrderAllocationService();
