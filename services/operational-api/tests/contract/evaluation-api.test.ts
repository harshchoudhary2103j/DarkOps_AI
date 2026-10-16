import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { Express } from 'express';
import { kpiEvaluatorService } from '../../src/services/kpi-evaluator.service';
import { NotFoundError, DomainValidationError } from '../../src/services/catalog.service';
import { ComparisonReport, EvaluationSummary } from '../../src/domain/evaluation.schemas';

describe('Evaluation API Contract Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/v1/simulation/runs/:id/kpis', () => {
    it('returns 404 RESOURCE_NOT_FOUND when run does not exist', async () => {
      vi.spyOn(kpiEvaluatorService, 'getOrComputeRunKpis').mockRejectedValueOnce(
        new NotFoundError("Simulation run 'run_non_existent' not found")
      );

      const res = await request(app)
        .get('/api/v1/simulation/runs/run_non_existent/kpis')
        .set('X-Correlation-Id', 'test-corr-eval-404');

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
      expect(res.body.error.correlationId).toBe('test-corr-eval-404');
    });

    it('returns 400 DOMAIN_VALIDATION_ERROR when run is still QUEUED or RUNNING', async () => {
      vi.spyOn(kpiEvaluatorService, 'getOrComputeRunKpis').mockRejectedValueOnce(
        new DomainValidationError("Simulation run 'run_in_progress' has not reached completion. Current status is 'RUNNING'")
      );

      const res = await request(app)
        .get('/api/v1/simulation/runs/run_in_progress/kpis');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DOMAIN_VALIDATION_ERROR');
      expect(res.body.error.message).toContain('not reached completion');
    });

    it('returns 200 with evaluation summary and required disclaimer for a completed run', async () => {
      const mockSummary: EvaluationSummary = {
        evaluation_id: 'eval_run_01_abc',
        run_id: 'run_contract_01',
        scenario_id: 'scen_contract',
        seed: 42,
        status: 'SUCCEEDED',
        simulated_duration_seconds: 3600.0,
        evaluator_version: '1.0.0',
        formula_version: '1.0.0',
        evaluated_at: new Date().toISOString(),
        event_count: 50,
        policy_identifiers: ['baseline_policies_v1'],
        policy_config: {},
        cost_config: {
          carrying_cost_per_unit_hour: 0.002,
          stockout_penalty_per_unit: 5.0,
          cost_per_purchase_order: 25.0,
          unit_waste_cost: 2.0,
          currency: 'USD'
        },
        kpis: {
          order_fill_rate: {
            metric_name: 'order_fill_rate',
            value: 100.0,
            unit: '%',
            formula_ref: 'Fully Fulfilled Orders / Eligible Terminal Orders * 100',
            status: 'AVAILABLE',
            objective: 'HIGHER_IS_BETTER',
            numerator: 10,
            denominator: 10,
            sample_count: 10,
            warnings: []
          },
          total_picker_travel_distance_meters: {
            metric_name: 'total_picker_travel_distance_meters',
            value: 500.0,
            unit: 'meters',
            formula_ref: 'Sum of Valid Recorded Layout Graph Edge Distances',
            status: 'AVAILABLE',
            objective: 'LOWER_IS_BETTER',
            sample_count: 10,
            warnings: []
          }
        },
        data_quality_warnings: [],
        disclaimer: 'Simulated outcomes derived from synthetic scenarios — not verified real-world results.'
      };

      vi.spyOn(kpiEvaluatorService, 'getOrComputeRunKpis').mockResolvedValueOnce(mockSummary);

      const res = await request(app)
        .get('/api/v1/simulation/runs/run_contract_01/kpis');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.run_id).toBe('run_contract_01');
      expect(res.body.data.disclaimer).toBe('Simulated outcomes derived from synthetic scenarios — not verified real-world results.');
      expect(res.body.data.kpis.order_fill_rate.value).toBe(100.0);
      expect(res.body.data.kpis.total_picker_travel_distance_meters.value).toBe(500.0);
    });
  });

  describe('POST /api/v1/evaluation/compare', () => {
    it('returns 400 VALIDATION_ERROR on empty or missing body fields', async () => {
      const res = await request(app)
        .post('/api/v1/evaluation/compare')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 when either baseline or candidate run does not exist', async () => {
      vi.spyOn(kpiEvaluatorService, 'compareRuns').mockRejectedValueOnce(
        new NotFoundError("Simulation run 'non_existent_run_a' not found")
      );

      const res = await request(app)
        .post('/api/v1/evaluation/compare')
        .send({
          baseline_run_id: 'non_existent_run_a',
          candidate_run_id: 'non_existent_run_b'
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('returns 200 with comparison report between baseline and candidate', async () => {
      const mockReport: ComparisonReport = {
        baseline_run_id: 'run_base',
        candidate_run_id: 'run_cand',
        scenario_compatible: true,
        duration_compatible: true,
        cost_config_compatible: true,
        policy_variation_detected: true,
        comparisons: {
          total_picker_travel_distance_meters: {
            metric_name: 'total_picker_travel_distance_meters',
            unit: 'meters',
            baseline_value: 600.0,
            candidate_value: 400.0,
            baseline_status: 'AVAILABLE',
            candidate_status: 'AVAILABLE',
            absolute_difference: -200.0,
            percentage_change: -33.33,
            objective: 'LOWER_IS_BETTER',
            is_improvement: true,
            improvement_status: 'IMPROVED'
          }
        },
        compatibility_warnings: [],
        disclaimer: 'Simulated outcomes derived from synthetic scenarios — not verified real-world results.'
      };

      vi.spyOn(kpiEvaluatorService, 'compareRuns').mockResolvedValueOnce(mockReport);

      const res = await request(app)
        .post('/api/v1/evaluation/compare')
        .send({
          baseline_run_id: 'run_base',
          candidate_run_id: 'run_cand'
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.baseline_run_id).toBe('run_base');
      expect(res.body.data.candidate_run_id).toBe('run_cand');
      expect(res.body.data.comparisons.total_picker_travel_distance_meters.improvement_status).toBe('IMPROVED');
    });
  });
});
