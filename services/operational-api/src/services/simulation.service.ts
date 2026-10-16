import crypto from 'crypto';
import { query, withTransaction } from '../database/db';
import { NotFoundError, DomainValidationError } from './catalog.service';
import {
  CreateSimulationRunRequest,
  SimulationRun,
  SimulationEvent,
  GetSimulationEventsQuery,
  ListSimulationRunsQuery
} from '../domain/simulation.schemas';

export interface ScenarioTemplate {
  scenario_id: string;
  scenario_name: string;
  description: string;
  num_stores: number;
  num_skus: number;
  default_duration_hours: number;
  default_seed: number;
  daily_demand_lambda: number;
  supplier_lead_time_min_hours: number;
  supplier_lead_time_max_hours: number;
  categories: string[];
}

export const SUPPORTED_SCENARIOS: ScenarioTemplate[] = [
  {
    scenario_id: 'manhattan-demo',
    scenario_name: 'Manhattan Urban Network',
    description: 'High-density multi-store urban network with 2 dark stores and 16 fast-moving grocery SKUs.',
    num_stores: 2,
    num_skus: 16,
    default_duration_hours: 12.0,
    default_seed: 101,
    daily_demand_lambda: 10.0,
    supplier_lead_time_min_hours: 12,
    supplier_lead_time_max_hours: 48,
    categories: ['Produce', 'Dairy', 'Beverages', 'Snacks']
  },
  {
    scenario_id: 'fast-01',
    scenario_name: 'Small Fast Test Scenario',
    description: 'Lightweight benchmark scenario with 1 store and 4 SKUs for rapid testing.',
    num_stores: 1,
    num_skus: 4,
    default_duration_hours: 6.0,
    default_seed: 42,
    daily_demand_lambda: 5.0,
    supplier_lead_time_min_hours: 12,
    supplier_lead_time_max_hours: 24,
    categories: ['Produce', 'Dairy']
  }
];

export class SimulationService {
  /**
   * Return supported synthetic scenarios.
   */
  getScenarios(): ScenarioTemplate[] {
    return SUPPORTED_SCENARIOS;
  }

  /**
   * Create and queue a new simulation run.
   */
  async createRun(request: CreateSimulationRunRequest, correlationId?: string): Promise<SimulationRun> {
    const runId = `sim_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const scenario = SUPPORTED_SCENARIOS.find(s => s.scenario_id === request.scenario_id) || {
      scenario_id: request.scenario_id,
      scenario_name: request.scenario_id,
      num_stores: 2,
      num_skus: 16,
      daily_demand_lambda: 10.0,
      supplier_lead_time_min_hours: request.supplier_lead_time_min_hours || 12,
      supplier_lead_time_max_hours: request.supplier_lead_time_max_hours || 48
    };

    // Canonical virtual simulation anchor: standard fixed virtual clock start for reproducible runs
    const startTime = new Date('2026-03-01T08:00:00.000Z');
    const endTime = new Date(startTime.getTime() + request.duration_hours * 3600 * 1000);

    const configSnapshot = {
      scenario_id: request.scenario_id,
      scenario_name: (scenario as any).scenario_name,
      seed: request.seed,
      duration_hours: request.duration_hours,
      policy_identifier: request.policy_identifier,
      policy_config: request.policy_config || {},
      demand_config: {
        base_hourly_rate: request.demand_config?.base_hourly_rate ?? 12.0,
        surge_multiplier: request.demand_config?.surge_multiplier ?? 1.0,
        min_basket_size: request.demand_config?.min_basket_size ?? 1,
        max_basket_size: request.demand_config?.max_basket_size ?? 8
      },
      supplier_lead_time_min_hours: request.supplier_lead_time_min_hours ?? (scenario as any).supplier_lead_time_min_hours ?? 12,
      supplier_lead_time_max_hours: request.supplier_lead_time_max_hours ?? (scenario as any).supplier_lead_time_max_hours ?? 48,
      ...(request.scenario_config_override || {})
    };

    const res = await query(
      `INSERT INTO simulation_runs (
        id, scenario_id, seed, status,
        start_time, end_time, current_virtual_time,
        event_count, config_snapshot, created_at, updated_at
      ) VALUES ($1, $2, $3, 'QUEUED', $4, $5, $4, 0, $6, NOW(), NOW())
      RETURNING *`,
      [
        runId,
        request.scenario_id,
        request.seed,
        startTime.toISOString(),
        endTime.toISOString(),
        JSON.stringify(configSnapshot)
      ]
    );

    return this.mapRunRow(res.rows[0]);
  }

  /**
   * List simulation runs with pagination and filtering.
   */
  async listRuns(filters: ListSimulationRunsQuery): Promise<{ items: SimulationRun[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters.scenario_id) {
      conditions.push(`scenario_id = $${idx++}`);
      params.push(filters.scenario_id);
    }

    if (filters.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(
      `SELECT COUNT(*)::int as total FROM simulation_runs ${whereClause}`,
      params
    );
    const total = countRes.rows[0]?.total || 0;

    const limit = filters.limit || 20;
    const offset = filters.offset || 0;
    params.push(limit);
    params.push(offset);

    const res = await query(
      `SELECT * FROM simulation_runs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    return {
      items: res.rows.map(this.mapRunRow),
      total
    };
  }

  /**
   * Get single run by ID.
   */
  async getRunById(runId: string): Promise<SimulationRun> {
    const res = await query(
      `SELECT * FROM simulation_runs WHERE id = $1`,
      [runId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError(`Simulation run '${runId}' not found`);
    }

    return this.mapRunRow(res.rows[0]);
  }

  /**
   * Pause a RUNNING simulation run.
   */
  async pauseRun(runId: string): Promise<SimulationRun> {
    const run = await this.getRunById(runId);

    if (run.status === 'PAUSED') {
      return run;
    }

    if (run.status !== 'RUNNING') {
      throw new DomainValidationError(
        `Cannot pause simulation run '${runId}' from status '${run.status}'. Only RUNNING runs can be paused.`
      );
    }

    const res = await query(
      `UPDATE simulation_runs
       SET status = 'PAUSED', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [runId]
    );

    return this.mapRunRow(res.rows[0]);
  }

  /**
   * Resume a PAUSED simulation run.
   */
  async resumeRun(runId: string): Promise<SimulationRun> {
    const run = await this.getRunById(runId);

    if (run.status === 'RUNNING') {
      return run;
    }

    if (run.status !== 'PAUSED') {
      throw new DomainValidationError(
        `Cannot resume simulation run '${runId}' from status '${run.status}'. Only PAUSED runs can be resumed.`
      );
    }

    const res = await query(
      `UPDATE simulation_runs
       SET status = 'RUNNING', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [runId]
    );

    return this.mapRunRow(res.rows[0]);
  }

  /**
   * Cancel a simulation run.
   */
  async cancelRun(runId: string, reason = 'Cancelled by operator'): Promise<SimulationRun> {
    const run = await this.getRunById(runId);

    if (run.status === 'CANCELLED') {
      return run;
    }

    if (run.status === 'SUCCEEDED' || run.status === 'FAILED') {
      throw new DomainValidationError(
        `Cannot cancel simulation run '${runId}' because it has already reached terminal status '${run.status}'.`
      );
    }

    const res = await query(
      `UPDATE simulation_runs
       SET status = 'CANCELLED', failure_reason = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [runId, reason]
    );

    return this.mapRunRow(res.rows[0]);
  }

  /**
   * Reset a simulation run cleanly, respecting run isolation.
   * Clears run-scoped events and evaluations, and restores status to QUEUED.
   */
  async resetRun(runId: string): Promise<SimulationRun> {
    const run = await this.getRunById(runId);

    return withTransaction(async (client) => {
      // 1. Delete run-scoped events
      await client.query(`DELETE FROM simulation_events WHERE run_id = $1`, [runId]);

      // 2. Delete run-scoped evaluations
      await client.query(`DELETE FROM simulation_evaluations WHERE run_id = $1`, [runId]);

      // 3. Reset run record
      const res = await client.query(
        `UPDATE simulation_runs
         SET status = 'QUEUED',
             current_virtual_time = start_time,
             event_count = 0,
             failure_reason = NULL,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [runId]
      );

      return this.mapRunRow(res.rows[0]);
    });
  }

  /**
   * Get simulation events with ordering, pagination, filtering, and sequence cursor.
   */
  async getEvents(
    runId: string,
    filters: GetSimulationEventsQuery
  ): Promise<{ items: SimulationEvent[]; total: number; has_more: boolean }> {
    // Verify run exists
    await this.getRunById(runId);

    const conditions: string[] = ['run_id = $1'];
    const params: any[] = [runId];
    let idx = 2;

    if (filters.event_type) {
      conditions.push(`event_type = $${idx++}`);
      params.push(filters.event_type);
    }

    if (filters.after_sequence_number !== undefined) {
      conditions.push(`sequence_number > $${idx++}`);
      params.push(filters.after_sequence_number);
    }

    if (filters.search) {
      conditions.push(`(event_type ILIKE $${idx} OR payload::text ILIKE $${idx} OR error_message ILIKE $${idx})`);
      params.push(`%${filters.search}%`);
      idx++;
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await query(
      `SELECT COUNT(*)::int as total FROM simulation_events WHERE ${whereClause}`,
      params
    );
    const total = countRes.rows[0]?.total || 0;

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    params.push(limit);
    params.push(offset);

    const res = await query(
      `SELECT * FROM simulation_events
       WHERE ${whereClause}
       ORDER BY virtual_timestamp ASC, priority ASC, sequence_number ASC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    const items = res.rows.map(this.mapEventRow);
    const hasMore = offset + items.length < total;

    return {
      items,
      total,
      has_more: hasMore
    };
  }

  private mapRunRow(row: any): SimulationRun {
    return {
      id: row.id,
      scenario_id: row.scenario_id,
      seed: typeof row.seed === 'string' ? parseInt(row.seed, 10) : row.seed,
      status: row.status,
      start_time: new Date(row.start_time).toISOString(),
      end_time: new Date(row.end_time).toISOString(),
      current_virtual_time: new Date(row.current_virtual_time).toISOString(),
      event_count: row.event_count || 0,
      config_snapshot: typeof row.config_snapshot === 'string' ? JSON.parse(row.config_snapshot) : (row.config_snapshot || {}),
      failure_reason: row.failure_reason,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString()
    };
  }

  private mapEventRow(row: any): SimulationEvent {
    return {
      id: row.id,
      run_id: row.run_id,
      sequence_number: row.sequence_number,
      event_type: row.event_type,
      virtual_timestamp: new Date(row.virtual_timestamp).toISOString(),
      priority: row.priority,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload || {}),
      status: row.status,
      error_message: row.error_message,
      causation_id: row.causation_id,
      created_at: new Date(row.created_at).toISOString()
    };
  }
}

export const simulationService = new SimulationService();
