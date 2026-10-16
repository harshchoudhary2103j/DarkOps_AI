import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';

const app = createApp();

describe('Order & Picking API Contracts', () => {
  describe('POST /api/v1/orders Schema Validation', () => {
    it('rejects order with duplicate SKUs in lines', async () => {
      const payload = {
        customer_latitude: 40.7128,
        customer_longitude: -74.006,
        lines: [
          { sku_id: 'sku-1', quantity: 2 },
          { sku_id: 'sku-1', quantity: 3 }
        ]
      };

      const res = await request(app)
        .post('/api/v1/orders')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d: any) => d.message.includes('Duplicate SKUs'))).toBe(true);
    });

    it('rejects order with empty lines array', async () => {
      const payload = {
        customer_latitude: 40.7128,
        customer_longitude: -74.006,
        lines: []
      };

      const res = await request(app)
        .post('/api/v1/orders')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects order with non-positive line quantity', async () => {
      const payload = {
        customer_latitude: 40.7128,
        customer_longitude: -74.006,
        lines: [{ sku_id: 'sku-1', quantity: 0 }]
      };

      const res = await request(app)
        .post('/api/v1/orders')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects order with invalid coordinates out of range', async () => {
      const payload = {
        customer_latitude: 95.0, // > 90
        customer_longitude: -74.006,
        lines: [{ sku_id: 'sku-1', quantity: 1 }]
      };

      const res = await request(app)
        .post('/api/v1/orders')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Picking Task API Contracts', () => {
    it('rejects fail-task with missing or empty reason', async () => {
      const res = await request(app)
        .post('/api/v1/picking/tasks/task-123/fail')
        .send({ reason: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects confirm-item with negative or zero quantity', async () => {
      const res = await request(app)
        .post('/api/v1/picking/tasks/task-123/items/item-123/confirm')
        .send({ picked_quantity: 0 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects exception reporting with invalid exception type', async () => {
      const res = await request(app)
        .post('/api/v1/picking/tasks/task-123/items/item-123/report-exception')
        .send({ exception_type: 'STOLEN', quantity: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
