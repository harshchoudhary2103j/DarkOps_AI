import React from 'react';
import { Layers, Activity, Inbox, ShieldCheck } from 'lucide-react';
import { SimulationRun, EvaluationSummary } from '../../../types/domain';

interface QueueDepthPanelProps {
  run: SimulationRun;
  evaluation?: EvaluationSummary | null;
}

export const QueueDepthPanel: React.FC<QueueDepthPanelProps> = ({ run, evaluation }) => {
  const peakQueue = evaluation?.kpis?.peak_queue_depth?.value ?? 0;
  const meanQueue = evaluation?.kpis?.mean_queue_depth?.value ?? 0;
  const backlogHours = evaluation?.kpis?.backlog_order_hours?.value ?? 0;

  return (
    <div className="bg-navy-900 border border-navy-750 rounded-xl p-5 shadow-sm" id="queue-depth-panel">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="w-5 h-5 text-brand-400" />
        <h3 className="text-sm font-semibold text-white tracking-wide uppercase">
          Queue State & Workload Observability
        </h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-navy-850 p-3.5 rounded-lg border border-navy-750">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <Activity className="w-3.5 h-3.5 text-brand-400" />
            <span>Recorded Events</span>
          </div>
          <span className="text-xl font-bold font-mono text-white" id="stat-event-count">
            {run.event_count.toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Persisted to Postgres</span>
        </div>

        <div className="bg-navy-850 p-3.5 rounded-lg border border-navy-750">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <Inbox className="w-3.5 h-3.5 text-cyan-400" />
            <span>Peak Allocation Queue</span>
          </div>
          <span className="text-xl font-bold font-mono text-cyan-300" id="stat-peak-queue">
            {peakQueue}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Orders in queue</span>
        </div>

        <div className="bg-navy-850 p-3.5 rounded-lg border border-navy-750">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>Mean Queue Depth</span>
          </div>
          <span className="text-xl font-bold font-mono text-amber-300" id="stat-mean-queue">
            {meanQueue}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Average waiting orders</span>
        </div>

        <div className="bg-navy-850 p-3.5 rounded-lg border border-navy-750">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Backlog Workload</span>
          </div>
          <span className="text-xl font-bold font-mono text-emerald-300" id="stat-backlog-hours">
            {backlogHours}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Order-hours integral</span>
        </div>
      </div>
    </div>
  );
};
