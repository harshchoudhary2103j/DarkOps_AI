import React, { useState, useEffect } from 'react';
import {
  Settings2,
  Clock,
  Key,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { ScenarioTemplate, CreateSimulationRunPayload } from '../../../types/domain';
import { ScenarioExperimentConfig } from '../types';
import {
  DEFAULT_EXPERIMENT_CONFIG,
  validateExperimentConfig,
} from '../lib/experiment-validation';
import { Button } from '../../../components/ui/Button';

interface ScenarioConfigurationFormProps {
  scenarios: ScenarioTemplate[];
  isLoadingScenarios?: boolean;
  onSubmit: (payloads: CreateSimulationRunPayload[]) => void;
  isSubmitting?: boolean;
}

export const ScenarioConfigurationForm: React.FC<ScenarioConfigurationFormProps> = ({
  scenarios,
  isLoadingScenarios = false,
  onSubmit,
  isSubmitting = false,
}) => {
  const [config, setConfig] = useState<ScenarioExperimentConfig>(DEFAULT_EXPERIMENT_CONFIG);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const selectedScenario = scenarios.find((s) => s.scenario_id === config.scenario_id) || scenarios[0];

  useEffect(() => {
    if (selectedScenario && !touched.scenario_id) {
      setConfig((prev) => ({
        ...prev,
        scenario_id: selectedScenario.scenario_id,
        duration_hours: prev.duration_hours || selectedScenario.default_duration_hours || 12.0,
        seed: prev.seed !== undefined ? prev.seed : selectedScenario.default_seed || 101,
      }));
    }
  }, [selectedScenario, touched.scenario_id]);

  const handleChange = (field: keyof ScenarioExperimentConfig, value: any) => {
    setConfig((prev) => {
      const next = { ...prev, [field]: value };
      if (touched[field]) {
        const valRes = validateExperimentConfig(next);
        setErrors(valRes.errors);
      }
      return next;
    });
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleBlur = (field: keyof ScenarioExperimentConfig) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const valRes = validateExperimentConfig(config);
    setErrors(valRes.errors);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const valRes = validateExperimentConfig(config);
    setErrors(valRes.errors);

    if (!valRes.isValid) {
      return;
    }

    const payloads: CreateSimulationRunPayload[] = [];

    if (config.policy_mode === 'baseline' || config.policy_mode === 'paired') {
      payloads.push({
        scenario_id: config.scenario_id,
        seed: config.seed,
        duration_hours: config.duration_hours,
        policy_identifier: config.baseline_policy_identifier,
        demand_config: {
          base_hourly_rate: 12.0 * config.demand_rate_multiplier,
          surge_multiplier: config.surge_multiplier,
        },
        supplier_lead_time_min_hours: config.supplier_lead_time_min_hours,
        supplier_lead_time_max_hours: config.supplier_lead_time_max_hours,
      });
    }

    if (config.policy_mode === 'optimized' || config.policy_mode === 'paired') {
      payloads.push({
        scenario_id: config.scenario_id,
        seed: config.seed,
        duration_hours: config.duration_hours,
        policy_identifier: config.candidate_policy_identifier,
        demand_config: {
          base_hourly_rate: 12.0 * config.demand_rate_multiplier,
          surge_multiplier: config.surge_multiplier,
        },
        supplier_lead_time_min_hours: config.supplier_lead_time_min_hours,
        supplier_lead_time_max_hours: config.supplier_lead_time_max_hours,
      });
    }

    onSubmit(payloads);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" id="simulation-config-form">
      {/* Scenario Template Selector */}
      <div className="bg-navy-900/80 border border-navy-750 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 className="w-5 h-5 text-brand-400" />
          <h3 className="text-base font-semibold text-white">Scenario Template Selection</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isLoadingScenarios && (
            <div className="col-span-2 text-sm text-slate-400 py-3">Loading synthetic scenario templates...</div>
          )}
          {scenarios.map((scen) => {
            const isSelected = config.scenario_id === scen.scenario_id;
            return (
              <div
                key={scen.scenario_id}
                onClick={() => handleChange('scenario_id', scen.scenario_id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'border-brand-500 bg-brand-500/10 shadow-md shadow-brand-500/10'
                    : 'border-navy-750 bg-navy-850/60 hover:border-navy-600'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-white text-sm">{scen.scenario_name}</span>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-brand-400" />}
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2 mb-3">{scen.description}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-300 border-t border-navy-750/60 pt-2.5">
                  <span>
                    Stores: <strong className="text-white">{scen.num_stores}</strong>
                  </span>
                  <span>
                    SKUs: <strong className="text-white">{scen.num_skus}</strong>
                  </span>
                  <span>
                    Lead Time:{' '}
                    <strong className="text-white">
                      {scen.supplier_lead_time_min_hours}-{scen.supplier_lead_time_max_hours}h
                    </strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {errors.scenario_id && (
          <p className="text-xs text-rose-400 flex items-center gap-1 mt-2">
            <AlertCircle className="w-3.5 h-3.5" /> {errors.scenario_id}
          </p>
        )}
      </div>

      {/* Core Experiment Parameters */}
      <div className="bg-navy-900/80 border border-navy-750 rounded-xl p-5 shadow-sm space-y-5">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-5 h-5 text-cyan-400" />
          <h3 className="text-base font-semibold text-white">Execution Parameters</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Duration */}
          <div>
            <label htmlFor="input-duration-hours" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Duration (Hours)
            </label>
            <div className="relative">
              <input
                id="input-duration-hours"
                type="number"
                step="0.5"
                min="0.1"
                max="168"
                value={config.duration_hours}
                onChange={(e) => handleChange('duration_hours', parseFloat(e.target.value))}
                onBlur={() => handleBlur('duration_hours')}
                className={`w-full bg-navy-850 border rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 ${
                  errors.duration_hours
                    ? 'border-rose-500 focus:ring-rose-500'
                    : 'border-navy-700 focus:border-brand-500 focus:ring-brand-500'
                }`}
              />
              <span className="absolute right-3 top-2 text-xs text-slate-400">hours</span>
            </div>
            {errors.duration_hours ? (
              <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.duration_hours}
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-1">Recommended baseline: 12.0 hours</p>
            )}
          </div>

          {/* Random Seed */}
          <div>
            <label htmlFor="input-seed" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Random Seed (Integer)
            </label>
            <div className="relative">
              <input
                id="input-seed"
                type="number"
                step="1"
                min="0"
                value={config.seed}
                onChange={(e) => handleChange('seed', parseInt(e.target.value, 10))}
                onBlur={() => handleBlur('seed')}
                className={`w-full bg-navy-850 border rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 ${
                  errors.seed
                    ? 'border-rose-500 focus:ring-rose-500'
                    : 'border-navy-700 focus:border-brand-500 focus:ring-brand-500'
                }`}
              />
              <Key className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
            </div>
            {errors.seed ? (
              <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.seed}
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-1">Demonstration seed: 101</p>
            )}
          </div>

          {/* Policy Mode */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Evaluation Mode
            </label>
            <div className="grid grid-cols-3 gap-1 bg-navy-850 p-1 rounded-lg border border-navy-700">
              <button
                type="button"
                id="policy-mode-baseline"
                onClick={() => handleChange('policy_mode', 'baseline')}
                className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  config.policy_mode === 'baseline'
                    ? 'bg-navy-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Baseline
              </button>
              <button
                type="button"
                id="policy-mode-optimized"
                onClick={() => handleChange('policy_mode', 'optimized')}
                className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  config.policy_mode === 'optimized'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Optimized
              </button>
              <button
                type="button"
                id="policy-mode-paired"
                onClick={() => handleChange('policy_mode', 'paired')}
                className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  config.policy_mode === 'paired'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Paired A/B
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {config.policy_mode === 'paired'
                ? 'Submits paired runs under identical seed'
                : `Executes single ${config.policy_mode} run`}
            </p>
          </div>
        </div>

        {/* Stochastic Demand & Supplier Modifiers */}
        <div className="border-t border-navy-750 pt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Arrival Rate Multiplier
            </label>
            <input
              id="input-arrival-multiplier"
              type="number"
              step="0.1"
              min="0.1"
              max="5.0"
              value={config.demand_rate_multiplier}
              onChange={(e) => handleChange('demand_rate_multiplier', parseFloat(e.target.value))}
              onBlur={() => handleBlur('demand_rate_multiplier')}
              className="w-full bg-navy-850 border border-navy-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500"
            />
            {errors.demand_rate_multiplier && (
              <p className="text-xs text-rose-400 mt-1">{errors.demand_rate_multiplier}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Surge Multiplier
            </label>
            <input
              id="input-surge-multiplier"
              type="number"
              step="0.1"
              min="0.1"
              max="5.0"
              value={config.surge_multiplier}
              onChange={(e) => handleChange('surge_multiplier', parseFloat(e.target.value))}
              onBlur={() => handleBlur('surge_multiplier')}
              className="w-full bg-navy-850 border border-navy-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500"
            />
            {errors.surge_multiplier && (
              <p className="text-xs text-rose-400 mt-1">{errors.surge_multiplier}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Supplier Lead Time Min (h)
            </label>
            <input
              id="input-supplier-lead-min"
              type="number"
              step="1"
              min="1"
              value={config.supplier_lead_time_min_hours}
              onChange={(e) => handleChange('supplier_lead_time_min_hours', parseInt(e.target.value, 10))}
              onBlur={() => handleBlur('supplier_lead_time_min_hours')}
              className="w-full bg-navy-850 border border-navy-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Supplier Lead Time Max (h)
            </label>
            <input
              id="input-supplier-lead-max"
              type="number"
              step="1"
              min="1"
              value={config.supplier_lead_time_max_hours}
              onChange={(e) => handleChange('supplier_lead_time_max_hours', parseInt(e.target.value, 10))}
              onBlur={() => handleBlur('supplier_lead_time_max_hours')}
              className="w-full bg-navy-850 border border-navy-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500"
            />
            {errors.supplier_lead_time_max_hours && (
              <p className="text-xs text-rose-400 mt-1">{errors.supplier_lead_time_max_hours}</p>
            )}
          </div>
        </div>
      </div>

      {/* Effective Experiment Summary Banner */}
      <div className="bg-gradient-to-r from-navy-900 via-navy-850 to-navy-900 border border-navy-700 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand-400" />
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider">
              Authoritative Experiment Submission Summary
            </h4>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-navy-750 text-slate-300 font-mono">
            {config.policy_mode === 'paired' ? '2 JOBS (PAIRED)' : '1 JOB'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-y border-navy-750/70 py-3 mb-4">
          <div>
            <span className="text-slate-400 block">Scenario:</span>
            <strong className="text-white font-mono">{config.scenario_id}</strong>
          </div>
          <div>
            <span className="text-slate-400 block">Duration:</span>
            <strong className="text-white font-mono">{config.duration_hours}h</strong>
          </div>
          <div>
            <span className="text-slate-400 block">Random Seed:</span>
            <strong className="text-cyan-400 font-mono">{config.seed}</strong>
          </div>
          <div>
            <span className="text-slate-400 block">Policy Assignment:</span>
            <strong className="text-brand-300 font-mono">
              {config.policy_mode === 'paired'
                ? 'Baseline + Optimized'
                : config.policy_mode === 'baseline'
                ? config.baseline_policy_identifier
                : config.candidate_policy_identifier}
            </strong>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400 max-w-lg">
            Backend will enqueue discrete-event simulation job(s). Virtual time and events will be
            persisted in PostgreSQL and evaluated against canonical Phase 07 formulas.
          </p>
          <Button
            type="submit"
            id="btn-submit-simulation"
            disabled={isSubmitting || Object.keys(errors).length > 0}
            className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-2.5 rounded-lg flex items-center gap-2 shadow-lg shadow-brand-500/25"
          >
            {isSubmitting ? (
              'Submitting Job...'
            ) : (
              <>
                <span>Launch Simulation</span>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
};
