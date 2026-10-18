import { describe, it, expect } from 'vitest';
import {
  surgeSimulationService,
  haversineDistanceKm
} from '../../src/services/surge-simulation.service';
import { EvaluateSurgeOrderRequest } from '../../src/domain/surge-simulation.schemas';

describe('SurgeSimulationService Unit Tests', () => {
  const storeManhattan = {
    store_id: 'store-manhattan-02',
    store_name: 'Manhattan #02 Dark Store',
    latitude: 40.758,
    longitude: -73.9855,
    active_queue: 1,
    picker_count: 2,
    inventory: {
      'sku-milk': 20,
      'sku-bananas': 25
    },
    total_units_consumed: 10
  };

  const storeEastVillage = {
    store_id: 'store-east-village-04',
    store_name: 'East Village #04 Dark Store',
    latitude: 40.729,
    longitude: -73.984,
    active_queue: 0,
    picker_count: 2,
    inventory: {
      'sku-milk': 50,
      'sku-bananas': 50
    },
    total_units_consumed: 5
  };

  it('correctly calculates Haversine distance between Manhattan coordinates', () => {
    // Distance between Times Square (40.7580, -73.9855) and East Village (40.7290, -73.9840) ~ 3.2 km
    const dist = haversineDistanceKm(40.758, -73.9855, 40.729, -73.984);
    expect(dist).toBeGreaterThan(3.0);
    expect(dist).toBeLessThan(3.5);
  });

  it('selects nearest store when both stores have stock and normal queue', async () => {
    const request: EvaluateSurgeOrderRequest = {
      order: {
        id: 'ord-test-1',
        customer_name: 'Sarah M.',
        customer_latitude: 40.759,
        customer_longitude: -73.985,
        items: [{ sku_id: 'sku-milk', sku_name: 'Whole Milk 1L', quantity: 2 }],
        virtual_timestamp_seconds: 30
      },
      stores: [storeManhattan, storeEastVillage],
      elapsed_virtual_minutes: 2.0,
      persist_to_db: false
    };

    const result = await surgeSimulationService.evaluateSurgeOrder(request);

    // Customer is right next to Manhattan store
    expect(result.naive_allocation.store_id).toBe('store-manhattan-02');
    expect(result.smart_allocation.store_id).toBe('store-manhattan-02');
    expect(result.stockout_averted).toBe(false);
  });

  it('reroutes to alternate store when nearest store queue is heavily congested', async () => {
    // Manhattan has 9 orders queued! East Village has 0 orders queued.
    const congestedManhattan = {
      ...storeManhattan,
      active_queue: 9
    };

    const request: EvaluateSurgeOrderRequest = {
      order: {
        id: 'ord-test-congested',
        customer_name: 'David K.',
        customer_latitude: 40.75, // in between Manhattan and East Village
        customer_longitude: -73.985,
        items: [{ sku_id: 'sku-bananas', sku_name: 'Organic Bananas 1kg', quantity: 1 }],
        virtual_timestamp_seconds: 60
      },
      stores: [congestedManhattan, storeEastVillage],
      elapsed_virtual_minutes: 3.0,
      persist_to_db: false
    };

    const result = await surgeSimulationService.evaluateSurgeOrder(request);

    // Naive picks nearest blindly
    expect(result.naive_allocation.store_id).toBe('store-manhattan-02');
    expect(result.naive_allocation.queue_wait_minutes).toBeGreaterThan(10);

    // Smart allocation reroutes to East Village to bypass the 9-order queue!
    expect(result.smart_allocation.store_id).toBe('store-east-village-04');
    expect(result.smart_allocation.queue_wait_minutes).toBe(0);
    expect(result.time_saved_minutes).toBeGreaterThan(0);
  });

  it('reroutes and averts stockout when nearest store has 0 stock', async () => {
    // Manhattan has 0 milk, but East Village has 50 milk!
    const outOfStockManhattan = {
      ...storeManhattan,
      active_queue: 0,
      inventory: {
        'sku-milk': 0,
        'sku-bananas': 20
      }
    };

    const request: EvaluateSurgeOrderRequest = {
      order: {
        id: 'ord-test-stockout',
        customer_name: 'Elena R.',
        customer_latitude: 40.758,
        customer_longitude: -73.9855,
        items: [{ sku_id: 'sku-milk', sku_name: 'Whole Milk 1L', quantity: 3 }],
        virtual_timestamp_seconds: 90
      },
      stores: [outOfStockManhattan, storeEastVillage],
      elapsed_virtual_minutes: 4.0,
      persist_to_db: false
    };

    const result = await surgeSimulationService.evaluateSurgeOrder(request);

    // Naive suffers stockout penalty (+25 mins)
    expect(result.naive_allocation.store_id).toBe('store-manhattan-02');
    expect(result.naive_allocation.has_stockout).toBe(true);
    expect(result.naive_allocation.stockout_penalty_minutes).toBe(25.0);

    // Smart reroutes to East Village where milk is in stock!
    expect(result.smart_allocation.store_id).toBe('store-east-village-04');
    expect(result.smart_allocation.has_stockout).toBe(false);
    expect(result.smart_allocation.stockout_penalty_minutes).toBe(0);
    expect(result.stockout_averted).toBe(true);
    expect(result.time_saved_minutes).toBeGreaterThan(10);
  });

  it('computes dynamic burn velocity and critical stock runway during surge', async () => {
    // 45 units consumed in 3 minutes = 15 units/min burn velocity!
    const surgeStore = {
      ...storeManhattan,
      inventory: { 'sku-milk': 12 },
      total_units_consumed: 45
    };

    const request: EvaluateSurgeOrderRequest = {
      order: {
        id: 'ord-test-surge-burn',
        customer_name: 'Alex P.',
        customer_latitude: 40.758,
        customer_longitude: -73.9855,
        items: [{ sku_id: 'sku-milk', quantity: 1 }],
        virtual_timestamp_seconds: 180
      },
      stores: [surgeStore],
      elapsed_virtual_minutes: 3.0,
      persist_to_db: false
    };

    const result = await surgeSimulationService.evaluateSurgeOrder(request);
    const advisory = result.replenishment_advisories[0];

    expect(advisory.burn_rate_units_per_min).toBe(15.0);
    expect(advisory.stock_runway_minutes).toBeLessThan(1.0); // 12 units / 15 units/min = 0.8 min!
    expect(advisory.is_critical_runway).toBe(true);
    expect(advisory.emergency_restock_recommended).toBe(true);
    expect(advisory.recommended_restock_units).toBeGreaterThanOrEqual(50);
  });
});
