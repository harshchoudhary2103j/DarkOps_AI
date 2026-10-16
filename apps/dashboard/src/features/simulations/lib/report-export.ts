import { SimulationReportExportData } from '../types';
import { SIMULATION_DISCLAIMER } from './comparison-validation';

export function generateSimulationJsonReport(data: SimulationReportExportData): string {
  const reportPayload = {
    schema_version: '1.0.0',
    report_title: 'DarkOps AI Simulation Experiment & Policy Evaluation Report',
    exported_at: data.exported_at,
    disclaimer: SIMULATION_DISCLAIMER,
    experiment: {
      run_id: data.run.id,
      scenario_id: data.run.scenario_id,
      seed: data.run.seed,
      status: data.run.status,
      start_time: data.run.start_time,
      end_time: data.run.end_time,
      current_virtual_time: data.run.current_virtual_time,
      effective_configuration: data.run.config_snapshot || {},
      created_at: data.run.created_at,
      updated_at: data.run.updated_at,
      failure_reason: data.run.failure_reason || null
    },
    paired_candidate: data.paired_candidate_run ? {
      run_id: data.paired_candidate_run.id,
      scenario_id: data.paired_candidate_run.scenario_id,
      seed: data.paired_candidate_run.seed,
      status: data.paired_candidate_run.status,
      start_time: data.paired_candidate_run.start_time,
      end_time: data.paired_candidate_run.end_time,
      effective_configuration: data.paired_candidate_run.config_snapshot || {},
      created_at: data.paired_candidate_run.created_at,
      updated_at: data.paired_candidate_run.updated_at
    } : null,
    evaluation: data.evaluation ? {
      evaluation_id: data.evaluation.evaluation_id,
      evaluator_version: data.evaluation.evaluator_version,
      formula_version: data.evaluation.formula_version,
      simulated_duration_seconds: data.evaluation.simulated_duration_seconds,
      policy_identifiers: data.evaluation.policy_identifiers,
      cost_config: data.evaluation.cost_config,
      kpis: data.evaluation.kpis,
      data_quality_warnings: data.evaluation.data_quality_warnings
    } : null,
    comparison: data.comparison ? {
      scenario_compatible: data.comparison.scenario_compatible,
      duration_compatible: data.comparison.duration_compatible,
      cost_config_compatible: data.comparison.cost_config_compatible,
      policy_variation_detected: data.comparison.policy_variation_detected,
      compatibility_warnings: data.comparison.compatibility_warnings,
      comparisons: data.comparison.comparisons
    } : null,
    event_stream: {
      completeness: data.events_complete ? 'COMPLETE' : 'PAGINATED_PARTIAL',
      exported_event_count: data.events.length,
      total_recorded_events: data.total_events_in_run,
      events: data.events
    }
  };

  return JSON.stringify(reportPayload, null, 2);
}

export function generateSimulationMarkdownReport(data: SimulationReportExportData): string {
  const run = data.run;
  const cand = data.paired_candidate_run;
  const evalSummary = data.evaluation;
  const comp = data.comparison;

  const lines: string[] = [];

  lines.push('# DarkOps AI — Simulation Experiment & Evaluation Report');
  lines.push('');
  lines.push(`> **Disclaimer:** ${SIMULATION_DISCLAIMER}`);
  lines.push('');
  lines.push(`- **Exported At:** ${data.exported_at}`);
  lines.push(`- **Primary Run ID:** \`${run.id}\``);
  if (cand) {
    lines.push(`- **Paired Candidate Run ID:** \`${cand.id}\``);
  }
  lines.push(`- **Scenario Template:** \`${run.scenario_id}\``);
  lines.push(`- **Simulation Seed:** \`${run.seed}\``);
  lines.push(`- **Status:** \`${run.status}\``);
  lines.push(`- **Simulated Horizon:** ${run.start_time} → ${run.end_time}`);
  lines.push('');

  lines.push('## 1. Scenario & Policy Configuration');
  lines.push('');
  lines.push('| Parameter | Primary Run Value | Candidate Value |');
  lines.push('|-----------|-------------------|-----------------|');
  lines.push(`| Scenario ID | \`${run.scenario_id}\` | \`${cand ? cand.scenario_id : 'N/A'}\` |`);
  lines.push(`| Random Seed | \`${run.seed}\` | \`${cand ? cand.seed : 'N/A'}\` |`);
  lines.push(`| Policy Identifier | \`${run.config_snapshot?.policy_identifier || 'baseline_policies_v1'}\` | \`${cand?.config_snapshot?.policy_identifier || 'N/A'}\` |`);
  lines.push(`| Duration | ${run.config_snapshot?.duration_hours || '12'}h | ${cand?.config_snapshot?.duration_hours || 'N/A'}h |`);
  lines.push(`| Demand Base Rate | ${run.config_snapshot?.demand_config?.base_hourly_rate || '12'} orders/h | ${cand?.config_snapshot?.demand_config?.base_hourly_rate || 'N/A'} orders/h |`);
  lines.push(`| Supplier Lead Time | ${run.config_snapshot?.supplier_lead_time_min_hours || 12}h - ${run.config_snapshot?.supplier_lead_time_max_hours || 48}h | ${cand ? `${cand.config_snapshot?.supplier_lead_time_min_hours || 12}h - ${cand.config_snapshot?.supplier_lead_time_max_hours || 48}h` : 'N/A'} |`);
  lines.push('');

  if (comp) {
    lines.push('## 2. Fair Comparison Evaluation & Verification');
    lines.push('');
    lines.push(`- **Scenario Compatible:** ${comp.scenario_compatible ? 'Yes' : 'No'}`);
    lines.push(`- **Horizon Duration Compatible:** ${comp.duration_compatible ? 'Yes' : 'No'}`);
    lines.push(`- **Economic Cost Config Compatible:** ${comp.cost_config_compatible ? 'Yes' : 'No'}`);
    lines.push(`- **Policy Variation Verified:** ${comp.policy_variation_detected ? 'Yes' : 'No'}`);
    lines.push('');

    if (comp.compatibility_warnings && comp.compatibility_warnings.length > 0) {
      lines.push('### Compatibility Warnings');
      lines.push('');
      for (const w of comp.compatibility_warnings) {
        lines.push(`- ⚠️ ${w}`);
      }
      lines.push('');
    }

    lines.push('### Key Performance Indicator Comparison');
    lines.push('');
    lines.push('| Metric | Baseline | Candidate | Delta | % Change | Outcome | Status |');
    lines.push('|--------|----------|-----------|-------|----------|---------|--------|');

    for (const [, metric] of Object.entries(comp.comparisons)) {
      const bVal = metric.baseline_value !== null ? `${metric.baseline_value} ${metric.unit}` : 'N/A';
      const cVal = metric.candidate_value !== null ? `${metric.candidate_value} ${metric.unit}` : 'N/A';
      const delta = metric.absolute_difference !== undefined && metric.absolute_difference !== null
        ? `${metric.absolute_difference > 0 ? '+' : ''}${metric.absolute_difference} ${metric.unit}`
        : 'N/A';
      const pct = metric.percentage_change !== undefined && metric.percentage_change !== null
        ? `${metric.percentage_change > 0 ? '+' : ''}${metric.percentage_change}%`
        : (metric.percentage_change_explanation || 'N/A');
      const outcome = metric.improvement_status || 'UNCHANGED';

      lines.push(`| **${metric.metric_name}** | ${bVal} | ${cVal} | ${delta} | ${pct} | \`${outcome}\` | ${metric.candidate_status} |`);
    }
    lines.push('');
  } else if (evalSummary) {
    lines.push('## 2. Event-Derived Key Performance Indicators');
    lines.push('');
    lines.push('| Metric Name | Value | Unit | Objective | Status | Formula Reference |');
    lines.push('|-------------|-------|------|-----------|--------|-------------------|');
    for (const [, kpi] of Object.entries(evalSummary.kpis)) {
      lines.push(`| **${kpi.metric_name}** | ${kpi.value ?? 'N/A'} | ${kpi.unit} | ${kpi.objective} | ${kpi.status} | ${kpi.formula_ref} |`);
    }
    lines.push('');
  }

  lines.push('## 3. Simulation Event Stream Audit');
  lines.push('');
  lines.push(`- **Completeness:** \`${data.events_complete ? 'COMPLETE (All events exported)' : 'PARTIAL (Paginated subset)'}\``);
  lines.push(`- **Total Events in Run:** ${data.total_events_in_run}`);
  lines.push(`- **Events Included in Report:** ${data.events.length}`);
  lines.push('');

  if (data.events.length > 0) {
    lines.push('| Seq | Virtual Timestamp | Event Type | Status | Payload Summary |');
    lines.push('|-----|-------------------|------------|--------|-----------------|');
    const previewEvents = data.events.slice(0, 30);
    for (const ev of previewEvents) {
      const payloadStr = JSON.stringify(ev.payload || {}).replace(/\|/g, '\\|').slice(0, 60);
      lines.push(`| ${ev.sequence_number} | \`${ev.virtual_timestamp}\` | \`${ev.event_type}\` | ${ev.status} | \`${payloadStr}\` |`);
    }
    if (data.events.length > 30) {
      lines.push(`| ... | *(and ${data.events.length - 30} more events)* | ... | ... | ... |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Generated deterministically by DarkOps AI Simulation Lab on ${data.exported_at}*`);

  return lines.join('\n');
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
