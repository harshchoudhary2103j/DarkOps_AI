import crypto from 'crypto';
import { PoolClient } from 'pg';
import { withTransaction } from '../database/db';
import {
  InventoryPosition,
  InventoryMovement,
  InventoryReservation,
  ReconciliationReport
} from '../domain/inventory.types';
import {
  InsufficientStockError,
  InvalidReservationStateError,
  InventoryPositionNotFoundError,
  ReservationNotFoundError
} from './inventory-errors';
import { inventoryPositionRepository } from '../repositories/inventory-position.repository';
import { inventoryMovementRepository } from '../repositories/inventory-movement.repository';
import { inventoryReservationRepository } from '../repositories/inventory-reservation.repository';
import { storeRepository } from '../repositories/store.repository';
import { skuRepository } from '../repositories/sku.repository';

export class InventoryService {
  /**
   * Initializes an inventory position for a store and SKU with opening balances.
   */
  async initializeInventory(
    input: {
      store_id: string;
      sku_id: string;
      initial_physical_on_hand: number;
      initial_reserved_stock: number;
      initial_incoming_units: number;
      reason?: string;
    },
    actorId: string = 'system',
    correlationId?: string,
    idempotencyKey?: string
  ): Promise<InventoryPosition> {
    // 1. Verify store and SKU exist
    const store = await storeRepository.findById(input.store_id);
    if (!store) {
      throw new InventoryPositionNotFoundError(`Referenced store '${input.store_id}' does not exist`);
    }
    const sku = await skuRepository.findById(input.sku_id);
    if (!sku) {
      throw new InventoryPositionNotFoundError(`Referenced SKU '${input.sku_id}' does not exist`);
    }

    return withTransaction(async (client) => {
      // Check existing position
      const existing = await inventoryPositionRepository.findByStoreAndSkuForUpdate(
        input.store_id,
        input.sku_id,
        client
      );
      if (existing) {
        return existing;
      }

      const now = new Date().toISOString();
      const positionId = crypto.randomUUID();

      const newPosition: InventoryPosition = {
        id: positionId,
        store_id: input.store_id,
        sku_id: input.sku_id,
        physical_on_hand: input.initial_physical_on_hand,
        reserved_stock: input.initial_reserved_stock,
        available_stock: input.initial_physical_on_hand - input.initial_reserved_stock,
        incoming_units: input.initial_incoming_units,
        version: 1,
        created_at: now,
        updated_at: now
      };

      const created = await inventoryPositionRepository.create(newPosition, client);

      // Record immutable opening stock ledger movement
      if (input.initial_physical_on_hand > 0) {
        const movement: InventoryMovement = {
          id: crypto.randomUUID(),
          store_id: input.store_id,
          sku_id: input.sku_id,
          movement_type: 'OPENING_STOCK',
          quantity: input.initial_physical_on_hand,
          reason: input.reason || 'Initial stock opening balance',
          actor_id: actorId,
          correlation_id: correlationId,
          idempotency_key: idempotencyKey,
          created_at: now
        };
        await inventoryMovementRepository.create(movement, client);
      }

      return created;
    });
  }

  /**
   * Records receipt of inbound goods, incrementing physical stock and decrementing incoming units.
   */
  async receiveStock(
    input: {
      store_id: string;
      sku_id: string;
      quantity: number;
      decrease_incoming?: boolean;
      reason?: string;
    },
    actorId: string = 'system',
    correlationId?: string,
    idempotencyKey?: string
  ): Promise<InventoryPosition> {
    return withTransaction(async (client) => {
      const position = await inventoryPositionRepository.findByStoreAndSkuForUpdate(
        input.store_id,
        input.sku_id,
        client
      );
      if (!position) {
        throw new InventoryPositionNotFoundError(
          `Inventory position for store '${input.store_id}' and SKU '${input.sku_id}' not found`
        );
      }

      position.physical_on_hand += input.quantity;
      if (input.decrease_incoming) {
        position.incoming_units = Math.max(0, position.incoming_units - input.quantity);
      }

      const updated = await inventoryPositionRepository.update(position, client);

      const movement: InventoryMovement = {
        id: crypto.randomUUID(),
        store_id: input.store_id,
        sku_id: input.sku_id,
        movement_type: 'RECEIPT',
        quantity: input.quantity,
        reason: input.reason || 'Inbound supplier receipt',
        actor_id: actorId,
        correlation_id: correlationId,
        idempotency_key: idempotencyKey,
        created_at: new Date().toISOString()
      };
      await inventoryMovementRepository.create(movement, client);

      return updated;
    });
  }

  /**
   * Applies manual stock adjustments (spoilage, shrinkage, audit counts).
   */
  async adjustStock(
    input: {
      store_id: string;
      sku_id: string;
      quantity: number;
      adjustment_type: 'POSITIVE' | 'NEGATIVE';
      reason: string;
    },
    actorId: string = 'system',
    correlationId?: string,
    idempotencyKey?: string
  ): Promise<InventoryPosition> {
    return withTransaction(async (client) => {
      const position = await inventoryPositionRepository.findByStoreAndSkuForUpdate(
        input.store_id,
        input.sku_id,
        client
      );
      if (!position) {
        throw new InventoryPositionNotFoundError(
          `Inventory position for store '${input.store_id}' and SKU '${input.sku_id}' not found`
        );
      }

      if (input.adjustment_type === 'POSITIVE') {
        position.physical_on_hand += input.quantity;
      } else {
        // Negative adjustment: verify physical stock does not drop below reserved stock commitments
        if (position.physical_on_hand - input.quantity < position.reserved_stock) {
          throw new InsufficientStockError(
            `Cannot adjust physical stock below current reserved commitments of ${position.reserved_stock} units`,
            {
              current_physical: position.physical_on_hand,
              reserved_stock: position.reserved_stock,
              requested_deduction: input.quantity,
              max_deductible: position.physical_on_hand - position.reserved_stock
            }
          );
        }
        position.physical_on_hand -= input.quantity;
      }

      const updated = await inventoryPositionRepository.update(position, client);

      const movement: InventoryMovement = {
        id: crypto.randomUUID(),
        store_id: input.store_id,
        sku_id: input.sku_id,
        movement_type: input.adjustment_type === 'POSITIVE' ? 'POSITIVE_ADJUSTMENT' : 'NEGATIVE_ADJUSTMENT',
        quantity: input.quantity,
        reason: input.reason,
        actor_id: actorId,
        correlation_id: correlationId,
        idempotency_key: idempotencyKey,
        created_at: new Date().toISOString()
      };
      await inventoryMovementRepository.create(movement, client);

      return updated;
    });
  }

  /**
   * Concurrency-safe stock reservation using row-level locking (SELECT ... FOR UPDATE).
   */
  async reserveStock(
    input: {
      store_id: string;
      sku_id: string;
      quantity: number;
      external_reference?: string;
      expires_in_minutes?: number;
    },
    actorId: string = 'system',
    correlationId?: string,
    idempotencyKey?: string
  ): Promise<InventoryReservation> {
    return withTransaction(async (client) => {
      // Row-level lock acquired on inventory_positions
      const position = await inventoryPositionRepository.findByStoreAndSkuForUpdate(
        input.store_id,
        input.sku_id,
        client
      );
      if (!position) {
        throw new InventoryPositionNotFoundError(
          `Inventory position for store '${input.store_id}' and SKU '${input.sku_id}' not found`
        );
      }

      const availableStock = position.physical_on_hand - position.reserved_stock;
      if (availableStock < input.quantity) {
        throw new InsufficientStockError(
          `Insufficient available stock for reservation. Requested: ${input.quantity}, Available: ${availableStock}`,
          {
            requested: input.quantity,
            available: availableStock,
            physical_on_hand: position.physical_on_hand,
            reserved_stock: position.reserved_stock,
            store_id: input.store_id,
            sku_id: input.sku_id
          }
        );
      }

      // Update position reserved stock
      position.reserved_stock += input.quantity;
      await inventoryPositionRepository.update(position, client);

      const now = new Date();
      const expiresAt = input.expires_in_minutes
        ? new Date(now.getTime() + input.expires_in_minutes * 60 * 1000).toISOString()
        : null;

      const reservationId = crypto.randomUUID();
      const reservation: InventoryReservation = {
        id: reservationId,
        store_id: input.store_id,
        sku_id: input.sku_id,
        quantity: input.quantity,
        remaining_quantity: input.quantity,
        status: 'ACTIVE',
        external_reference: input.external_reference || null,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        expires_at: expiresAt
      };

      const createdReservation = await inventoryReservationRepository.create(reservation, client);

      // Record immutable ledger movement
      const movement: InventoryMovement = {
        id: crypto.randomUUID(),
        store_id: input.store_id,
        sku_id: input.sku_id,
        movement_type: 'RESERVATION',
        quantity: input.quantity,
        reservation_id: reservationId,
        reason: 'Order stock reservation',
        actor_id: actorId,
        correlation_id: correlationId,
        idempotency_key: idempotencyKey,
        created_at: now.toISOString()
      };
      await inventoryMovementRepository.create(movement, client);

      return createdReservation;
    });
  }

  /**
   * Reserves multiple SKUs atomically for a whole basket.
   * Acquires row locks in deterministic SKU order to prevent deadlocks.
   */
  async reserveBasket(
    input: {
      store_id: string;
      items: Array<{ sku_id: string; quantity: number }>;
      external_reference?: string;
      expires_in_minutes?: number;
    },
    actorId: string = 'system',
    correlationId?: string,
    idempotencyKey?: string,
    existingClient?: PoolClient
  ): Promise<InventoryReservation[]> {
    const execute = async (client: PoolClient) => {
      // Sort items by SKU ID to prevent deadlock between concurrent baskets
      const sortedItems = [...input.items].sort((a, b) => a.sku_id.localeCompare(b.sku_id));
      const reservations: InventoryReservation[] = [];
      const positionsToUpdate: Array<{ position: InventoryPosition; quantity: number }> = [];

      // Phase 1: Lock and validate all SKUs
      for (const item of sortedItems) {
        const position = await inventoryPositionRepository.findByStoreAndSkuForUpdate(
          input.store_id,
          item.sku_id,
          client
        );
        if (!position) {
          throw new InventoryPositionNotFoundError(
            `Inventory position for store '${input.store_id}' and SKU '${item.sku_id}' not found`
          );
        }

        const available = position.physical_on_hand - position.reserved_stock;
        if (available < item.quantity) {
          throw new InsufficientStockError(
            `Insufficient available stock for SKU '${item.sku_id}'. Requested: ${item.quantity}, Available: ${available}`,
            {
              requested: item.quantity,
              available,
              store_id: input.store_id,
              sku_id: item.sku_id
            }
          );
        }

        positionsToUpdate.push({ position, quantity: item.quantity });
      }

      // Phase 2: Apply reservations and log movements
      const now = new Date();
      const expiresAt = input.expires_in_minutes
        ? new Date(now.getTime() + input.expires_in_minutes * 60 * 1000).toISOString()
        : null;

      for (const { position, quantity } of positionsToUpdate) {
        position.reserved_stock += quantity;
        await inventoryPositionRepository.update(position, client);

        const reservationId = crypto.randomUUID();
        const reservation: InventoryReservation = {
          id: reservationId,
          store_id: input.store_id,
          sku_id: position.sku_id,
          quantity,
          remaining_quantity: quantity,
          status: 'ACTIVE',
          external_reference: input.external_reference || null,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
          expires_at: expiresAt
        };

        const created = await inventoryReservationRepository.create(reservation, client);
        reservations.push(created);

        const movement: InventoryMovement = {
          id: crypto.randomUUID(),
          store_id: input.store_id,
          sku_id: position.sku_id,
          movement_type: 'RESERVATION',
          quantity,
          reservation_id: reservationId,
          reason: input.external_reference ? `Order reservation: ${input.external_reference}` : 'Basket reservation',
          actor_id: actorId,
          correlation_id: correlationId,
          idempotency_key: idempotencyKey,
          created_at: now.toISOString()
        };
        await inventoryMovementRepository.create(movement, client);
      }

      return reservations;
    };

    if (existingClient) {
      return execute(existingClient);
    }
    return withTransaction(execute);
  }


  /**
   * Releases an active or partially held reservation back to available stock.
   */
  async releaseReservation(
    input: {
      reservation_id: string;
      quantity?: number;
      reason?: string;
    },
    actorId: string = 'system',
    correlationId?: string,
    idempotencyKey?: string,
    existingClient?: PoolClient
  ): Promise<InventoryReservation> {
    const execute = async (client: PoolClient) => {
      // Lock reservation row
      const reservation = await inventoryReservationRepository.findByIdForUpdate(
        input.reservation_id,
        client
      );
      if (!reservation) {
        throw new ReservationNotFoundError(`Reservation '${input.reservation_id}' not found`);
      }

      if (reservation.status === 'RELEASED' || reservation.status === 'CONSUMED') {
        throw new InvalidReservationStateError(
          `Reservation '${input.reservation_id}' has already been finalized with status '${reservation.status}'`
        );
      }

      const releaseQty = input.quantity !== undefined ? input.quantity : reservation.remaining_quantity;
      if (releaseQty <= 0 || releaseQty > reservation.remaining_quantity) {
        throw new InvalidReservationStateError(
          `Requested release quantity (${releaseQty}) exceeds remaining reserved quantity (${reservation.remaining_quantity})`
        );
      }

      // Lock inventory position
      const position = await inventoryPositionRepository.findByStoreAndSkuForUpdate(
        reservation.store_id,
        reservation.sku_id,
        client
      );
      if (!position) {
        throw new InventoryPositionNotFoundError(
          `Inventory position for store '${reservation.store_id}' and SKU '${reservation.sku_id}' not found`
        );
      }

      position.reserved_stock = Math.max(0, position.reserved_stock - releaseQty);
      await inventoryPositionRepository.update(position, client);

      reservation.remaining_quantity -= releaseQty;
      reservation.status = reservation.remaining_quantity === 0 ? 'RELEASED' : 'PARTIALLY_RELEASED';
      const updatedReservation = await inventoryReservationRepository.update(reservation, client);

      // Record immutable ledger movement
      const movement: InventoryMovement = {
        id: crypto.randomUUID(),
        store_id: reservation.store_id,
        sku_id: reservation.sku_id,
        movement_type: 'RESERVATION_RELEASE',
        quantity: releaseQty,
        reservation_id: reservation.id,
        reason: input.reason || 'Reservation released',
        actor_id: actorId,
        correlation_id: correlationId,
        idempotency_key: idempotencyKey,
        created_at: new Date().toISOString()
      };
      await inventoryMovementRepository.create(movement, client);

      return updatedReservation;
    };

    if (existingClient) {
      return execute(existingClient);
    }
    return withTransaction(execute);
  }

  /**
   * Consumes reserved stock upon verified physical picking completion.
   */
  async consumeReservation(
    input: {
      reservation_id: string;
      quantity?: number;
      reason?: string;
    },
    actorId: string = 'system',
    correlationId?: string,
    idempotencyKey?: string,
    existingClient?: PoolClient
  ): Promise<InventoryReservation> {
    const execute = async (client: PoolClient) => {
      // Lock reservation row
      const reservation = await inventoryReservationRepository.findByIdForUpdate(
        input.reservation_id,
        client
      );
      if (!reservation) {
        throw new ReservationNotFoundError(`Reservation '${input.reservation_id}' not found`);
      }

      if (reservation.status === 'RELEASED' || reservation.status === 'CONSUMED') {
        throw new InvalidReservationStateError(
          `Reservation '${input.reservation_id}' has already been finalized with status '${reservation.status}'`
        );
      }

      const consumeQty = input.quantity !== undefined ? input.quantity : reservation.remaining_quantity;
      if (consumeQty <= 0 || consumeQty > reservation.remaining_quantity) {
        throw new InvalidReservationStateError(
          `Requested consumption quantity (${consumeQty}) exceeds remaining reserved quantity (${reservation.remaining_quantity})`
        );
      }

      // Lock inventory position
      const position = await inventoryPositionRepository.findByStoreAndSkuForUpdate(
        reservation.store_id,
        reservation.sku_id,
        client
      );
      if (!position) {
        throw new InventoryPositionNotFoundError(
          `Inventory position for store '${reservation.store_id}' and SKU '${reservation.sku_id}' not found`
        );
      }

      // Decrement both physical on hand and reserved stock atomically
      position.physical_on_hand -= consumeQty;
      position.reserved_stock -= consumeQty;
      await inventoryPositionRepository.update(position, client);

      reservation.remaining_quantity -= consumeQty;
      reservation.status = reservation.remaining_quantity === 0 ? 'CONSUMED' : 'PARTIALLY_CONSUMED';
      const updatedReservation = await inventoryReservationRepository.update(reservation, client);

      // Record immutable ledger movement
      const movement: InventoryMovement = {
        id: crypto.randomUUID(),
        store_id: reservation.store_id,
        sku_id: reservation.sku_id,
        movement_type: 'PICK_CONSUMPTION',
        quantity: consumeQty,
        reservation_id: reservation.id,
        reason: input.reason || 'Picking verified consumption',
        actor_id: actorId,
        correlation_id: correlationId,
        idempotency_key: idempotencyKey,
        created_at: new Date().toISOString()
      };
      await inventoryMovementRepository.create(movement, client);

      return updatedReservation;
    };

    if (existingClient) {
      return execute(existingClient);
    }
    return withTransaction(execute);
  }

  /**
   * Reconciles current inventory position against immutable ledger movement history.
   */
  async reconcile(storeId: string, skuId: string): Promise<ReconciliationReport> {
    const position = await inventoryPositionRepository.findByStoreAndSku(storeId, skuId);
    if (!position) {
      throw new InventoryPositionNotFoundError(`Inventory position for store '${storeId}' and SKU '${skuId}' not found`);
    }

    const ledgerTotals = await inventoryMovementRepository.getLedgerTotals(storeId, skuId);

    const physicalDiscrepancy = position.physical_on_hand - ledgerTotals.expected_physical;
    const reservedDiscrepancy = position.reserved_stock - ledgerTotals.expected_reserved;
    const isBalanced = physicalDiscrepancy === 0 && reservedDiscrepancy === 0;

    return {
      store_id: storeId,
      sku_id: skuId,
      stored_physical: position.physical_on_hand,
      stored_reserved: position.reserved_stock,
      stored_available: position.available_stock,
      stored_incoming: position.incoming_units,
      ledger_expected_physical: ledgerTotals.expected_physical,
      ledger_expected_reserved: ledgerTotals.expected_reserved,
      ledger_expected_available: ledgerTotals.expected_physical - ledgerTotals.expected_reserved,
      is_balanced: isBalanced,
      physical_discrepancy: physicalDiscrepancy,
      reserved_discrepancy: reservedDiscrepancy,
      movement_count: ledgerTotals.movement_count,
      reconciled_at: new Date().toISOString()
    };
  }
}

export const inventoryService = new InventoryService();
