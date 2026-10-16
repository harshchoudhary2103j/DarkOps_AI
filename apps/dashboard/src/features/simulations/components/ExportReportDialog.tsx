import React from 'react';
import {
  FileDown,
  X,
  FileText,
  FileCode,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { SimulationRun, EvaluationSummary, ComparisonReport, SimulationEvent } from '../../../types/domain';
import {
  generateSimulationJsonReport,
  generateSimulationMarkdownReport,
  downloadFile,
} from '../lib/report-export';
import { SIMULATION_DISCLAIMER } from '../lib/comparison-validation';
import { Button } from '../../../components/ui/Button';

interface ExportReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  run: SimulationRun;
  pairedCandidateRun?: SimulationRun | null;
  evaluation?: EvaluationSummary | null;
  comparison?: ComparisonReport | null;
  events?: SimulationEvent[];
}

export const ExportReportDialog: React.FC<ExportReportDialogProps> = ({
  isOpen,
  onClose,
  run,
  pairedCandidateRun,
  evaluation,
  comparison,
  events = [],
}) => {
  if (!isOpen) return null;

  const eventsComplete = events.length >= run.event_count;
  const exportedAt = new Date().toISOString();

  const exportData = {
    report_version: '1.0.0',
    exported_at: exportedAt,
    run,
    paired_candidate_run: pairedCandidateRun,
    evaluation,
    comparison,
    events,
    events_complete: eventsComplete,
    total_events_in_run: run.event_count,
    disclaimer: SIMULATION_DISCLAIMER,
  };

  const handleDownloadJson = () => {
    const jsonStr = generateSimulationJsonReport(exportData);
    const filename = `darkops_simulation_report_${run.id}_${Date.now()}.json`;
    downloadFile(jsonStr, filename, 'application/json');
  };

  const handleDownloadMarkdown = () => {
    const mdStr = generateSimulationMarkdownReport(exportData);
    const filename = `darkops_simulation_report_${run.id}_${Date.now()}.md`;
    downloadFile(mdStr, filename, 'text/markdown');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-navy-900 border border-navy-750 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-navy-750 flex items-center justify-between bg-navy-850">
          <div className="flex items-center gap-2">
            <FileDown className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">
              Export Reproducible Simulation Report
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-navy-750 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-navy-850 p-4 rounded-xl border border-navy-750 font-mono">
            <div>
              <span className="text-[10px] text-slate-400 block font-sans">Run ID</span>
              <strong className="text-white truncate block">{run.id}</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-sans">Scenario</span>
              <strong className="text-slate-200 block">{run.scenario_id}</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-sans">Seed</span>
              <strong className="text-cyan-400 block">{run.seed}</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-sans">Status</span>
              <strong className="text-emerald-400 block">{run.status}</strong>
            </div>
          </div>

          {/* Event Stream Completeness Indicator */}
          <div className="p-4 rounded-xl border border-navy-750 bg-navy-850/60 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-semibold text-white">Event Log Completeness</h4>
              <p className="text-slate-400">
                {eventsComplete ? (
                  <span className="text-emerald-300">
                    Full authoritative event stream ({events.length} of {run.event_count} events) will be included in the report artifact.
                  </span>
                ) : (
                  <span className="text-amber-300">
                    Paginated event subset ({events.length} of {run.event_count} recorded events) is loaded. The exported report artifact will be explicitly tagged as <code>PAGINATED_PARTIAL</code>.
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Mandatory Disclaimer */}
          <div className="bg-navy-950 p-3.5 rounded-xl border border-navy-750/80 text-slate-400 italic flex items-center gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              <strong>Disclaimer Included in Report:</strong> {SIMULATION_DISCLAIMER}
            </span>
          </div>

          {/* Export Options Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="bg-navy-850 p-4 rounded-xl border border-navy-750 hover:border-brand-500 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2 text-brand-400">
                  <FileCode className="w-5 h-5" />
                  <span className="font-bold text-white text-sm">JSON Artifact</span>
                </div>
                <p className="text-slate-400 mb-4">
                  Machine-readable JSON schema with effective scenario snapshot, seed, evaluator version, full KPI breakdown, and event log.
                </p>
              </div>
              <Button
                id="btn-download-json-report"
                onClick={handleDownloadJson}
                className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2 shadow-md shadow-brand-500/20"
              >
                <FileCode className="w-4 h-4" />
                <span>Download JSON</span>
              </Button>
            </div>

            <div className="bg-navy-850 p-4 rounded-xl border border-navy-750 hover:border-cyan-500 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2 text-cyan-400">
                  <FileText className="w-5 h-5" />
                  <span className="font-bold text-white text-sm">Markdown Report</span>
                </div>
                <p className="text-slate-400 mb-4">
                  Executive markdown summary document with scenario table, KPI deltas, data quality warnings, and disclaimer.
                </p>
              </div>
              <Button
                id="btn-download-markdown-report"
                onClick={handleDownloadMarkdown}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2 shadow-md shadow-cyan-600/20"
              >
                <FileText className="w-4 h-4" />
                <span>Download Markdown</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-navy-750 bg-navy-850 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white rounded-lg bg-navy-750 hover:bg-navy-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
