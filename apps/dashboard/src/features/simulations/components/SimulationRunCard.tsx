import React from 'react';
import { Play, Pause, CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { SimulationRun } from '../../../types/domain';

interface SimulationRunCardProps {
  run: SimulationRun;
  isSelected?: boolean;
  onSelect: (run: SimulationRun) => void;
}

export const SimulationRunCard: React.FC<SimulationRunCardProps> = ({
  run,
  isSelected = false,
  onSelect,
}) => {
  const start = new Date(run.start_time).getTime();
  const end = new Date(run.end_time).getTime();
  const current = new Date(run.current_virtual_time).getTime();
  const totalDurationMs = Math.max(1, end - start);
  const elapsedMs = Math.max(0, Math.min(totalDurationMs, current - start));
  const progressPct = Math.min(100, Math.max(0, (elapsedMs / totalDurationMs) * 100));

  const getStatusIcon = () => {
    switch (run.status) {
      case 'RUNNING':
        return <Play className="w-3.5 h-3.5 fill-cyan-400 text-cyan-400 animate-pulse" />;
      case 'PAUSED':
        return <Pause className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />;
      case 'SUCCEEDED':
        return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
      case 'FAILED':
        return <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />;
      case 'CANCELLED':
        return <XCircle className="w-3.5 h-3.5 text-slate-400" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-blue-400" />;
    }
  };

  return (
    <div
      onClick={() => onSelect(run)}
      className={`p-4 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? 'border-brand-500 bg-brand-500/10 shadow-md shadow-brand-500/10'
          : 'border-navy-750 bg-navy-850/70 hover:border-navy-600'
      }`}
      id={`run-card-${run.id}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="font-mono text-xs font-semibold text-white truncate max-w-[170px]">
            {run.id}
          </span>
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
            run.status === 'RUNNING'
              ? 'bg-cyan-500/20 text-cyan-300'
              : run.status === 'SUCCEEDED'
              ? 'bg-emerald-500/20 text-emerald-300'
              : run.status === 'PAUSED'
              ? 'bg-amber-500/20 text-amber-300'
              : run.status === 'FAILED'
              ? 'bg-rose-500/20 text-rose-300'
              : 'bg-navy-700 text-slate-400'
          }`}
        >
          {run.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 mb-3">
        <div>
          <span>Scenario: </span>
          <strong className="text-slate-200">{run.scenario_id}</strong>
        </div>
        <div>
          <span>Seed: </span>
          <strong className="text-cyan-400">{run.seed}</strong>
        </div>
        <div>
          <span>Events: </span>
          <strong className="text-slate-200">{run.event_count}</strong>
        </div>
        <div>
          <span>Policy: </span>
          <strong className="text-brand-300 truncate block">
            {run.config_snapshot?.policy_identifier || 'baseline'}
          </strong>
        </div>
      </div>

      {/* Progress */}
      <div className="w-full bg-navy-750 rounded-full h-1.5 overflow-hidden mb-1.5">
        <div
          className={`h-full ${
            run.status === 'SUCCEEDED'
              ? 'bg-emerald-400'
              : run.status === 'FAILED'
              ? 'bg-rose-400'
              : 'bg-brand-500'
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span>{progressPct.toFixed(0)}% simulated</span>
        <span>{new Date(run.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
};
