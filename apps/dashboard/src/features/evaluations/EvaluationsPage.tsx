import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  TrendingDown,
  TrendingUp,
  FlaskConical,
  Scale,
  Play,
  ShieldAlert,
} from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api-client';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/feedback/ToastProvider';
import { EvaluationComparisonReport, EvaluationKPI } from '../../types/domain';
import { formatNumber, formatPercent } from '../../lib/formatters';

export const EvaluationsPage: React.FC = () => {
  const { showSuccess, showError } = useToast();

  const [baselineRunId, setBaselineRunId] = useState('sim-run-baseline-001');
  const [candidateRunId, setCandidateRunId] = useState('sim-run-optimized-001');
  const [comparisonReport, setComparisonReport] = useState<EvaluationComparisonReport | null>(null);

  // Compare Runs Mutation
  const compareMutation = useMutation({
    mutationFn: ({ baseId, candId }: { baseId: string; candId: string }) =>
      apiClient.compareEvaluationRuns(baseId, candId),
    onSuccess: (resp) => {
      setComparisonReport(resp.data);
      showSuccess('Comparison Evaluated', 'Derived fair comparison KPIs from recorded simulation event streams.');
    },
    onError: (err: ApiError) => {
      showError('Evaluation Failed', err.message || 'Cannot compare specified simulation runs.');
    },
  });

  const handleRunComparison = () => {
    if (!baselineRunId.trim() || !candidateRunId.trim()) {
      showError('Missing Run IDs', 'Enter both baseline and candidate simulation run IDs.');
      return;
    }
    compareMutation.mutate({ baseId: baselineRunId.trim(), candId: candidateRunId.trim() });
  };

  // Synthetic Default Comparison KPIs (Phase 07 contracts)
  const defaultKPIs: EvaluationKPI[] = [
    {
      code: 'FULFILLMENT_RATE',
      name: 'Order Fulfillment Rate',
      category: 'SERVICE_LEVEL',
      unit: '%',
      direction: 'MAXIMIZE',
      baseline_value: 91.5,
      candidate_value: 98.2,
      absolute_delta: 6.7,
      percentage_delta: 7.3,
      status: 'AVAILABLE',
    },
    {
      code: 'AVG_DELIVERY_TIME',
      name: 'Mean Delivery Duration',
      category: 'FULFILLMENT',
      unit: 'min',
      direction: 'MINIMIZE',
      baseline_value: 18.4,
      candidate_value: 14.1,
      absolute_delta: -4.3,
      percentage_delta: -23.4,
      status: 'AVAILABLE',
    },
    {
      code: 'PICKER_DISTANCE_TOTAL',
      name: 'Total Picker Travel Distance',
      category: 'ROUTING',
      unit: 'm',
      direction: 'MINIMIZE',
      baseline_value: 4494.0,
      candidate_value: 4182.0,
      absolute_delta: -312.0,
      percentage_delta: -6.94,
      status: 'AVAILABLE',
    },
    {
      code: 'TOTAL_LOGISTICS_COST',
      name: 'Total Logistics Cost',
      category: 'COST',
      unit: 'USD',
      direction: 'MINIMIZE',
      baseline_value: 71.5,
      candidate_value: 64.5,
      absolute_delta: -7.0,
      percentage_delta: -9.8,
      status: 'AVAILABLE',
    },
    {
      code: 'SLA_BREACH_COUNT',
      name: 'SLA Breaches (>20m)',
      category: 'SERVICE_LEVEL',
      unit: 'orders',
      direction: 'MINIMIZE',
      baseline_value: 8.0,
      candidate_value: 1.0,
      absolute_delta: -7.0,
      percentage_delta: -87.5,
      status: 'AVAILABLE',
    },
  ];

  const activeKPIs = comparisonReport?.kpis || defaultKPIs;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-cyan-400" />
            Simulation Lab & Policy Evaluation
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Deterministic event-derived KPI evaluations comparing baseline heuristics (Phase 06) with OR-Tools solvers (Phase 08).
          </p>
        </div>
      </div>

      {/* Prominent Simulated Estimates Notice */}
      <div
        className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs flex items-start gap-3"
        role="alert"
      >
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-amber-300">Simulated Estimate Notice:</span> All figures, metric improvements,
          and cost comparisons displayed in this view are computed from discrete-event virtual clock simulations and
          synthetic demand observations. They do not represent audited financial statements or guaranteed real-world improvements.
        </div>
      </div>

      {/* Comparison Selector Card */}
      <Card>
        <CardHeader
          title="Fair Policy Evaluation Pair"
          description="Evaluate two simulation runs executed under identical random seeds and customer demand profiles"
          icon={<Scale className="w-4 h-4 text-brand-400" />}
        />
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Baseline Run ID (Phase 06 Heuristics):
              </label>
              <input
                type="text"
                value={baselineRunId}
                onChange={(e) => setBaselineRunId(e.target.value)}
                className="w-full bg-navy-950 border border-navy-750 rounded-xl px-3 py-2 text-xs font-mono text-amber-400 focus:outline-none focus:border-cyan-400"
                placeholder="e.g. sim-run-baseline-001"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Candidate Run ID (Phase 08 OR-Tools):
              </label>
              <input
                type="text"
                value={candidateRunId}
                onChange={(e) => setCandidateRunId(e.target.value)}
                className="w-full bg-navy-950 border border-navy-750 rounded-xl px-3 py-2 text-xs font-mono text-cyan-400 focus:outline-none focus:border-cyan-400"
                placeholder="e.g. sim-run-optimized-001"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={handleRunComparison}
              isLoading={compareMutation.isPending}
              leftIcon={<Play className="w-3.5 h-3.5" />}
              id="btn-run-evaluation-compare"
            >
              Evaluate Policy Comparison
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI Evaluation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeKPIs.map((kpi) => {
          const isImprovement =
            kpi.direction === 'MINIMIZE' ? kpi.percentage_delta < 0 : kpi.percentage_delta > 0;

          return (
            <Card key={kpi.code} className="border-navy-750">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300 truncate">{kpi.name}</span>
                  <Badge variant={isImprovement ? 'emerald' : 'amber'} size="sm">
                    {kpi.direction}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">Baseline:</span>
                    <span className="text-amber-400 font-bold">
                      {formatNumber(kpi.baseline_value, 1)} {kpi.unit}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">Candidate:</span>
                    <span className="text-cyan-400 font-bold">
                      {formatNumber(kpi.candidate_value, 1)} {kpi.unit}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-navy-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400 text-[11px]">Measured Delta:</span>
                  <div
                    className={`font-mono font-bold flex items-center gap-1 ${
                      isImprovement ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isImprovement ? (
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                    )}
                    {formatPercent(kpi.percentage_delta)}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
