import React, { useState } from 'react';
import {
  Scale,
  TrendingDown,
  TrendingUp,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RotateCw,
  Info,
  DollarSign,
  Truck,
  Box,
  Clock,
  Navigation,
} from 'lucide-react';
import { SimulationRun, ComparisonReport } from '../../../types/domain';
import { useCompareRuns } from '../hooks/useSimulationEvaluation';
import {
  SIMULATION_DISCLAIMER,
  validateFairComparison,
} from '../lib/comparison-validation';
import { KPIComparisonChart } from './KPIComparisonChart';
import { Button } from '../../../components/ui/Button';

interface PolicyComparisonPanelProps {
  runs: SimulationRun[];
  initialBaselineId?: string;
  initialCandidateId?: string;
}

export const PolicyComparisonPanel: React.FC<PolicyComparisonPanelProps> = ({
  runs,
  initialBaselineId,
  initialCandidateId,
}) => {
  const [baselineId, setBaselineId] = useState<string>(initialBaselineId || runs[0]?.id || '');
  const [candidateId, setCandidateId] = useState<string>(initialCandidateId || runs[1]?.id || runs[0]?.id || '');
  const [report, setReport] = useState<ComparisonReport | null>(null);

  const compareMutation = useCompareRuns();

  const baselineRun = runs.find((r) => r.id === baselineId);
  const candidateRun = runs.find((r) => r.id === candidateId);

  const fairCheck = validateFairComparison(baselineRun, candidateRun, null, null, report);

  const handleRunComparison = () => {
    if (!baselineId || !candidateId) return;
    compareMutation.mutate(
      { baselineRunId: baselineId, candidateRunId: candidateId },
      {
        onSuccess: (resp) => {
          setReport(resp.data);
        },
      }
    );
  };

  const getMetricIcon = (name: string) => {
    switch (name) {
      case 'order_fill_rate':
        return <Box className="w-4 h-4 text-emerald-400" />;
      case 'stockout_rate':
        return <AlertTriangle className="w-4 h-4 text-rose-400" />;
      case 'total_picker_travel_distance_meters':
        return <Navigation className="w-4 h-4 text-cyan-400" />;
      case 'turnaround_time_seconds':
        return <Clock className="w-4 h-4 text-amber-400" />;
      case 'total_cost':
        return <DollarSign className="w-4 h-4 text-emerald-400" />;
      default:
        return <Truck className="w-4 h-4 text-brand-400" />;
    }
  };

  return (
    <div className="space-y-6" id="policy-comparison-panel">
      {/* Header & Run Selectors */}
      <div className="bg-navy-900 border border-navy-750 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-navy-750 pb-4">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-semibold text-white">
              A/B Policy Evaluation & Fair Comparison Lab
            </h3>
          </div>
          <Button
            id="btn-evaluate-comparison"
            onClick={handleRunComparison}
            disabled={!baselineId || !candidateId || compareMutation.isPending}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-md shadow-cyan-600/20"
          >
            {compareMutation.isPending ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>Evaluating...</span>
              </>
            ) : (
              <>
                <Scale className="w-3.5 h-3.5" />
                <span>Evaluate A/B Policy Impact</span>
              </>
            )}
          </Button>
        </div>

        {/* Run Selector Dropdowns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-navy-850 p-3.5 rounded-lg border border-navy-750">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Baseline Run (Reference Model)
            </label>
            <select
              id="select-baseline-run"
              value={baselineId}
              onChange={(e) => setBaselineId(e.target.value)}
              className="w-full bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
            >
              <option value="">Select Baseline Run</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id} ({r.scenario_id} | Seed: {r.seed} | {r.status})
                </option>
              ))}
            </select>
            {baselineRun && (
              <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-2">
                <span>Policy: <strong className="text-slate-200">{baselineRun.config_snapshot?.policy_identifier || 'baseline'}</strong></span>
                <span>•</span>
                <span>Seed: <strong className="text-cyan-400">{baselineRun.seed}</strong></span>
                <span>•</span>
                <span>Status: <strong className="text-emerald-400">{baselineRun.status}</strong></span>
              </div>
            )}
          </div>

          <div className="bg-navy-850 p-3.5 rounded-lg border border-navy-750">
            <label className="block text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-1.5">
              Candidate Run (Optimized Policy)
            </label>
            <select
              id="select-candidate-run"
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              className="w-full bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
            >
              <option value="">Select Candidate Run</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id} ({r.scenario_id} | Seed: {r.seed} | {r.status})
                </option>
              ))}
            </select>
            {candidateRun && (
              <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-2">
                <span>Policy: <strong className="text-cyan-300">{candidateRun.config_snapshot?.policy_identifier || 'optimized'}</strong></span>
                <span>•</span>
                <span>Seed: <strong className="text-cyan-400">{candidateRun.seed}</strong></span>
                <span>•</span>
                <span>Status: <strong className="text-emerald-400">{candidateRun.status}</strong></span>
              </div>
            )}
          </div>
        </div>

        {/* Fair Comparison Invariant Banner */}
        <div
          id="fair-comparison-banner"
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            fairCheck.isFair
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-amber-500/10 border-amber-500/30'
          }`}
        >
          {fairCheck.isFair ? (
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          )}
          <div className="text-xs space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <span className={fairCheck.isFair ? 'text-emerald-300' : 'text-amber-300'}>
                {fairCheck.isFair
                  ? 'Fair Experimental Conditions Verified'
                  : 'Experimental Incompatibilities Detected'}
              </span>
              <span className="text-[10px] px-2 py-0.2 rounded bg-navy-900/80 font-mono text-slate-300">
                Identical Seed: {baselineRun?.seed === candidateRun?.seed ? 'YES' : 'NO'}
              </span>
            </div>
            {fairCheck.reasons.length > 0 && (
              <ul className="list-disc list-inside text-amber-300/90 space-y-0.5 pt-1">
                {fairCheck.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
            {fairCheck.warnings.length > 0 && (
              <div className="text-slate-300 text-[11px] pt-1">
                {fairCheck.warnings.map((w, i) => (
                  <div key={i}>⚠️ {w}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mandatory Disclaimer Box */}
      <div
        id="simulation-disclaimer-box"
        className="bg-navy-950 border border-navy-750/80 rounded-xl px-4 py-3 flex items-center gap-3 text-xs text-slate-400"
      >
        <Info className="w-4 h-4 text-cyan-400 shrink-0" />
        <p className="italic">
          <strong>Mandatory Notice:</strong> {SIMULATION_DISCLAIMER}
        </p>
      </div>

      {/* Comparison Results */}
      {compareMutation.isError && (
        <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-xl text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>Evaluation Error: {(compareMutation.error as any)?.message || 'Failed to compare runs.'}</span>
        </div>
      )}

      {report && (
        <>
          {/* Side by side chart visualizer */}
          <KPIComparisonChart comparisons={report.comparisons} />

          {/* Metric Comparison Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="kpi-comparison-cards">
            {Object.entries(report.comparisons).map(([metricKey, m]) => {
              const bVal = m.baseline_value;
              const cVal = m.candidate_value;
              const delta = m.absolute_difference;
              const pct = m.percentage_change;
              const pctExpl = m.percentage_change_explanation;
              const outcome = m.improvement_status;

              return (
                <div
                  key={metricKey}
                  className="bg-navy-900 border border-navy-750 rounded-xl p-4 shadow-sm space-y-3"
                  id={`kpi-card-${metricKey}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {getMetricIcon(metricKey)}
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        {metricKey.replace(/_/g, ' ')}
                      </h4>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        outcome === 'IMPROVED'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : outcome === 'DEGRADED'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-navy-800 text-slate-400 border border-navy-700'
                      }`}
                    >
                      {outcome}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-navy-850 p-2.5 rounded-lg border border-navy-750">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Baseline</span>
                      <strong className="text-sm font-mono text-slate-200">
                        {bVal !== null ? `${bVal} ${m.unit}` : 'N/A'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-cyan-400 block">Candidate</span>
                      <strong className="text-sm font-mono text-cyan-300">
                        {cVal !== null ? `${cVal} ${m.unit}` : 'N/A'}
                      </strong>
                    </div>
                  </div>

                  {/* Delta & % Change */}
                  <div className="flex items-center justify-between text-xs pt-1">
                    <div className="flex items-center gap-1.5">
                      {outcome === 'IMPROVED' ? (
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                      ) : outcome === 'DEGRADED' ? (
                        <TrendingDown className="w-4 h-4 text-rose-400" />
                      ) : null}
                      <span className="text-slate-400">Delta:</span>
                      <strong
                        className={`font-mono ${
                          outcome === 'IMPROVED'
                            ? 'text-emerald-400'
                            : outcome === 'DEGRADED'
                            ? 'text-rose-400'
                            : 'text-slate-300'
                        }`}
                      >
                        {delta !== undefined && delta !== null
                          ? `${delta > 0 ? '+' : ''}${delta} ${m.unit}`
                          : 'N/A'}
                      </strong>
                    </div>

                    <div className="text-right">
                      {pct !== undefined && pct !== null ? (
                        <span
                          className={`font-mono font-semibold ${
                            outcome === 'IMPROVED'
                              ? 'text-emerald-400'
                              : outcome === 'DEGRADED'
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {pct > 0 ? '+' : ''}
                          {pct}%
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500">{pctExpl || 'N/A'}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
