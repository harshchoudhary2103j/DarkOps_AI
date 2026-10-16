import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { Express } from 'express';

describe('Operational API Contract Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  describe('GET /healthz', () => {
    it('returns HTTP 200 with service metadata', async () => {
      const res = await request(app).get('/healthz');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('operational-api');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('Correlation ID Middleware', () => {
    it('propagates provided X-Correlation-Id', async () => {
      const res = await request(app)
        .get('/healthz')
        .set('X-Correlation-Id', 'test-corr-12345');
      expect(res.headers['x-correlation-id']).toBe('test-corr-12345');
    });

    it('generates an X-Correlation-Id if not provided', async () => {
      const res = await request(app).get('/healthz');
      expect(res.headers['x-correlation-id']).toBeDefined();
      expect(typeof res.headers['x-correlation-id']).toBe('string');
    });
  });

  describe('Standardized Error Envelopes (ADR-003)', () => {
    it('returns structured 404 error envelope on unmapped routes', async () => {
      const res = await request(app).get('/api/v1/non-existent-endpoint');
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('ENDPOINT_NOT_FOUND');
      expect(res.body.error.correlationId).toBeDefined();
    });

    it('returns structured 400 VALIDATION_ERROR on malformed Store creation payload', async () => {
      const res = await request(app)
        .post('/api/v1/stores')
        .send({
          id: 'store-test',
          name: 'S', // Too short (min 2)
          latitude: 999.0 // Invalid latitude
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(res.body.error.details)).toBe(true);
      expect(res.body.error.details.some((d: any) => d.field.includes('latitude'))).toBe(true);
    });

    it('returns structured 400 VALIDATION_ERROR on SKU monetary precision violation (>2 decimals)', async () => {
      const res = await request(app)
        .post('/api/v1/skus')
        .send({
          id: 'sku-test',
          product_id: 'prod-1',
          sku_code: 'TEST-SKU-99',
          pack_size: 1,
          shelf_life_days: 30,
          storage_temp: { unit: 'CELSIUS', min: 0, max: 10 },
          unit_price: 12.345, // Invalid > 2 decimals
          currency: 'USD'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d: any) => d.field.includes('unit_price'))).toBe(true);
    });

    it('returns structured 400 DOMAIN_VALIDATION_ERROR on unreachable warehouse layout graph', async () => {
      // Valid nodes & edges according to Zod schema, but disconnected shelf node
      const res = await request(app)
        .post('/api/v1/warehouse-layouts')
        .send({
          id: 'layout-bad',
          store_id: 'store-1',
          name: 'Disconnected Layout',
          version: 1,
          status: 'DRAFT',
          nodes: [
            { id: 'DS-1', type: 'DISPATCH_STATION', x: 0, y: 0, z: 0 },
            { id: 'SHELF-ISLAND', type: 'SHELF', aisle_id: 'A', shelf_id: 'S1', x: 10, y: 10, z: 1 }
          ],
          edges: [
            // No edge connects DS-1 and SHELF-ISLAND
            { from_node: 'DS-1', to_node: 'DS-1', distance: 1.0, bidirectional: true }
          ]
        });

      // Because store-1 is checked or graph fails, it returns 400 DOMAIN_VALIDATION_ERROR
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DOMAIN_VALIDATION_ERROR');
    });
  });

  describe('Administrative Authorization Guard', () => {
    it('enforces auth when REQUIRE_AUTH is true', async () => {
      process.env.REQUIRE_AUTH = 'true';
      process.env.JWT_SECRET = 'super-secret-key-32-chars-length!!';

      // Unauthorized request
      const unauthorizedRes = await request(app)
        .post('/api/v1/stores')
        .send({ id: 'test' });
      expect(unauthorizedRes.status).toBe(401);
      expect(unauthorizedRes.body.error.code).toBe('UNAUTHORIZED');

      // Authorized with header
      const authorizedRes = await request(app)
        .post('/api/v1/stores')
        .set('Authorization', 'Bearer super-secret-key-32-chars-length!!')
        .send({ id: 'test' });
      // Should pass auth and fail on Zod schema (400), not 401
      expect(authorizedRes.status).toBe(400);
      expect(authorizedRes.body.error.code).toBe('VALIDATION_ERROR');

      // Reset
      delete process.env.REQUIRE_AUTH;
      delete process.env.JWT_SECRET;
    });
  });
});
