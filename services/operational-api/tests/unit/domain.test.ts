import { describe, it, expect } from 'vitest';
import {
  CreateStoreSchema,
  CreateServiceZoneSchema,
  CreateProductSchema,
  CreateSKUSchema,
  CreateSupplierSchema,
  CreateWarehouseLayoutSchema,
  LinearRingSchema
} from '../../src/domain/schemas';

describe('Domain Schemas Validation', () => {
  describe('Geographic Boundaries & Store Schema', () => {
    const validPolygon = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [100.0, 0.0],
          [101.0, 0.0],
          [101.0, 1.0],
          [100.0, 1.0],
          [100.0, 0.0]
        ]
      ]
    };

    it('accepts valid store attributes and closed polygon', () => {
      const result = CreateStoreSchema.safeParse({
        id: 'store-1',
        name: 'Downtown Darkstore',
        status: 'ACTIVE',
        latitude: 40.7128,
        longitude: -74.006,
        service_area: validPolygon
      });
      expect(result.success).toBe(true);
    });

    it('rejects out-of-range coordinates', () => {
      const result = CreateStoreSchema.safeParse({
        id: 'store-bad',
        name: 'Invalid Coordinates Store',
        latitude: 95.0, // Invalid latitude > 90
        longitude: -74.006,
        service_area: validPolygon
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('latitude');
      }
    });

    it('rejects unclosed polygon linear rings', () => {
      const unclosedPolygon = {
        type: 'Polygon' as const,
        coordinates: [
          [
            [100.0, 0.0],
            [101.0, 0.0],
            [101.0, 1.0],
            [100.0, 1.0] // Missing closing point [100.0, 0.0]
          ]
        ]
      };
      const result = LinearRingSchema.safeParse(unclosedPolygon.coordinates[0]);
      expect(result.success).toBe(false);
    });

    it('rejects unknown unexpected fields (strict schema enforcement)', () => {
      const result = CreateStoreSchema.safeParse({
        id: 'store-1',
        name: 'Downtown Darkstore',
        latitude: 40.7128,
        longitude: -74.006,
        service_area: validPolygon,
        unauthorized_field: 'hacked'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Product and SKU Domain Schemas', () => {
    it('accepts valid product and validates category requirement', () => {
      const valid = CreateProductSchema.safeParse({
        id: 'prod-1',
        name: 'Organic Whole Milk',
        category: 'Dairy',
        description: '1 Gallon pasteurized whole milk'
      });
      expect(valid.success).toBe(true);

      const invalid = CreateProductSchema.safeParse({
        id: 'prod-2',
        name: 'Organic Whole Milk'
        // Missing category
      });
      expect(invalid.success).toBe(false);
    });

    it('validates SKU pack size and shelf life positive integer constraints', () => {
      const validSKU = {
        id: 'sku-1',
        product_id: 'prod-1',
        sku_code: 'DAIRY-MILK-001',
        pack_size: 1,
        shelf_life_days: 14,
        storage_temp: {
          unit: 'CELSIUS',
          min: 2,
          max: 4,
          zone: 'CHILLED'
        },
        unit_price: 4.99,
        currency: 'USD',
        status: 'ACTIVE'
      };
      expect(CreateSKUSchema.safeParse(validSKU).success).toBe(true);

      // Pack size <= 0 must fail
      expect(CreateSKUSchema.safeParse({ ...validSKU, pack_size: 0 }).success).toBe(false);

      // Shelf life <= 0 must fail
      expect(CreateSKUSchema.safeParse({ ...validSKU, shelf_life_days: -5 }).success).toBe(false);
    });

    it('enforces exact decimal pricing (rejects more than 2 decimal places)', () => {
      const baseSKU = {
        id: 'sku-1',
        product_id: 'prod-1',
        sku_code: 'DAIRY-MILK-001',
        pack_size: 1,
        shelf_life_days: 14,
        storage_temp: { unit: 'CELSIUS', min: 2, max: 4 },
        currency: 'USD'
      };

      // Valid 2 decimals
      expect(CreateSKUSchema.safeParse({ ...baseSKU, unit_price: 3.50 }).success).toBe(true);

      // Invalid 3 decimals
      const invalidPrice = CreateSKUSchema.safeParse({ ...baseSKU, unit_price: 3.999 });
      expect(invalidPrice.success).toBe(false);
    });

    it('validates storage temperature bounds (min <= max)', () => {
      const baseSKU = {
        id: 'sku-1',
        product_id: 'prod-1',
        sku_code: 'DAIRY-MILK-001',
        pack_size: 1,
        shelf_life_days: 14,
        unit_price: 3.50,
        currency: 'USD'
      };

      // Invalid: min > max
      const invalidTemp = CreateSKUSchema.safeParse({
        ...baseSKU,
        storage_temp: { unit: 'CELSIUS', min: 10, max: 2 }
      });
      expect(invalidTemp.success).toBe(false);
    });
  });

  describe('Supplier Schema', () => {
    it('accepts valid review schedule and lead time', () => {
      const result = CreateSupplierSchema.safeParse({
        id: 'supp-1',
        name: 'Fresh Farms Logistics',
        default_lead_time_hours: 24,
        default_moq: 100,
        review_schedule: {
          cadence: 'WEEKLY',
          days_of_week: [1, 4],
          review_time_utc: '08:00'
        },
        status: 'ACTIVE'
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid review schedule time format', () => {
      const result = CreateSupplierSchema.safeParse({
        id: 'supp-1',
        name: 'Fresh Farms Logistics',
        default_lead_time_hours: 24,
        default_moq: 100,
        review_schedule: {
          cadence: 'WEEKLY',
          review_time_utc: '25:99' // Invalid time
        }
      });
      expect(result.success).toBe(false);
    });
  });
});
