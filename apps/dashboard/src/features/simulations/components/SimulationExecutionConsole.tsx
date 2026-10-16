import React, { useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  XCircle,
  Terminal,
  AlertCircle,
  FileDown,
} from 'lucide-react';
import { SimulationRun, EvaluationSummary } from '../../../types/domain';
import { useSimulationControls } from '../hooks/useSimulationControls';
import { VirtualClock } from './VirtualClock';
import { QueueDepthPanel } from './QueueDepthPanel';
import { Button } from '../../../components/ui/Button';

interface SimulationExecutionConsoleProps {
  run: SimulationRun;
  evaluation?: EvaluationSummary | null;
  onOpenExport?: () => void;
}

export const SimulationExecutionConsole: React.FC<SimulationExecutionConsoleProps> = ({
  run,
  evaluation,
  onOpenExport,
}) => {
  const {
    pauseRun,
    resumeRun,
    cancelRun,
    resetRun,
    isPausing,
    isResuming,
    isCancelling,
    isResetting,
    isAnyPending,
  } = useSimulationControls(run.id);

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const canPause = run.status === 'RUNNING';
  const canResume = run.status === 'PAUSED';
  const canCancel = run.status === 'QUEUED' || run.status === 'RUNNING' || run.status === 'PAUSED';
  const canReset = run.status === 'SUCCEEDED' || run.status === 'FAILED' || run.status === 'CANCELLED';

  const handleConfirmReset = () => {
    resetRun();
    setShowResetConfirm(false);
  };

  return (
    <div className="space-y-6" id="simulation-execution-console">
      {/* Console Top Header */}
      <div className="bg-navy-900 border border-navy-750 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Terminal className="w-5 h-5 text-brand-400" />
            <h2 className="text-base font-bold text-white font-mono">
              Run: {run.id}
            </h2>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                run.status === 'RUNNING'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse'
                  : run.status === 'SUCCEEDED'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : run.status === 'PAUSED'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : run.status === 'FAILED'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'bg-navy-700 text-slate-400 border border-navy-600'
              }`}
            >
              {run.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>
              Scenario: <strong className="text-slate-200">{run.scenario_id}</strong>
            </span>
            <span>•</span>
            <span>
              Seed: <strong className="text-cyan-400">{run.seed}</strong>
            </span>
            <span>•</span>
            <span>
              Policy: <strong className="text-brand-300">{run.config_snapshot?.policy_identifier || 'baseline'}</strong>
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Pause */}
          <Button
            id="btn-pause-simulation"
            onClick={() => pauseRun()}
            disabled={!canPause || isAnyPending}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 ${
              canPause
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-navy-800 text-slate-500 border border-navy-750 cursor-not-allowed opacity-50'
            }`}
          >
            <Pause className="w-3.5 h-3.5 fill-current" />
            <span>{isPausing ? 'Pausing...' : 'Pause'}</span>
          </Button>

          {/* Resume */}
          <Button
            id="btn-resume-simulation"
            onClick={() => resumeRun()}
            disabled={!canResume || isAnyPending}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 ${
              canResume
                ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                : 'bg-navy-800 text-slate-500 border border-navy-750 cursor-not-allowed opacity-50'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isResuming ? 'Resuming...' : 'Resume'}</span>
          </Button>

          {/* Cancel */}
          <Button
            id="btn-cancel-simulation"
            onClick={() => cancelRun('Cancelled by operator from console')}
            disabled={!canCancel || isAnyPending}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 ${
              canCancel
                ? 'bg-rose-600/80 hover:bg-rose-600 text-white'
                : 'bg-navy-800 text-slate-500 border border-navy-750 cursor-not-allowed opacity-50'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>{isCancelling ? 'Cancelling...' : 'Cancel'}</span>
          </Button>

          {/* Reset */}
          <Button
            id="btn-reset-simulation"
            onClick={() => setShowResetConfirm(true)}
            disabled={!canReset || isAnyPending}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 ${
              canReset
                ? 'bg-navy-750 hover:bg-navy-700 text-slate-200 border border-navy-600'
                : 'bg-navy-800 text-slate-500 border border-navy-750 cursor-not-allowed opacity-50'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isResetting ? 'Resetting...' : 'Reset Run'}</span>
          </Button>

          {/* Export Report */}
          {onOpenExport && (
            <Button
              id="btn-open-export"
              onClick={onOpenExport}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-navy-800 hover:bg-navy-750 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Export Report</span>
            </Button>
          )}
        </div>
      </div>

      {/* Confirmation Dialog for Destructive Reset */}
      {showResetConfirm && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-start justify-between gap-3 animate-fadeIn">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-rose-200">Confirm Run Reset</h4>
              <p className="text-xs text-rose-300/80 mt-0.5">
                Resetting will clear all run-scoped simulation events and evaluations for run{' '}
                <strong>{run.id}</strong>. Other simulation runs and live store catalogs remain untouched.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowResetConfirm(false)}
              className="px-3 py-1 text-xs text-slate-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              id="btn-confirm-reset"
              onClick={handleConfirmReset}
              className="px-3 py-1 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-lg shadow-sm"
            >
              Confirm Reset
            </button>
          </div>
        </div>
      )}

      {/* Virtual Clock Panel */}
      <VirtualClock run={run} />

      {/* Queue State Observability */}
      <QueueDepthPanel run={run} evaluation={evaluation} />
    </div>
  );
};
