import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/feedback/ToastProvider';
import { ScenarioConfigurationForm } from '../features/simulations/components/ScenarioConfigurationForm';
import { VirtualClock } from '../features/simulations/components/VirtualClock';
import { QueueDepthPanel } from '../features/simulations/components/QueueDepthPanel';
import { EventTimeline } from '../features/simulations/components/EventTimeline';
import { PolicyComparisonPanel } from '../features/simulations/components/PolicyComparisonPanel';
import { ExportReportDialog } from '../features/simulations/components/ExportReportDialog';
import { SimulationExecutionConsole } from '../features/simulations/components/SimulationExecutionConsole';
import {
  DEFAULT_EXPERIMENT_CONFIG,
  validateExperimentConfig,
} from '../features/simulations/lib/experiment-validation';
import {
  validateFairComparison,
  calculateSafeDelta,
  SIMULATION_DISCLAIMER,
} from '../features/simulations/lib/comparison-validation';
import {
  generateSimulationJsonReport,
  generateSimulationMarkdownReport,
} from '../features/simulations/lib/report-export';
import {
  SimulationRun,
  ScenarioTemplate,
  EvaluationSummary,
  ComparisonReport,
  SimulationEvent,
} from '../types/domain';

// Helper to wrap test components in QueryClient & ToastProvider
function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

const mockScenarioTemplates: ScenarioTemplate[] = [
  {
    scenario_id: 'manhattan-demo',
    scenario_name: 'Manhattan Urban Network',
    description: 'High-density multi-store urban network with 2 dark stores and 16 fast-moving SKUs.',
    num_stores: 2,
    num_skus: 16,
    default_duration_hours: 12.0,
    default_seed: 101,
    daily_demand_lambda: 10.0,
    supplier_lead_time_min_hours: 12,
    supplier_lead_time_max_hours: 48,
    categories: ['Produce', 'Dairy', 'Beverages', 'Snacks'],
  },
  {
    scenario_id: 'fast-01',
    scenario_name: 'Small Fast Test Scenario',
    description: 'Lightweight benchmark scenario with 1 store and 4 SKUs.',
    num_stores: 1,
    num_skus: 4,
    default_duration_hours: 6.0,
    default_seed: 42,
    daily_demand_lambda: 5.0,
    supplier_lead_time_min_hours: 12,
    supplier_lead_time_max_hours: 24,
    categories: ['Produce', 'Dairy'],
  },
];

const mockBaselineRun: SimulationRun = {
  id: 'run_baseline_101',
  scenario_id: 'manhattan-demo',
  seed: 101,
  status: 'SUCCEEDED',
  start_time: '2026-03-01T08:00:00.000Z',
  end_time: '2026-03-01T20:00:00.000Z',
  current_virtual_time: '2026-03-01T20:00:00.000Z',
  event_count: 142,
  config_snapshot: {
    scenario_id: 'manhattan-demo',
    seed: 101,
    duration_hours: 12.0,
    policy_identifier: 'baseline_policies_v1',
    demand_config: { base_hourly_rate: 12.0, surge_multiplier: 1.0 },
    supplier_lead_time_min_hours: 12,
    supplier_lead_time_max_hours: 48,
  },
  failure_reason: null,
  created_at: '2026-03-01T08:00:00.000Z',
  updated_at: '2026-03-01T20:00:00.000Z',
};

const mockCandidateRun: SimulationRun = {
  id: 'run_optimized_101',
  scenario_id: 'manhattan-demo',
  seed: 101,
  status: 'SUCCEEDED',
  start_time: '2026-03-01T08:00:00.000Z',
  end_time: '2026-03-01T20:00:00.000Z',
  current_virtual_time: '2026-03-01T20:00:00.000Z',
  event_count: 138,
  config_snapshot: {
    scenario_id: 'manhattan-demo',
    seed: 101,
    duration_hours: 12.0,
    policy_identifier: 'optimized_policies_v1',
    demand_config: { base_hourly_rate: 12.0, surge_multiplier: 1.0 },
    supplier_lead_time_min_hours: 12,
    supplier_lead_time_max_hours: 48,
  },
  failure_reason: null,
  created_at: '2026-03-01T08:00:00.000Z',
  updated_at: '2026-03-01T20:00:00.000Z',
};

const mockComparisonReport: ComparisonReport = {
  baseline_run_id: 'run_baseline_101',
  candidate_run_id: 'run_optimized_101',
  scenario_compatible: true,
  duration_compatible: true,
  cost_config_compatible: true,
  policy_variation_detected: true,
  compatibility_warnings: [],
  disclaimer: SIMULATION_DISCLAIMER,
  comparisons: {
    order_fill_rate: {
      metric_name: 'order_fill_rate',
      unit: '%',
      baseline_value: 91.5,
      candidate_value: 98.2,
      baseline_status: 'AVAILABLE',
      candidate_status: 'AVAILABLE',
      absolute_difference: 6.7,
      percentage_change: 7.32,
      objective: 'HIGHER_IS_BETTER',
      is_improvement: true,
      improvement_status: 'IMPROVED',
    },
    total_picker_travel_distance_meters: {
      metric_name: 'total_picker_travel_distance_meters',
      unit: 'm',
      baseline_value: 4500.0,
      candidate_value: 3900.0,
      baseline_status: 'AVAILABLE',
      candidate_status: 'AVAILABLE',
      absolute_difference: -600.0,
      percentage_change: -13.33,
      objective: 'LOWER_IS_BETTER',
      is_improvement: true,
      improvement_status: 'IMPROVED',
    },
    total_cost: {
      metric_name: 'total_cost',
      unit: 'USD',
      baseline_value: 120.5,
      candidate_value: 105.0,
      baseline_status: 'AVAILABLE',
      candidate_status: 'AVAILABLE',
      absolute_difference: -15.5,
      percentage_change: -12.86,
      objective: 'LOWER_IS_BETTER',
      is_improvement: true,
      improvement_status: 'IMPROVED',
    },
  },
};

const mockEvents: SimulationEvent[] = [
  {
    id: 'ev_001',
    run_id: 'run_baseline_101',
    sequence_number: 1,
    event_type: 'CUSTOMER_ORDER_ARRIVED',
    virtual_timestamp: '2026-03-01T08:05:00.000Z',
    priority: 5,
    payload: { order_id: 'ord_101_01', items_count: 3 },
    status: 'PROCESSED',
    created_at: '2026-03-01T08:05:00.000Z',
  },
  {
    id: 'ev_002',
    run_id: 'run_baseline_101',
    sequence_number: 2,
    event_type: 'ORDER_ALLOCATED',
    virtual_timestamp: '2026-03-01T08:05:02.000Z',
    priority: 5,
    payload: { order_id: 'ord_101_01', store_id: 'store_nyc_01' },
    status: 'PROCESSED',
    created_at: '2026-03-01T08:05:02.000Z',
  },
];

describe('Phase 10 — Simulation Lab Component & Logic Tests', () => {
  describe('1. Scenario Configuration Validation', () => {
    it('validates default demonstration configuration (12 hours, seed 101)', () => {
      const res = validateExperimentConfig(DEFAULT_EXPERIMENT_CONFIG);
      expect(res.isValid).toBe(true);
      expect(DEFAULT_EXPERIMENT_CONFIG.duration_hours).toBe(12.0);
      expect(DEFAULT_EXPERIMENT_CONFIG.seed).toBe(101);
      expect(DEFAULT_EXPERIMENT_CONFIG.scenario_id).toBe('manhattan-demo');
    });

    it('rejects invalid duration <= 0 or > 168h', () => {
      const invalidLow = validateExperimentConfig({
        ...DEFAULT_EXPERIMENT_CONFIG,
        duration_hours: 0,
      });
      expect(invalidLow.isValid).toBe(false);
      expect(invalidLow.errors.duration_hours).toBeDefined();

      const invalidHigh = validateExperimentConfig({
        ...DEFAULT_EXPERIMENT_CONFIG,
        duration_hours: 200,
      });
      expect(invalidHigh.isValid).toBe(false);
      expect(invalidHigh.errors.duration_hours).toContain('cannot exceed 168 hours');
    });

    it('rejects negative random seeds', () => {
      const res = validateExperimentConfig({
        ...DEFAULT_EXPERIMENT_CONFIG,
        seed: -5,
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.seed).toContain('non-negative');
    });

    it('rejects supplier min lead time exceeding max lead time', () => {
      const res = validateExperimentConfig({
        ...DEFAULT_EXPERIMENT_CONFIG,
        supplier_lead_time_min_hours: 48,
        supplier_lead_time_max_hours: 24,
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.supplier_lead_time_max_hours).toBeDefined();
    });
  });

  describe('2. Fair Comparison & Reproducibility Logic', () => {
    it('confirms fair comparison when scenario, seed, duration, and status match', () => {
      const check = validateFairComparison(mockBaselineRun, mockCandidateRun, null, null, mockComparisonReport);
      expect(check.isFair).toBe(true);
      expect(check.reasons.length).toBe(0);
    });

    it('fails fair comparison when seeds differ (e.g., 101 vs 42)', () => {
      const differentSeedCandidate = { ...mockCandidateRun, seed: 42 };
      const check = validateFairComparison(mockBaselineRun, differentSeedCandidate);
      expect(check.isFair).toBe(false);
      expect(check.reasons.some((r) => r.includes('Seed mismatch'))).toBe(true);
    });

    it('fails fair comparison when scenario templates differ', () => {
      const differentScenario = { ...mockCandidateRun, scenario_id: 'fast-01' };
      const check = validateFairComparison(mockBaselineRun, differentScenario);
      expect(check.isFair).toBe(false);
      expect(check.reasons.some((r) => r.includes('Scenario mismatch'))).toBe(true);
    });

    it('fails fair comparison when a run is not completed (e.g. RUNNING)', () => {
      const runningCandidate = { ...mockCandidateRun, status: 'RUNNING' as const };
      const check = validateFairComparison(mockBaselineRun, runningCandidate);
      expect(check.isFair).toBe(false);
      expect(check.reasons.some((r) => r.includes('has not succeeded'))).toBe(true);
    });

    it('enforces exact required synthetic-environment disclaimer', () => {
      expect(SIMULATION_DISCLAIMER).toBe(
        'Simulated results from synthetic quick-commerce environment. Not verified real-world outcomes.'
      );
    });
  });

  describe('3. Metric Deltas & Zero-Baseline Handling', () => {
    it('calculates favorable reduction for LOWER_IS_BETTER metric (picker travel distance)', () => {
      const res = calculateSafeDelta(500.0, 400.0, 'LOWER_IS_BETTER');
      expect(res.absoluteDelta).toBe(-100.0);
      expect(res.percentageDelta).toBe(-20.0);
      expect(res.isImprovement).toBe(true);
      expect(res.status).toBe('IMPROVED');
    });

    it('calculates favorable increase for HIGHER_IS_BETTER metric (fill rate)', () => {
      const res = calculateSafeDelta(90.0, 95.0, 'HIGHER_IS_BETTER');
      expect(res.absoluteDelta).toBe(5.0);
      expect(res.percentageDelta).toBe(5.56);
      expect(res.isImprovement).toBe(true);
      expect(res.status).toBe('IMPROVED');
    });

    it('handles zero baseline cleanly without division-by-zero error', () => {
      const res = calculateSafeDelta(0.0, 15.0, 'HIGHER_IS_BETTER');
      expect(res.absoluteDelta).toBe(15.0);
      expect(res.percentageDelta).toBeNull();
      expect(res.percentageExplanation).toContain('Baseline value is zero');
      expect(res.status).toBe('IMPROVED');
    });

    it('handles null/unavailable metric values safely', () => {
      const res = calculateSafeDelta(null, 10.0, 'HIGHER_IS_BETTER');
      expect(res.absoluteDelta).toBeNull();
      expect(res.status).toBe('INCOMPARABLE');
    });
  });

  describe('4. Reproducible Report Generator (JSON & Markdown)', () => {
    const reportData = {
      report_version: '1.0.0',
      exported_at: '2026-03-01T21:00:00.000Z',
      run: mockBaselineRun,
      paired_candidate_run: mockCandidateRun,
      comparison: mockComparisonReport,
      events: mockEvents,
      events_complete: true,
      total_events_in_run: 2,
      disclaimer: SIMULATION_DISCLAIMER,
    };

    it('generates valid JSON report containing scenario, seed 101, disclaimer, and events', () => {
      const jsonStr = generateSimulationJsonReport(reportData);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.schema_version).toBe('1.0.0');
      expect(parsed.disclaimer).toBe(SIMULATION_DISCLAIMER);
      expect(parsed.experiment.run_id).toBe('run_baseline_101');
      expect(parsed.experiment.seed).toBe(101);
      expect(parsed.event_stream.completeness).toBe('COMPLETE');
      expect(parsed.event_stream.events.length).toBe(2);
    });

    it('generates formatted Markdown report with comparison table and required disclaimer', () => {
      const mdStr = generateSimulationMarkdownReport(reportData);

      expect(mdStr).toContain('# DarkOps AI — Simulation Experiment & Evaluation Report');
      expect(mdStr).toContain(SIMULATION_DISCLAIMER);
      expect(mdStr).toContain('`run_baseline_101`');
      expect(mdStr).toContain('`run_optimized_101`');
      expect(mdStr).toContain('`manhattan-demo`');
      expect(mdStr).toContain('order_fill_rate');
      expect(mdStr).toContain('total_picker_travel_distance_meters');
      expect(mdStr).toContain('COMPLETE (All events exported)');
    });
  });

  describe('5. UI Presentation Components', () => {
    it('renders ScenarioConfigurationForm with default seed 101 and 12h duration', () => {
      const handleSubmit = vi.fn();
      renderWithProviders(
        <ScenarioConfigurationForm
          scenarios={mockScenarioTemplates}
          onSubmit={handleSubmit}
        />
      );

      const durationInput = screen.getByLabelText(/Duration/i) as HTMLInputElement;
      expect(durationInput.value).toBe('12');

      const seedInput = screen.getByLabelText(/Random Seed/i) as HTMLInputElement;
      expect(seedInput.value).toBe('101');

      // Submit form
      const form = document.getElementById('simulation-config-form')!;
      fireEvent.submit(form);

      expect(handleSubmit).toHaveBeenCalled();
      const submittedPayloads = handleSubmit.mock.calls[0][0];
      // By default policy_mode is 'paired', producing 2 payloads
      expect(submittedPayloads.length).toBe(2);
      expect(submittedPayloads[0].seed).toBe(101);
      expect(submittedPayloads[0].duration_hours).toBe(12);
    });

    it('renders VirtualClock with formatted virtual time and progress', () => {
      renderWithProviders(<VirtualClock run={mockBaselineRun} />);

      expect(screen.getByText(/Virtual Simulation Clock/i)).toBeInTheDocument();
      expect(screen.getByText(/100.0%/i)).toBeInTheDocument();
      expect(screen.getByText(/SUCCEEDED/i)).toBeInTheDocument();
    });

    it('renders QueueDepthPanel with recorded events count', () => {
      renderWithProviders(<QueueDepthPanel run={mockBaselineRun} />);

      expect(screen.getByText(/Queue State & Workload Observability/i)).toBeInTheDocument();
      expect(screen.getByText('142')).toBeInTheDocument();
    });

    it('renders PolicyComparisonPanel with required disclaimer and KPI cards', () => {
      renderWithProviders(
        <PolicyComparisonPanel
          runs={[mockBaselineRun, mockCandidateRun]}
          initialBaselineId="run_baseline_101"
          initialCandidateId="run_optimized_101"
        />
      );

      // Verify exact disclaimer is present in UI
      expect(
        screen.getByText(new RegExp(SIMULATION_DISCLAIMER, 'i'))
      ).toBeInTheDocument();

      // Verify fair conditions banner
      expect(screen.getByText(/Fair Experimental Conditions Verified/i)).toBeInTheDocument();
      expect(screen.getByText(/Evaluate A\/B Policy Impact/i)).toBeInTheDocument();
    });

    it('renders SimulationExecutionConsole and handles lifecycle disabled states', () => {
      renderWithProviders(<SimulationExecutionConsole run={mockBaselineRun} />);

      // A SUCCEEDED run cannot be paused or resumed
      const pauseBtn = screen.getByRole('button', { name: /Pause/i });
      expect(pauseBtn).toBeDisabled();

      const resumeBtn = screen.getByRole('button', { name: /Resume/i });
      expect(resumeBtn).toBeDisabled();

      // Reset is enabled on terminal run
      const resetBtn = screen.getByRole('button', { name: /Reset Run/i });
      expect(resetBtn).not.toBeDisabled();
    });

    it('renders ExportReportDialog with completeness notice and download buttons', () => {
      const handleClose = vi.fn();
      renderWithProviders(
        <ExportReportDialog
          isOpen={true}
          onClose={handleClose}
          run={{ ...mockBaselineRun, event_count: 2 }}
          events={mockEvents}
        />
      );

      expect(screen.getByText(/Export Reproducible Simulation Report/i)).toBeInTheDocument();
      expect(screen.getByText(/Download JSON/i)).toBeInTheDocument();
      expect(screen.getByText(/Download Markdown/i)).toBeInTheDocument();
      expect(screen.getByText(/Full authoritative event stream/i)).toBeInTheDocument();
      expect(screen.getByText(new RegExp(SIMULATION_DISCLAIMER, 'i'))).toBeInTheDocument();
    });
  });
});
