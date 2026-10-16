import { describe, it, expect } from 'vitest';
import {
  InitializeInventorySchema,
  ReceiveStockSchema,
  AdjustStockSchema,
  ReserveStockSchema,
  ReleaseReservationSchema,
  ConsumeReservationSchema,
  GenerateRecommendationsSchema
} from '../../src/domain/inventory.schemas';
import { computeRequestFingerprint } from '../../src/services/idempotency.service';

describe('Inventory Domain Schemas & Invariants', () => {
  describe('Accounting Quantity & Balance Constraints', () => {
    it('accepts valid initialization payload with valid non-negative quantities', () => {
      const valid = InitializeInventorySchema.safeParse({
        store_id: 'store-1',
        sku_id: 'sku-1',
        initial_physical_on_hand: 100,
        initial_reserved_stock: 20,
        initial_incoming_units: 50
      });
      expect(valid.success).toBe(true);
    });

    it('rejects initialization where reserved stock exceeds physical on-hand', () => {
      const invalid = InitializeInventorySchema.safeParse({
        store_id: 'store-1',
        sku_id: 'sku-1',
        initial_physical_on_hand: 10,
        initial_reserved_stock: 15 // Invalid: 15 > 10
      });
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.issues[0].message).toContain('cannot exceed initial physical on-hand');
      }
    });

    it('rejects negative stock quantities', () => {
      expect(InitializeInventorySchema.safeParse({
        store_id: 'store-1',
        sku_id: 'sku-1',
        initial_physical_on_hand: -5
      }).success).toBe(false);

      expect(ReceiveStockSchema.safeParse({
        store_id: 'store-1',
        sku_id: 'sku-1',
        quantity: -10
      }).success).toBe(false);

      expect(ReserveStockSchema.safeParse({
        store_id: 'store-1',
        sku_id: 'sku-1',
        quantity: 0 // Must be positive (> 0)
      }).success).toBe(false);
    });

    it('requires a descriptive reason of at least 3 characters for stock adjustments', () => {
      const valid = AdjustStockSchema.safeParse({
        store_id: 'store-1',
        sku_id: 'sku-1',
        quantity: 5,
        adjustment_type: 'NEGATIVE',
        reason: 'Expired dairy batch damaged in transit'
      });
      expect(valid.success).toBe(true);

      const invalid = AdjustStockSchema.safeParse({
        store_id: 'store-1',
        sku_id: 'sku-1',
        quantity: 5,
        adjustment_type: 'NEGATIVE',
        reason: 'x' // Too short (< 3 chars)
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('Reservation and Release Schemas', () => {
    it('validates reservation release and consumption schemas', () => {
      expect(ReleaseReservationSchema.safeParse({
        reservation_id: 'res-123',
        quantity: 2
      }).success).toBe(true);

      expect(ConsumeReservationSchema.safeParse({
        reservation_id: 'res-123',
        quantity: 5
      }).success).toBe(true);

      expect(ConsumeReservationSchema.safeParse({
        reservation_id: 'res-123',
        quantity: -1
      }).success).toBe(false);
    });
  });

  describe('Durable Idempotency Fingerprinting', () => {
    it('produces identical SHA256 hashes regardless of JSON key ordering', () => {
      const payloadA = {
        store_id: 'store-nyc-1',
        sku_id: 'sku-milk-1',
        quantity: 10,
        options: { autoRelease: true, timeout: 300 }
      };

      const payloadB = {
        sku_id: 'sku-milk-1',
        options: { timeout: 300, autoRelease: true },
        quantity: 10,
        store_id: 'store-nyc-1'
      };

      const hashA = computeRequestFingerprint(payloadA);
      const hashB = computeRequestFingerprint(payloadB);

      expect(hashA).toBe(hashB);
      expect(hashA).toHaveLength(64); // Valid sha256 hex
    });

    it('produces different hashes when payload values differ', () => {
      const payload1 = { store_id: 'store-1', sku_id: 'sku-1', quantity: 5 };
      const payload2 = { store_id: 'store-1', sku_id: 'sku-1', quantity: 6 };

      const hash1 = computeRequestFingerprint(payload1);
      const hash2 = computeRequestFingerprint(payload2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Replenishment Calculation Constraints', () => {
    it('validates recommendation generation parameter defaults', () => {
      const parsed = GenerateRecommendationsSchema.parse({
        store_id: 'store-1'
      });
      expect(parsed.safety_stock_factor).toBe(1.5);
      expect(parsed.lead_time_buffer_hours).toBe(24);
    });
  });
});
