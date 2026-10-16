import React from 'react';
import { BarChart3 } from 'lucide-react';
import { MetricComparisonResult } from '../../../types/domain';

interface KPIComparisonChartProps {
  comparisons: Record<string, MetricComparisonResult>;
}

export const KPIComparisonChart: React.FC<KPIComparisonChartProps> = ({ comparisons }) => {
  const chartMetrics = [
    { key: 'order_fill_rate', label: 'Order Fill Rate', unit: '%' },
    { key: 'total_picker_travel_distance_meters', label: 'Picker Travel Distance', unit: 'm' },
    { key: 'turnaround_time_seconds', label: 'Turnaround Time', unit: 's' },
    { key: 'total_cost', label: 'Total Operating Cost', unit: 'USD' },
  ];

  return (
    <div className="bg-navy-900 border border-navy-750 rounded-xl p-5 shadow-sm space-y-4" id="kpi-comparison-chart">
      <div className="flex items-center justify-between border-b border-navy-750 pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-brand-400" />
          <h3 className="text-sm font-semibold text-white tracking-wide uppercase">
            Side-by-Side KPI Visualizer
          </h3>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-3 h-3 rounded-sm bg-navy-600 inline-block" />
            <span>Baseline</span>
          </div>
          <div className="flex items-center gap-1.5 text-cyan-300">
            <span className="w-3 h-3 rounded-sm bg-cyan-500 inline-block" />
            <span>Optimized Candidate</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {chartMetrics.map((m) => {
          const comp = comparisons[m.key];
          if (!comp) return null;

          const bVal = comp.baseline_value ?? 0;
          const cVal = comp.candidate_value ?? 0;
          const maxVal = Math.max(1, Math.max(Math.abs(bVal), Math.abs(cVal)));

          const bPct = Math.min(100, (Math.abs(bVal) / maxVal) * 100);
          const cPct = Math.min(100, (Math.abs(cVal) / maxVal) * 100);

          return (
            <div key={m.key} className="bg-navy-850 p-4 rounded-lg border border-navy-750">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-semibold text-slate-200">{m.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    comp.improvement_status === 'IMPROVED'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : comp.improvement_status === 'DEGRADED'
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-navy-750 text-slate-400'
                  }`}
                >
                  {comp.improvement_status}
                </span>
              </div>

              {/* Baseline Bar */}
              <div className="space-y-1 mb-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Baseline</span>
                  <span className="font-mono text-slate-300">
                    {bVal !== null ? `${bVal} ${m.unit}` : 'N/A'}
                  </span>
                </div>
                <div className="w-full bg-navy-800 rounded-full h-2 overflow-hidden">
                  <div className="h-full bg-slate-500 transition-all duration-500" style={{ width: `${bPct}%` }} />
                </div>
              </div>

              {/* Candidate Bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-cyan-300">
                  <span>Optimized</span>
                  <span className="font-mono text-cyan-200">
                    {cVal !== null ? `${cVal} ${m.unit}` : 'N/A'}
                  </span>
                </div>
                <div className="w-full bg-navy-800 rounded-full h-2 overflow-hidden">
                  <div className="h-full bg-cyan-500 transition-all duration-500" style={{ width: `${cPct}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
