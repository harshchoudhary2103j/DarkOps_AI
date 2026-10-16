import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { Express } from 'express';
import { simulationService } from '../../src/services/simulation.service';
import { NotFoundError, DomainValidationError } from '../../src/services/catalog.service';
import { SimulationRun, SimulationEvent } from '../../src/domain/simulation.schemas';

describe('Simulation API Contract Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/v1/simulation/scenarios', () => {
    it('returns 200 with supported simulation scenarios', async () => {
      const res = await request(app).get('/api/v1/simulation/scenarios');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      const manhattan = res.body.data.find((s: any) => s.scenario_id === 'manhattan-demo');
      expect(manhattan).toBeDefined();
      expect(manhattan.default_seed).toBe(101);
      expect(manhattan.default_duration_hours).toBe(12.0);
    });
  });

  describe('POST /api/v1/simulation/runs', () => {
    it('validates duration bounds and seed', async () => {
      const res = await request(app)
        .post('/api/v1/simulation/runs')
        .send({
          scenario_id: 'manhattan-demo',
          seed: -1, // Invalid negative seed
          duration_hours: 0 // Invalid zero duration
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('creates a QUEUED simulation run with seed 101 and 12h duration', async () => {
      const mockRun: SimulationRun = {
        id: 'sim_run_test_101',
        scenario_id: 'manhattan-demo',
        seed: 101,
        status: 'QUEUED',
        start_time: '2026-03-01T08:00:00.000Z',
        end_time: '2026-03-01T20:00:00.000Z',
        current_virtual_time: '2026-03-01T08:00:00.000Z',
        event_count: 0,
        config_snapshot: {
          scenario_id: 'manhattan-demo',
          seed: 101,
          duration_hours: 12.0,
          policy_identifier: 'baseline_policies_v1'
        },
        failure_reason: null,
        created_at: '2026-03-01T08:00:00.000Z',
        updated_at: '2026-03-01T08:00:00.000Z'
      };

      vi.spyOn(simulationService, 'createRun').mockResolvedValueOnce(mockRun);

      const res = await request(app)
        .post('/api/v1/simulation/runs')
        .send({
          scenario_id: 'manhattan-demo',
          seed: 101,
          duration_hours: 12.0,
          policy_identifier: 'baseline_policies_v1'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe('sim_run_test_101');
      expect(res.body.data.status).toBe('QUEUED');
      expect(res.body.data.seed).toBe(101);
    });
  });

  describe('GET /api/v1/simulation/runs/:id', () => {
    it('returns 404 when simulation run does not exist', async () => {
      vi.spyOn(simulationService, 'getRunById').mockRejectedValueOnce(
        new NotFoundError("Simulation run 'non_existent_run' not found")
      );

      const res = await request(app).get('/api/v1/simulation/runs/non_existent_run');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('returns 200 with simulation run record', async () => {
      const mockRun: SimulationRun = {
        id: 'sim_run_01',
        scenario_id: 'manhattan-demo',
        seed: 101,
        status: 'RUNNING',
        start_time: '2026-03-01T08:00:00.000Z',
        end_time: '2026-03-01T20:00:00.000Z',
        current_virtual_time: '2026-03-01T11:30:00.000Z',
        event_count: 42,
        config_snapshot: {},
        failure_reason: null,
        created_at: '2026-03-01T08:00:00.000Z',
        updated_at: '2026-03-01T08:00:00.000Z'
      };

      vi.spyOn(simulationService, 'getRunById').mockResolvedValueOnce(mockRun);

      const res = await request(app).get('/api/v1/simulation/runs/sim_run_01');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RUNNING');
      expect(res.body.data.event_count).toBe(42);
    });
  });

  describe('Lifecycle Controls: pause, resume, cancel, reset', () => {
    it('pauses a RUNNING job', async () => {
      const pausedRun: SimulationRun = {
        id: 'sim_run_01',
        scenario_id: 'manhattan-demo',
        seed: 101,
        status: 'PAUSED',
        start_time: '2026-03-01T08:00:00.000Z',
        end_time: '2026-03-01T20:00:00.000Z',
        current_virtual_time: '2026-03-01T11:30:00.000Z',
        event_count: 42,
        config_snapshot: {},
        failure_reason: null,
        created_at: '2026-03-01T08:00:00.000Z',
        updated_at: '2026-03-01T08:00:00.000Z'
      };

      vi.spyOn(simulationService, 'pauseRun').mockResolvedValueOnce(pausedRun);

      const res = await request(app).post('/api/v1/simulation/runs/sim_run_01/pause');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PAUSED');
    });

    it('rejects pausing a completed run with 400 DOMAIN_VALIDATION_ERROR', async () => {
      vi.spyOn(simulationService, 'pauseRun').mockRejectedValueOnce(
        new DomainValidationError("Cannot pause simulation run 'sim_run_01' from status 'SUCCEEDED'")
      );

      const res = await request(app).post('/api/v1/simulation/runs/sim_run_01/pause');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DOMAIN_VALIDATION_ERROR');
    });

    it('resumes a PAUSED job', async () => {
      const runningRun: SimulationRun = {
        id: 'sim_run_01',
        scenario_id: 'manhattan-demo',
        seed: 101,
        status: 'RUNNING',
        start_time: '2026-03-01T08:00:00.000Z',
        end_time: '2026-03-01T20:00:00.000Z',
        current_virtual_time: '2026-03-01T11:30:00.000Z',
        event_count: 42,
        config_snapshot: {},
        failure_reason: null,
        created_at: '2026-03-01T08:00:00.000Z',
        updated_at: '2026-03-01T08:00:00.000Z'
      };

      vi.spyOn(simulationService, 'resumeRun').mockResolvedValueOnce(runningRun);

      const res = await request(app).post('/api/v1/simulation/runs/sim_run_01/resume');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RUNNING');
    });

    it('cancels a run', async () => {
      const cancelledRun: SimulationRun = {
        id: 'sim_run_01',
        scenario_id: 'manhattan-demo',
        seed: 101,
        status: 'CANCELLED',
        start_time: '2026-03-01T08:00:00.000Z',
        end_time: '2026-03-01T20:00:00.000Z',
        current_virtual_time: '2026-03-01T11:30:00.000Z',
        event_count: 42,
        config_snapshot: {},
        failure_reason: 'Cancelled by operator',
        created_at: '2026-03-01T08:00:00.000Z',
        updated_at: '2026-03-01T08:00:00.000Z'
      };

      vi.spyOn(simulationService, 'cancelRun').mockResolvedValueOnce(cancelledRun);

      const res = await request(app).post('/api/v1/simulation/runs/sim_run_01/cancel');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');
    });

    it('resets a run back to QUEUED', async () => {
      const resetRun: SimulationRun = {
        id: 'sim_run_01',
        scenario_id: 'manhattan-demo',
        seed: 101,
        status: 'QUEUED',
        start_time: '2026-03-01T08:00:00.000Z',
        end_time: '2026-03-01T20:00:00.000Z',
        current_virtual_time: '2026-03-01T08:00:00.000Z',
        event_count: 0,
        config_snapshot: {},
        failure_reason: null,
        created_at: '2026-03-01T08:00:00.000Z',
        updated_at: '2026-03-01T08:00:00.000Z'
      };

      vi.spyOn(simulationService, 'resetRun').mockResolvedValueOnce(resetRun);

      const res = await request(app).post('/api/v1/simulation/runs/sim_run_01/reset');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('QUEUED');
      expect(res.body.data.event_count).toBe(0);
    });
  });

  describe('GET /api/v1/simulation/runs/:id/events', () => {
    it('returns ordered events with pagination metadata', async () => {
      const mockEvents: SimulationEvent[] = [
        {
          id: 'ev_01',
          run_id: 'sim_run_01',
          sequence_number: 1,
          event_type: 'CUSTOMER_ORDER_ARRIVED',
          virtual_timestamp: '2026-03-01T08:05:00.000Z',
          priority: 5,
          payload: { order_id: 'ord_001' },
          status: 'PROCESSED',
          created_at: '2026-03-01T08:05:00.000Z'
        },
        {
          id: 'ev_02',
          run_id: 'sim_run_01',
          sequence_number: 2,
          event_type: 'ORDER_ALLOCATED',
          virtual_timestamp: '2026-03-01T08:05:01.000Z',
          priority: 5,
          payload: { order_id: 'ord_001', store_id: 'store_nyc_01' },
          status: 'PROCESSED',
          created_at: '2026-03-01T08:05:01.000Z'
        }
      ];

      vi.spyOn(simulationService, 'getEvents').mockResolvedValueOnce({
        items: mockEvents,
        total: 2,
        has_more: false
      });

      const res = await request(app).get('/api/v1/simulation/runs/sim_run_01/events?limit=10&offset=0');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination.total).toBe(2);
      expect(res.body.pagination.has_more).toBe(false);
      expect(res.body.data[0].sequence_number).toBe(1);
    });
  });
});
