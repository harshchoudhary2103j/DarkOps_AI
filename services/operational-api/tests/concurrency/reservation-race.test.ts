import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '../../src/database/migrate';
import { catalogService } from '../../src/services/catalog.service';
import { inventoryService } from '../../src/services/inventory.service';
import { inventoryPositionRepository } from '../../src/repositories/inventory-position.repository';
import { inventoryReservationRepository } from '../../src/repositories/inventory-reservation.repository';
import { inventoryMovementRepository } from '../../src/repositories/inventory-movement.repository';
import { InsufficientStockError } from '../../src/services/inventory-errors';

describe('Concurrency-Safe Stock Reservations (50 vs 10 Acceptance Test)', () => {
  const storeId = `store-race-${Date.now()}`;
  const skuId = `sku-race-${Date.now()}`;

  beforeAll(async () => {
    // 1. Ensure migrations are applied
    await runMigrations();

    // 2. Setup Store and SKU
    await catalogService.createStore({
      id: storeId,
      name: 'High Concurrency Race Test Store',
      status: 'ACTIVE',
      latitude: 40.7128,
      longitude: -74.006,
      service_area: {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
      }
    });

    const prodId = `prod-race-${Date.now()}`;
    await catalogService.createProduct({
      id: prodId,
      name: 'Limited Edition Energy Drink',
      category: 'Beverages',
      description: 'High-demand limited drop',
      status: 'ACTIVE'
    });

    await catalogService.createSKU({
      id: skuId,
      product_id: prodId,
      sku_code: `ENERGY-RACE-${Date.now()}`,
      pack_size: 1,
      shelf_life_days: 90,
      storage_temp: { unit: 'CELSIUS', min: 2, max: 20 },
      unit_price: 2.99,
      currency: 'USD',
      status: 'ACTIVE'
    });

    // 3. Initialize inventory with EXACTLY 10 units physical on-hand, 0 reserved -> 10 available units
    await inventoryService.initializeInventory({
      store_id: storeId,
      sku_id: skuId,
      initial_physical_on_hand: 10,
      initial_reserved_stock: 0,
      initial_incoming_units: 0
    });
  });

  it('handles 50 concurrent 1-unit reservation requests against 10 available units with exactly 10 successes and 40 clean failures', async () => {
    const totalRequests = 50;
    const requestedQuantity = 1;

    // Launch 50 concurrent reservation promises simultaneously
    const promises: Promise<{ success: boolean; error?: any }>[] = [];

    for (let i = 0; i < totalRequests; i++) {
      const p = (async () => {
        try {
          await inventoryService.reserveStock({
            store_id: storeId,
            sku_id: skuId,
            quantity: requestedQuantity,
            external_reference: `RACE-ORDER-${i + 1}`
          }, `shopper-${i + 1}`, `corr-race-${i + 1}`, `idem-race-${i + 1}`);
          return { success: true };
        } catch (err: any) {
          return { success: false, error: err };
        }
      })();
      promises.push(p);
    }

    const results = await Promise.all(promises);

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`[Concurrency Acceptance Test Results] Total: ${totalRequests}, Successes: ${successCount}, Failures: ${failureCount}`);

    // Verification 1: Exactly 10 requests succeeded
    expect(successCount).toBe(10);

    // Verification 2: Exactly 40 requests failed
    expect(failureCount).toBe(40);

    // Verification 3: All 40 failures threw InsufficientStockError
    for (const failure of results.filter(r => !r.success)) {
      expect(failure.error).toBeInstanceOf(InsufficientStockError);
      expect((failure.error as InsufficientStockError).code).toBe('INSUFFICIENT_STOCK');
    }

    // Verification 4: Final balances on inventory position
    const finalPosition = await inventoryPositionRepository.findByStoreAndSku(storeId, skuId);
    expect(finalPosition).not.toBeNull();
    expect(finalPosition!.physical_on_hand).toBe(10); // Original physical stock unchanged
    expect(finalPosition!.reserved_stock).toBe(10);   // All 10 reserved
    expect(finalPosition!.available_stock).toBe(0);    // Zero remaining available

    // Verification 5: Exactly 10 active reservation records exist in PostgreSQL
    const reservations = await inventoryReservationRepository.findByStoreAndSku(storeId, skuId, 'ACTIVE');
    expect(reservations).toHaveLength(10);

    // Verification 6: Ledger movements contain 1 OPENING_STOCK and exactly 10 RESERVATION entries
    const movements = await inventoryMovementRepository.findAll(
      { page: 1, limit: 100 },
      { store_id: storeId, sku_id: skuId, movement_type: 'RESERVATION' }
    );
    expect(movements.data).toHaveLength(10);

    // Verification 7: Reconciliation confirms perfect ledger consistency (zero discrepancy)
    const reconciliation = await inventoryService.reconcile(storeId, skuId);
    expect(reconciliation.is_balanced).toBe(true);
    expect(reconciliation.physical_discrepancy).toBe(0);
    expect(reconciliation.reserved_discrepancy).toBe(0);
    expect(reconciliation.stored_physical).toBe(10);
    expect(reconciliation.stored_reserved).toBe(10);
    expect(reconciliation.ledger_expected_physical).toBe(10);
    expect(reconciliation.ledger_expected_reserved).toBe(10);
  });
});
