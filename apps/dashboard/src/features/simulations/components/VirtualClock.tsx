import React from 'react';
import { Clock, Play, Pause, CheckCircle, AlertTriangle, XCircle, Gauge } from 'lucide-react';
import { SimulationRun } from '../../../types/domain';

interface VirtualClockProps {
  run: SimulationRun;
  lastRefreshTime?: Date;
}

export const VirtualClock: React.FC<VirtualClockProps> = ({ run, lastRefreshTime = new Date() }) => {
  const start = new Date(run.start_time).getTime();
  const end = new Date(run.end_time).getTime();
  const current = new Date(run.current_virtual_time).getTime();

  const totalDurationMs = Math.max(1, end - start);
  const elapsedMs = Math.max(0, Math.min(totalDurationMs, current - start));
  const progressPct = Math.min(100, Math.max(0, (elapsedMs / totalDurationMs) * 100));

  const formatVirtualDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'UTC',
        hour12: false,
      }) + ' UTC';
    } catch {
      return isoString;
    }
  };

  const getStatusBadge = () => {
    switch (run.status) {
      case 'RUNNING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 animate-pulse">
            <Play className="w-3 h-3 fill-cyan-400" /> RUNNING
          </span>
        );
      case 'PAUSED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Pause className="w-3 h-3 fill-amber-400" /> PAUSED
          </span>
        );
      case 'SUCCEEDED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle className="w-3 h-3" /> SUCCEEDED
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <AlertTriangle className="w-3 h-3" /> FAILED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/15 text-slate-400 border border-slate-500/30">
            <XCircle className="w-3 h-3" /> CANCELLED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <Clock className="w-3 h-3" /> QUEUED
          </span>
        );
    }
  };

  return (
    <div className="bg-navy-900 border border-navy-750 rounded-xl p-5 shadow-sm" id="virtual-clock-container">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white tracking-wide uppercase">
            Virtual Simulation Clock
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge()}
          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-navy-800 text-slate-400 border border-navy-700">
            <Gauge className="w-3 h-3" /> Max Speed
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-navy-850/80 p-3 rounded-lg border border-navy-750">
          <span className="text-xs text-slate-400 block mb-1">Current Virtual Time</span>
          <span className="text-base font-bold font-mono text-cyan-300" id="current-virtual-time">
            {formatVirtualDate(run.current_virtual_time)}
          </span>
        </div>

        <div className="bg-navy-850/80 p-3 rounded-lg border border-navy-750">
          <span className="text-xs text-slate-400 block mb-1">Configured Horizon</span>
          <span className="text-xs font-mono text-slate-300 block">
            {formatVirtualDate(run.start_time)} →
          </span>
          <span className="text-xs font-mono text-slate-300 block">
            {formatVirtualDate(run.end_time)}
          </span>
        </div>

        <div className="bg-navy-850/80 p-3 rounded-lg border border-navy-750">
          <span className="text-xs text-slate-400 block mb-1">Elapsed Virtual Progress</span>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold font-mono text-white">
              {progressPct.toFixed(1)}%
            </span>
            <span className="text-xs text-slate-400">
              {(elapsedMs / 3600000).toFixed(2)}h / {(totalDurationMs / 3600000).toFixed(1)}h
            </span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-navy-800 rounded-full h-2.5 overflow-hidden border border-navy-700 mb-3">
        <div
          id="virtual-clock-progress-bar"
          className="h-full bg-gradient-to-r from-brand-500 via-cyan-400 to-emerald-400 transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>
          Discrete-event virtual clock advances monotonically with processed events.
        </span>
        <span>
          Refreshed: {lastRefreshTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>
    </div>
  );
};
