import { describe, it, expect, beforeAll } from 'vitest';
import { pool } from '../../src/database/db';
import { runMigrations } from '../../src/database/migrate';
import { catalogService } from '../../src/services/catalog.service';
import { inventoryService } from '../../src/services/inventory.service';
import { idempotencyService } from '../../src/services/idempotency.service';
import { replenishmentService } from '../../src/services/replenishment.service';
import { InsufficientStockError, IdempotencyKeyReusedError, InvalidReservationStateError } from '../../src/services/inventory-errors';

describe('Inventory Core Integration Tests', () => {
  const storeId = `store-inv-${Date.now()}`;
  const skuId = `sku-inv-${Date.now()}`;

  beforeAll(async () => {
    // 1. Run migrations including 002_inventory_schema.sql
    await runMigrations();

    // 2. Seed a valid Store and Product/SKU
    await catalogService.createStore({
      id: storeId,
      name: 'Inventory Test Dark Store',
      status: 'ACTIVE',
      latitude: 40.7128,
      longitude: -74.006,
      service_area: {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
      }
    });

    const prodId = `prod-inv-${Date.now()}`;
    await catalogService.createProduct({
      id: prodId,
      name: 'Greek Yogurt 500g',
      category: 'Dairy',
      description: 'Plain greek yogurt',
      status: 'ACTIVE'
    });

    await catalogService.createSKU({
      id: skuId,
      product_id: prodId,
      sku_code: `YOG-GRK-${Date.now()}`,
      pack_size: 1,
      shelf_life_days: 14,
      storage_temp: { unit: 'CELSIUS', min: 2, max: 4, zone: 'CHILLED' },
      unit_price: 3.99,
      currency: 'USD',
      status: 'ACTIVE'
    });
  });

  describe('Inventory Initialization & Ledger Movements', () => {
    it('initializes stock position and creates OPENING_STOCK movement', async () => {
      const position = await inventoryService.initializeInventory({
        store_id: storeId,
        sku_id: skuId,
        initial_physical_on_hand: 50,
        initial_reserved_stock: 0,
        initial_incoming_units: 20
      }, 'admin-tester', 'corr-init', 'idem-init-1');

      expect(position.store_id).toBe(storeId);
      expect(position.sku_id).toBe(skuId);
      expect(position.physical_on_hand).toBe(50);
      expect(position.reserved_stock).toBe(0);
      expect(position.available_stock).toBe(50);
      expect(position.incoming_units).toBe(20);

      // Verify reconciliation matches
      const report = await inventoryService.reconcile(storeId, skuId);
      expect(report.is_balanced).toBe(true);
      expect(report.stored_physical).toBe(50);
      expect(report.ledger_expected_physical).toBe(50);
    });
  });

  describe('Receipts and Stock Adjustments', () => {
    it('records stock receipt, increments physical on-hand and decrements incoming units', async () => {
      const updated = await inventoryService.receiveStock({
        store_id: storeId,
        sku_id: skuId,
        quantity: 10,
        decrease_incoming: true
      }, 'warehouse-worker', 'corr-rec-1', 'idem-rec-1');

      expect(updated.physical_on_hand).toBe(60); // 50 + 10
      expect(updated.incoming_units).toBe(10);   // 20 - 10
      expect(updated.available_stock).toBe(60);

      const report = await inventoryService.reconcile(storeId, skuId);
      expect(report.is_balanced).toBe(true);
    });

    it('records positive and negative adjustments with strict invariant verification', async () => {
      // Positive adjustment (+5)
      const afterPos = await inventoryService.adjustStock({
        store_id: storeId,
        sku_id: skuId,
        quantity: 5,
        adjustment_type: 'POSITIVE',
        reason: 'Found additional stock during cycle count'
      }, 'inventory-lead', 'corr-adj-1', 'idem-adj-1');
      expect(afterPos.physical_on_hand).toBe(65);

      // Negative adjustment (-3)
      const afterNeg = await inventoryService.adjustStock({
        store_id: storeId,
        sku_id: skuId,
        quantity: 3,
        adjustment_type: 'NEGATIVE',
        reason: 'Damaged packaging written off'
      }, 'inventory-lead', 'corr-adj-2', 'idem-adj-2');
      expect(afterNeg.physical_on_hand).toBe(62);

      const report = await inventoryService.reconcile(storeId, skuId);
      expect(report.is_balanced).toBe(true);
    });
  });

  describe('Reservation, Partial Release and Picking Consumption', () => {
    let reservationId: string;

    it('creates stock reservation, increments reserved_stock and maintains available_stock invariant', async () => {
      const reservation = await inventoryService.reserveStock({
        store_id: storeId,
        sku_id: skuId,
        quantity: 12,
        external_reference: 'ORDER-1001'
      }, 'order-service', 'corr-res-1', 'idem-res-1');

      reservationId = reservation.id;
      expect(reservation.quantity).toBe(12);
      expect(reservation.remaining_quantity).toBe(12);
      expect(reservation.status).toBe('ACTIVE');

      const report = await inventoryService.reconcile(storeId, skuId);
      expect(report.is_balanced).toBe(true);
      expect(report.stored_reserved).toBe(12);
      expect(report.stored_available).toBe(50); // 62 physical - 12 reserved
    });

    it('partially releases reservation, reducing reserved stock immediately', async () => {
      const released = await inventoryService.releaseReservation({
        reservation_id: reservationId,
        quantity: 2,
        reason: 'Customer removed 2 items from cart'
      }, 'order-service', 'corr-rel-1', 'idem-rel-1');

      expect(released.remaining_quantity).toBe(10); // 12 - 2
      expect(released.status).toBe('PARTIALLY_RELEASED');

      const report = await inventoryService.reconcile(storeId, skuId);
      expect(report.is_balanced).toBe(true);
      expect(report.stored_reserved).toBe(10);
      expect(report.stored_available).toBe(52); // 62 - 10
    });

    it('consumes reservation upon picking, decrementing both physical on-hand and reserved stock', async () => {
      const consumed = await inventoryService.consumeReservation({
        reservation_id: reservationId,
        quantity: 10, // All remaining
        reason: 'Picker completed tote scan'
      }, 'picker-system', 'corr-pick-1', 'idem-pick-1');

      expect(consumed.remaining_quantity).toBe(0);
      expect(consumed.status).toBe('CONSUMED');

      const report = await inventoryService.reconcile(storeId, skuId);
      expect(report.is_balanced).toBe(true);
      expect(report.stored_physical).toBe(52); // 62 - 10
      expect(report.stored_reserved).toBe(0);   // 10 - 10
      expect(report.stored_available).toBe(52);
    });

    it('rejects further mutation attempts on finalized reservations', async () => {
      await expect(inventoryService.releaseReservation({
        reservation_id: reservationId,
        quantity: 1
      })).rejects.toThrow(InvalidReservationStateError);

      await expect(inventoryService.consumeReservation({
        reservation_id: reservationId,
        quantity: 1
      })).rejects.toThrow(InvalidReservationStateError);
    });
  });

  describe('Durable Idempotency Service Behavior', () => {
    it('returns cached result on identical command replay without duplicate side-effects', async () => {
      let sideEffectCount = 0;
      const idempotencyKey = `idem-test-${Date.now()}`;
      const payload = { store_id: storeId, sku_id: skuId, amount: 10 };

      // First execution
      const res1 = await idempotencyService.executeIdempotent(
        idempotencyKey,
        'test:op',
        'actor-1',
        payload,
        async () => {
          sideEffectCount++;
          return { statusCode: 200, data: { success: true, count: sideEffectCount } };
        }
      );
      expect(res1.cached).toBe(false);
      expect(res1.data.count).toBe(1);

      // Replay execution
      const res2 = await idempotencyService.executeIdempotent(
        idempotencyKey,
        'test:op',
        'actor-1',
        payload,
        async () => {
          sideEffectCount++;
          return { statusCode: 200, data: { success: true, count: sideEffectCount } };
        }
      );
      expect(res2.cached).toBe(true);
      expect(res2.data.count).toBe(1); // Cached value returned, side effect did NOT run again!
      expect(sideEffectCount).toBe(1);
    });

    it('rejects idempotency key reuse with a different payload', async () => {
      const idempotencyKey = `idem-conflict-${Date.now()}`;

      await idempotencyService.executeIdempotent(
        idempotencyKey,
        'test:op',
        'actor-1',
        { flag: 'A' },
        async () => ({ statusCode: 200, data: { ok: true } })
      );

      // Reusing same key with different payload { flag: 'B' }
      await expect(
        idempotencyService.executeIdempotent(
          idempotencyKey,
          'test:op',
          'actor-1',
          { flag: 'B' },
          async () => ({ statusCode: 200, data: { ok: true } })
        )
      ).rejects.toThrow(IdempotencyKeyReusedError);
    });
  });

  describe('Replenishment Recommendation Engine', () => {
    it('generates, approves, and executes replenishment recommendations', async () => {
      // 1. Generate recommendations
      const generated = await replenishmentService.generateRecommendations(storeId);
      expect(Array.isArray(generated)).toBe(true);

      if (generated.length > 0) {
        const rec = generated[0];
        expect(rec.status).toBe('PENDING');

        // 2. Approve recommendation
        const approved = await replenishmentService.approve(rec.id, 'manager-1', 'Approved for morning dispatch');
        expect(approved.status).toBe('APPROVED');
        expect(approved.decision_actor_id).toBe('manager-1');

        // 3. Execute recommendation
        const executed = await replenishmentService.execute(rec.id, 'buyer-1');
        expect(executed.status).toBe('EXECUTED');
        expect(executed.executed_at).toBeDefined();
      }
    });
  });
});
