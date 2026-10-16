import React, { useState } from 'react';
import {
  History,
  Search,
  Eye,
  FileDown,
  CheckCircle,
  Play,
  Pause,
  AlertTriangle,
  XCircle,
  Clock,
} from 'lucide-react';
import { SimulationRun } from '../../../types/domain';

interface RunHistoryPanelProps {
  runs: SimulationRun[];
  activeRunId?: string;
  onSelectRun: (run: SimulationRun) => void;
  onExportRun: (run: SimulationRun) => void;
}

export const RunHistoryPanel: React.FC<RunHistoryPanelProps> = ({
  runs,
  activeRunId,
  onSelectRun,
  onExportRun,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredRuns = runs.filter((r) => {
    const matchSearch =
      r.id.toLowerCase().includes(search.toLowerCase()) ||
      r.scenario_id.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RUNNING':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
            <Play className="w-2.5 h-2.5 fill-current" /> RUNNING
          </span>
        );
      case 'SUCCEEDED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <CheckCircle className="w-2.5 h-2.5" /> SUCCEEDED
          </span>
        );
      case 'PAUSED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <Pause className="w-2.5 h-2.5 fill-current" /> PAUSED
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
            <AlertTriangle className="w-2.5 h-2.5" /> FAILED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400 border border-slate-500/40">
            <XCircle className="w-2.5 h-2.5" /> CANCELLED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-navy-700 text-slate-300 border border-navy-600">
            <Clock className="w-2.5 h-2.5" /> QUEUED
          </span>
        );
    }
  };

  return (
    <div className="bg-navy-900 border border-navy-750 rounded-xl p-5 shadow-sm space-y-4" id="run-history-panel">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-navy-750 pb-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-brand-400" />
          <h3 className="text-sm font-semibold text-white tracking-wide uppercase">
            Simulation Run History & Artifact Archive
          </h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-navy-800 text-slate-300 font-mono">
            {runs.length} runs
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search run ID or scenario..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-navy-850 border border-navy-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 w-52"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-navy-850 border border-navy-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="QUEUED">Queued</option>
            <option value="RUNNING">Running</option>
            <option value="PAUSED">Paused</option>
            <option value="SUCCEEDED">Succeeded</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Runs Table */}
      {filteredRuns.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400">
          No simulation runs match the search or status criteria.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" id="table-simulation-runs">
            <thead className="bg-navy-850/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-navy-750">
              <tr>
                <th className="py-2.5 px-3">Run ID</th>
                <th className="py-2.5 px-3">Scenario</th>
                <th className="py-2.5 px-3">Seed</th>
                <th className="py-2.5 px-3">Policy</th>
                <th className="py-2.5 px-3">Events</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Created</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-750/60 font-mono">
              {filteredRuns.map((r) => {
                const isActive = r.id === activeRunId;
                return (
                  <tr
                    key={r.id}
                    className={`hover:bg-navy-850/60 transition-colors ${
                      isActive ? 'bg-brand-500/10' : ''
                    }`}
                  >
                    <td className="py-3 px-3 font-semibold text-white">
                      <div className="flex items-center gap-1.5">
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />}
                        <span>{r.id}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-300 font-sans">{r.scenario_id}</td>
                    <td className="py-3 px-3 text-cyan-400">{r.seed}</td>
                    <td className="py-3 px-3 text-brand-300 font-sans">
                      {r.config_snapshot?.policy_identifier || 'baseline'}
                    </td>
                    <td className="py-3 px-3 text-slate-300">{r.event_count}</td>
                    <td className="py-3 px-3">{getStatusBadge(r.status)}</td>
                    <td className="py-3 px-3 text-slate-400 font-sans text-[11px]">
                      {new Date(r.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onSelectRun(r)}
                          className="px-2 py-1 rounded bg-navy-800 hover:bg-navy-750 text-slate-200 border border-navy-700 hover:border-brand-500 flex items-center gap-1 font-sans text-xs transition-colors"
                          title="Inspect run in execution console"
                        >
                          <Eye className="w-3 h-3 text-brand-400" />
                          <span>Inspect</span>
                        </button>
                        <button
                          onClick={() => onExportRun(r)}
                          className="px-2 py-1 rounded bg-navy-800 hover:bg-navy-750 text-cyan-300 border border-navy-700 hover:border-cyan-500 flex items-center gap-1 font-sans text-xs transition-colors"
                          title="Export report artifacts"
                        >
                          <FileDown className="w-3 h-3 text-cyan-400" />
                          <span>Export</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
