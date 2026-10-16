import { SimulationRun, EvaluationSummary, ComparisonReport } from '../../../types/domain';
import { FairComparisonCheck } from '../types';

export const SIMULATION_DISCLAIMER =
  'Simulated results from synthetic quick-commerce environment. Not verified real-world outcomes.';

export function validateFairComparison(
  baselineRun?: SimulationRun | null,
  candidateRun?: SimulationRun | null,
  baselineEval?: EvaluationSummary | null,
  candidateEval?: EvaluationSummary | null,
  backendComparison?: ComparisonReport | null
): FairComparisonCheck {
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!baselineRun || !candidateRun) {
    return {
      isFair: false,
      reasons: ['Both baseline and candidate simulation runs must be provided.'],
      warnings: []
    };
  }

  // 1. Completion status check
  if (baselineRun.status !== 'SUCCEEDED') {
    reasons.push(
      `Baseline run '${baselineRun.id}' has not succeeded (current status: '${baselineRun.status}'). Only completed runs can be fairly compared.`
    );
  }

  if (candidateRun.status !== 'SUCCEEDED') {
    reasons.push(
      `Candidate run '${candidateRun.id}' has not succeeded (current status: '${candidateRun.status}'). Only completed runs can be fairly compared.`
    );
  }

  // 2. Scenario compatibility
  if (baselineRun.scenario_id !== candidateRun.scenario_id) {
    reasons.push(
      `Scenario mismatch: Baseline used '${baselineRun.scenario_id}', while Candidate used '${candidateRun.scenario_id}'. Runs must execute within the identical scenario environment.`
    );
  }

  // 3. Seed compatibility
  if (Number(baselineRun.seed) !== Number(candidateRun.seed)) {
    reasons.push(
      `Seed mismatch: Baseline used seed ${baselineRun.seed}, while Candidate used seed ${candidateRun.seed}. Fair paired comparison requires identical stochastic demand realization seeds.`
    );
  }

  // 4. Duration compatibility (within 5%)
  const bDuration = new Date(baselineRun.end_time).getTime() - new Date(baselineRun.start_time).getTime();
  const cDuration = new Date(candidateRun.end_time).getTime() - new Date(candidateRun.start_time).getTime();
  const maxDur = Math.max(1, bDuration);
  if (Math.abs(bDuration - cDuration) > 0.05 * maxDur) {
    reasons.push(
      `Duration mismatch: Baseline simulated ${(bDuration / 3600000).toFixed(1)}h, but Candidate simulated ${(cDuration / 3600000).toFixed(1)}h.`
    );
  }

  // 5. Exogenous demand & supplier configuration consistency
  const bSnap = baselineRun.config_snapshot || {};
  const cSnap = candidateRun.config_snapshot || {};

  if (bSnap.supplier_lead_time_min_hours !== cSnap.supplier_lead_time_min_hours ||
      bSnap.supplier_lead_time_max_hours !== cSnap.supplier_lead_time_max_hours) {
    warnings.push(
      'Supplier lead-time parameters differ between runs. Verify whether supplier environment was intended as an experimental variable.'
    );
  }

  if (bSnap.demand_config?.base_hourly_rate !== cSnap.demand_config?.base_hourly_rate ||
      bSnap.demand_config?.surge_multiplier !== cSnap.demand_config?.surge_multiplier) {
    warnings.push(
      'Exogenous customer demand configuration differs between runs. Paired comparison may not represent identical order realization.'
    );
  }

  // 6. Backend comparison verification
  if (backendComparison) {
    if (!backendComparison.scenario_compatible) {
      reasons.push('Backend verified that scenario models are incompatible.');
    }
    if (!backendComparison.duration_compatible) {
      reasons.push('Backend verified that simulated horizons are incompatible.');
    }
    if (!backendComparison.cost_config_compatible) {
      reasons.push('Backend verified that economic cost configurations or currency differ.');
    }
    if (backendComparison.compatibility_warnings && backendComparison.compatibility_warnings.length > 0) {
      warnings.push(...backendComparison.compatibility_warnings);
    }
  }

  // 7. Policy variation check
  if (bSnap.policy_identifier && cSnap.policy_identifier && bSnap.policy_identifier === cSnap.policy_identifier) {
    warnings.push(
      `Both runs use the identical policy identifier '${bSnap.policy_identifier}'. Expected baseline vs optimized comparison.`
    );
  }

  // 8. Evaluation presence check
  if (baselineEval && baselineEval.data_quality_warnings?.length) {
    warnings.push(...baselineEval.data_quality_warnings.map(w => `Baseline: ${w}`));
  }
  if (candidateEval && candidateEval.data_quality_warnings?.length) {
    warnings.push(...candidateEval.data_quality_warnings.map(w => `Candidate: ${w}`));
  }

  return {
    isFair: reasons.length === 0,
    reasons,
    warnings: Array.from(new Set(warnings))
  };
}

export function calculateSafeDelta(
  baselineValue: number | null | undefined,
  candidateValue: number | null | undefined,
  objective: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'NEUTRAL' = 'NEUTRAL'
): {
  absoluteDelta: number | null;
  percentageDelta: number | null;
  percentageExplanation: string | null;
  isImprovement: boolean | null;
  status: 'IMPROVED' | 'DEGRADED' | 'UNCHANGED' | 'INCOMPARABLE';
} {
  if (baselineValue === null || baselineValue === undefined ||
      candidateValue === null || candidateValue === undefined) {
    return {
      absoluteDelta: null,
      percentageDelta: null,
      percentageExplanation: 'Value unavailable or invalid in one of the runs.',
      isImprovement: null,
      status: 'INCOMPARABLE'
    };
  }

  const absDiff = Number((candidateValue - baselineValue).toFixed(4));
  let pctDiff: number | null = null;
  let explanation: string | null = null;

  if (baselineValue !== 0) {
    pctDiff = Number((((candidateValue - baselineValue) / Math.abs(baselineValue)) * 100).toFixed(2));
  } else {
    explanation = 'Baseline value is zero; percentage delta undefined.';
  }

  let isImprovement: boolean | null = null;
  let status: 'IMPROVED' | 'DEGRADED' | 'UNCHANGED' | 'INCOMPARABLE' = 'UNCHANGED';

  if (absDiff !== 0) {
    if (objective === 'HIGHER_IS_BETTER') {
      isImprovement = absDiff > 0;
    } else if (objective === 'LOWER_IS_BETTER') {
      isImprovement = absDiff < 0;
    }

    if (isImprovement === true) {
      status = 'IMPROVED';
    } else if (isImprovement === false) {
      status = 'DEGRADED';
    }
  }

  return {
    absoluteDelta: absDiff,
    percentageDelta: pctDiff,
    percentageExplanation: explanation,
    isImprovement,
    status
  };
}
