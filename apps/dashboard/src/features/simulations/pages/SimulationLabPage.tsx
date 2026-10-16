import React, { useState, useEffect } from 'react';
import {
  FlaskConical,
  Activity,
  Scale,
  History,
  Plus,
  RefreshCw,
} from 'lucide-react';
import {
  useSimulationRuns,
  useSimulationScenarios,
  useCreateSimulationRun,
} from '../hooks/useSimulationRuns';
import { useRunEvaluation } from '../hooks/useSimulationEvaluation';
import { useSimulationEvents } from '../hooks/useSimulationEvents';
import { ScenarioConfigurationForm } from '../components/ScenarioConfigurationForm';
import { SimulationExecutionConsole } from '../components/SimulationExecutionConsole';
import { EventTimeline } from '../components/EventTimeline';
import { PolicyComparisonPanel } from '../components/PolicyComparisonPanel';
import { RunHistoryPanel } from '../components/RunHistoryPanel';
import { ExportReportDialog } from '../components/ExportReportDialog';
import { SimulationRunCard } from '../components/SimulationRunCard';
import { Button } from '../../../components/ui/Button';

type ActiveTab = 'console' | 'configure' | 'compare' | 'history';

export const SimulationLabPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('configure');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

  // Queries
  const { data: scenariosData, isLoading: isLoadingScenarios } = useSimulationScenarios();
  const { data: runsData, isLoading: isLoadingRuns, refetch: refetchRuns } = useSimulationRuns();
  const createRunMutation = useCreateSimulationRun();

  const scenarios = scenariosData || [];
  const runs = runsData?.data || [];

  // Default to selecting first run if available and none selected
  useEffect(() => {
    if (!selectedRunId && runs.length > 0) {
      setSelectedRunId(runs[0].id);
      setActiveTab('console');
    }
  }, [runs, selectedRunId]);

  const activeRun = runs.find((r) => r.id === selectedRunId) || runs[0];

  // Evaluations and Events for active run
  const { data: activeEvaluation } = useRunEvaluation(activeRun?.id, activeRun?.status);
  const { data: activeEventsData } = useSimulationEvents({
    runId: activeRun?.id,
    runStatus: activeRun?.status,
    limit: 100,
  });

  const handleLaunchExperiment = async (payloads: any[]) => {
    try {
      let firstCreatedRunId: string | null = null;
      for (const payload of payloads) {
        const resp = await createRunMutation.mutateAsync(payload);
        if (!firstCreatedRunId) {
          firstCreatedRunId = resp.data.id;
        }
      }

      await refetchRuns();

      if (firstCreatedRunId) {
        setSelectedRunId(firstCreatedRunId);
        setActiveTab('console');
      }
    } catch {
      // Error handled by mutation toast
    }
  };

  return (
    <div className="space-y-6" id="simulation-lab-page">
      {/* Top Page Header */}
      <div className="bg-navy-900 border border-navy-750 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-500 to-cyan-400 flex items-center justify-center font-bold text-white shadow-lg shadow-brand-500/25">
              <FlaskConical className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Simulation Lab & Policy Optimization Lab
            </h1>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">
            Configure synthetic quick-commerce scenarios, execute discrete-event simulations driven by virtual time,
            and evaluate baseline vs OR-Tools optimized policies with fair paired experimental conditions.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            id="btn-nav-new-experiment"
            onClick={() => setActiveTab('configure')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-md ${
              activeTab === 'configure'
                ? 'bg-brand-500 text-white shadow-brand-500/25'
                : 'bg-navy-800 hover:bg-navy-750 text-slate-200 border border-navy-700'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>New Experiment</span>
          </Button>

          <button
            onClick={() => refetchRuns()}
            className="p-2 rounded-lg bg-navy-800 hover:bg-navy-750 text-slate-400 hover:text-white border border-navy-700 transition-colors"
            title="Refresh simulation runs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-navy-750 pb-2">
        <button
          id="tab-configure"
          onClick={() => setActiveTab('configure')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
            activeTab === 'configure'
              ? 'bg-brand-500 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-navy-850'
          }`}
        >
          <FlaskConical className="w-4 h-4" />
          <span>Configuration Studio</span>
        </button>

        <button
          id="tab-console"
          onClick={() => setActiveTab('console')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
            activeTab === 'console'
              ? 'bg-brand-500 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-navy-850'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Execution Console & Timeline</span>
        </button>

        <button
          id="tab-compare"
          onClick={() => setActiveTab('compare')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
            activeTab === 'compare'
              ? 'bg-brand-500 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-navy-850'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>A/B Policy Evaluation</span>
        </button>

        <button
          id="tab-history"
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
            activeTab === 'history'
              ? 'bg-brand-500 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-navy-850'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Run Archive ({runs.length})</span>
        </button>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'configure' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <ScenarioConfigurationForm
              scenarios={scenarios}
              isLoadingScenarios={isLoadingScenarios}
              onSubmit={handleLaunchExperiment}
              isSubmitting={createRunMutation.isPending}
            />
          </div>

          <div className="space-y-4">
            <div className="bg-navy-900 border border-navy-750 rounded-xl p-5 shadow-sm">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
                Recent Simulation Runs
              </h3>
              {isLoadingRuns ? (
                <div className="text-xs text-slate-400 py-6 text-center">Loading runs...</div>
              ) : runs.length === 0 ? (
                <div className="text-xs text-slate-400 py-6 text-center">
                  No simulation runs created yet. Configure a scenario and launch your first experiment.
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {runs.slice(0, 5).map((r) => (
                    <SimulationRunCard
                      key={r.id}
                      run={r}
                      isSelected={r.id === selectedRunId}
                      onSelect={(run) => {
                        setSelectedRunId(run.id);
                        setActiveTab('console');
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'console' && (
        <>
          {activeRun ? (
            <div className="space-y-6">
              <SimulationExecutionConsole
                run={activeRun}
                evaluation={activeEvaluation}
                onOpenExport={() => setIsExportDialogOpen(true)}
              />

              <EventTimeline runId={activeRun.id} runStatus={activeRun.status} />
            </div>
          ) : (
            <div className="bg-navy-900 border border-navy-750 rounded-xl p-12 text-center text-xs text-slate-400 space-y-3">
              <p>No simulation run is currently selected or loaded.</p>
              <Button
                onClick={() => setActiveTab('configure')}
                className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-4 py-2 rounded-lg"
              >
                Configure New Simulation
              </Button>
            </div>
          )}
        </>
      )}

      {activeTab === 'compare' && (
        <PolicyComparisonPanel
          runs={runs}
          initialBaselineId={runs[0]?.id}
          initialCandidateId={runs[1]?.id || runs[0]?.id}
        />
      )}

      {activeTab === 'history' && (
        <RunHistoryPanel
          runs={runs}
          activeRunId={selectedRunId || undefined}
          onSelectRun={(run) => {
            setSelectedRunId(run.id);
            setActiveTab('console');
          }}
          onExportRun={(run) => {
            setSelectedRunId(run.id);
            setIsExportDialogOpen(true);
          }}
        />
      )}

      {/* Export Report Dialog */}
      {activeRun && (
        <ExportReportDialog
          isOpen={isExportDialogOpen}
          onClose={() => setIsExportDialogOpen(false)}
          run={activeRun}
          pairedCandidateRun={runs.find((r) => r.id !== activeRun.id && r.seed === activeRun.seed)}
          evaluation={activeEvaluation}
          events={activeEventsData?.data || []}
        />
      )}
    </div>
  );
};
