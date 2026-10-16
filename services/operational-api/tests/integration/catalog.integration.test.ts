import { describe, it, expect, beforeAll } from 'vitest';
import { pool, withTransaction } from '../../src/database/db';
import { runMigrations } from '../../src/database/migrate';
import { catalogService, NotFoundError, DomainValidationError } from '../../src/services/catalog.service';
import { auditRepository } from '../../src/repositories/audit.repository';

describe('Catalog Domain Database Integration Tests', () => {
  beforeAll(async () => {
    // 1. Run migrations
    const applied = await runMigrations();
    console.log('[Integration Test] Migrations applied:', applied);
  });

  describe('Migration Idempotency', () => {
    it('executes migrations safely without reapplying or failing on repeat run', async () => {
      const secondRun = await runMigrations();
      expect(secondRun).toHaveLength(0); // All already applied
    });

    it('verifies schema_migrations table records migration version', async () => {
      const { rows } = await pool.query('SELECT version FROM schema_migrations WHERE version = $1', ['001_catalog_schema.sql']);
      expect(rows).toHaveLength(1);
    });
  });

  describe('Store & Service Zone Lifecycle with Audit Trail', () => {
    const storeId = `store-test-${Date.now()}`;
    const zoneId = `zone-test-${Date.now()}`;

    it('creates store and atomically records audit event', async () => {
      const store = await catalogService.createStore({
        id: storeId,
        name: 'Brooklyn Dark Store',
        status: 'ACTIVE',
        latitude: 40.6782,
        longitude: -73.9442,
        service_area: {
          type: 'Polygon',
          coordinates: [
            [
              [-73.95, 40.67],
              [-73.93, 40.67],
              [-73.93, 40.69],
              [-73.95, 40.69],
              [-73.95, 40.67]
            ]
          ]
        }
      }, 'admin-tester');

      expect(store.id).toBe(storeId);
      expect(store.name).toBe('Brooklyn Dark Store');

      // Verify Audit Event
      const audits = await auditRepository.findByEntity('STORE', storeId);
      expect(audits.length).toBeGreaterThanOrEqual(1);
      expect(audits[0].action).toBe('CREATE');
      expect(audits[0].actor_id).toBe('admin-tester');
    });

    it('creates service zone referencing existing store', async () => {
      const zone = await catalogService.createServiceZone({
        id: zoneId,
        store_id: storeId,
        name: 'Zone A - Primary Delivery',
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [-73.95, 40.67],
              [-73.94, 40.67],
              [-73.94, 40.68],
              [-73.95, 40.68],
              [-73.95, 40.67]
            ]
          ]
        },
        status: 'ACTIVE'
      }, 'admin-tester');

      expect(zone.id).toBe(zoneId);
      expect(zone.store_id).toBe(storeId);
    });

    it('rejects service zone referencing non-existent store', async () => {
      await expect(catalogService.createServiceZone({
        id: `zone-ghost-${Date.now()}`,
        store_id: 'non-existent-store',
        name: 'Ghost Zone',
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0]
            ]
          ]
        },
        status: 'ACTIVE'
      })).rejects.toThrow(DomainValidationError);
    });
  });

  describe('Products, SKUs and Decimal Precision', () => {
    const prodId = `prod-test-${Date.now()}`;
    const skuCode = `SKU-INT-${Date.now()}`;

    it('creates product and linked SKU with exact numeric price', async () => {
      const product = await catalogService.createProduct({
        id: prodId,
        name: 'Cold Pressed Orange Juice',
        category: 'Beverages',
        description: 'Fresh organic orange juice',
        status: 'ACTIVE'
      }, 'inventory-lead');

      expect(product.id).toBe(prodId);

      const sku = await catalogService.createSKU({
        id: `sku-${prodId}`,
        product_id: prodId,
        sku_code: skuCode,
        pack_size: 1,
        shelf_life_days: 21,
        storage_temp: {
          unit: 'CELSIUS',
          min: 1,
          max: 4,
          zone: 'CHILLED'
        },
        unit_price: 6.49,
        currency: 'USD',
        status: 'ACTIVE'
      }, 'inventory-lead');

      expect(sku.sku_code).toBe(skuCode);
      expect(sku.unit_price).toBe(6.49);

      // Verify SKU retrieval by SKU code
      const retrieved = await catalogService.getSKUByCode(skuCode);
      expect(retrieved?.id).toBe(sku.id);
    });

    it('rejects duplicate SKU codes (unique constraint)', async () => {
      await expect(catalogService.createSKU({
        id: `sku-dup-${Date.now()}`,
        product_id: prodId,
        sku_code: skuCode, // Duplicate
        pack_size: 2,
        shelf_life_days: 14,
        storage_temp: { unit: 'CELSIUS', min: 0, max: 5 },
        unit_price: 11.99,
        currency: 'USD',
        status: 'ACTIVE'
      })).rejects.toThrow();
    });
  });

  describe('Warehouse Layout Graph Persistence & Activation', () => {
    it('persists valid warehouse layout and activates it atomically', async () => {
      const storeId = `store-layout-${Date.now()}`;
      await catalogService.createStore({
        id: storeId,
        name: 'Warehouse Store',
        status: 'ACTIVE',
        latitude: 40.71,
        longitude: -74.00,
        service_area: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
        }
      });

      const layoutId = `layout-${Date.now()}`;
      const layout = await catalogService.createWarehouseLayout({
        id: layoutId,
        store_id: storeId,
        name: 'Initial Layout v1',
        version: 1,
        status: 'DRAFT',
        nodes: [
          { id: 'DS-MAIN', type: 'DISPATCH_STATION', x: 0, y: 0, z: 0 },
          { id: 'AISLE-1', type: 'AISLE', x: 10, y: 0, z: 0 },
          { id: 'SHELF-1A', type: 'SHELF', aisle_id: 'A1', shelf_id: 'S1', x: 10, y: 5, z: 1 }
        ],
        edges: [
          { from_node: 'DS-MAIN', to_node: 'AISLE-1', distance: 10, bidirectional: true },
          { from_node: 'AISLE-1', to_node: 'SHELF-1A', distance: 5, bidirectional: true }
        ]
      });

      expect(layout.status).toBe('DRAFT');

      // Activate layout
      const activated = await catalogService.activateWarehouseLayout(layoutId);
      expect(activated.status).toBe('ACTIVE');

      const activeLayout = await catalogService.getActiveWarehouseLayout(storeId);
      expect(activeLayout?.id).toBe(layoutId);
    });
  });

  describe('Transaction Rollback on Audit Failure', () => {
    it('rolls back mutation if transaction fails', async () => {
      const doomedStoreId = `doomed-store-${Date.now()}`;

      await expect(
        withTransaction(async (client) => {
          await client.query(`
            INSERT INTO stores (id, name, status, latitude, longitude, service_area, created_at, updated_at)
            VALUES ($1, 'Doomed Store', 'ACTIVE', 40.0, -73.0, '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}', NOW(), NOW())
          `, [doomedStoreId]);

          // Deliberate failure inside transaction
          throw new Error('Simulated audit failure during transaction');
        })
      ).rejects.toThrow('Simulated audit failure during transaction');

      // Verify row was NOT persisted
      const check = await catalogService.getStore(doomedStoreId);
      expect(check).toBeNull();
    });
  });
});
