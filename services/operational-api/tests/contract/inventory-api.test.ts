import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { Express } from 'express';

describe('Inventory REST API Contract Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  describe('Idempotency-Key Requirement', () => {
    it('returns 400 VALIDATION_ERROR when Idempotency-Key header is missing on /reserve', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/reserve')
        .send({
          store_id: 'store-1',
          sku_id: 'sku-1',
          quantity: 2
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d: any) => d.message.includes('Idempotency-Key'))).toBe(true);
    });

    it('returns 400 VALIDATION_ERROR when Idempotency-Key header is missing on /initialize', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/initialize')
        .send({
          store_id: 'store-1',
          sku_id: 'sku-1',
          initial_physical_on_hand: 50
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Inventory Payload Validation', () => {
    it('rejects invalid reservation quantity <= 0 with structured details', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/reserve')
        .set('Idempotency-Key', 'idem-test-qty-0')
        .send({
          store_id: 'store-1',
          sku_id: 'sku-1',
          quantity: 0
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d: any) => d.field.includes('quantity'))).toBe(true);
    });

    it('rejects stock adjustment missing a reason', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/adjustments')
        .set('Idempotency-Key', 'idem-test-adj-noreason')
        .send({
          store_id: 'store-1',
          sku_id: 'sku-1',
          quantity: 5,
          adjustment_type: 'POSITIVE'
          // reason missing
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
