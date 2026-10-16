import { query, withTransaction } from '../database/db';
import { NotFoundError, DomainValidationError } from './catalog.service';
import {
  CostConfig,
  EvaluationSummary,
  MetricComparison,
  ComparisonReport,
  MetricValue,
  CostConfigSchema
} from '../domain/evaluation.schemas';

export class KpiEvaluatorService {
  private readonly defaultCostConfig: CostConfig = {
    carrying_cost_per_unit_hour: 0.002,
    stockout_penalty_per_unit: 5.0,
    cost_per_purchase_order: 25.0,
    unit_waste_cost: 2.0,
    currency: 'USD'
  };

  /**
   * Retrieves an existing evaluation summary or computes and persists it from simulation events.
   */
  async getOrComputeRunKpis(runId: string, correlationId?: string): Promise<EvaluationSummary> {
    // 1. Verify simulation run exists
    const runRes = await query(
      `SELECT id, scenario_id, seed, status, start_time, end_time, current_virtual_time, event_count, config_snapshot
       FROM simulation_runs WHERE id = $1`,
      [runId]
    );

    if (runRes.rows.length === 0) {
      throw new NotFoundError(`Simulation run '${runId}' not found`);
    }

    const run = runRes.rows[0];

    // Check if run is still in progress
    if (run.status === 'QUEUED' || run.status === 'RUNNING' || run.status === 'PAUSED') {
      throw new DomainValidationError(
        `Simulation run '${runId}' has not reached completion. Current status is '${run.status}'`
      );
    }

    // 2. Check if a persisted evaluation summary exists
    const evalRes = await query(
      `SELECT summary FROM simulation_evaluations
       WHERE run_id = $1 AND evaluator_version = '1.0.0' AND formula_version = '1.0.0'
       LIMIT 1`,
      [runId]
    );

    if (evalRes.rows.length > 0) {
      return evalRes.rows[0].summary as EvaluationSummary;
    }

    // 3. Query all simulation events in canonical order
    const eventsRes = await query(
      `SELECT id, sequence_number, event_type, virtual_timestamp, priority, payload, status
       FROM simulation_events
       WHERE run_id = $1
       ORDER BY virtual_timestamp ASC, priority ASC, sequence_number ASC`,
      [runId]
    );

    const events = eventsRes.rows.map(r => ({
      id: r.id,
      sequence_number: r.sequence_number,
      event_type: r.event_type,
      virtual_timestamp: new Date(r.virtual_timestamp),
      priority: r.priority,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
      status: r.status
    }));

    const startTime = new Date(run.start_time);
    const endTime = new Date(run.end_time);

    // Compute evaluation summary
    const summary = this.computeEvaluationFromEvents(
      run.id,
      run.scenario_id,
      run.seed,
      events,
      run.status,
      startTime,
      endTime,
      run.config_snapshot || {}
    );

    // 4. Persist computed summary
    await this.persistEvaluationSummary(summary);

    return summary;
  }

  /**
   * Pure evaluation calculation from an ordered event stream.
   */
  computeEvaluationFromEvents(
    runId: string,
    scenarioId: string,
    seed: number | string,
    events: Array<{
      id: string;
      sequence_number: number;
      event_type: string;
      virtual_timestamp: Date;
      priority: number;
      payload: any;
      status: string;
    }>,
    runStatus: string,
    startTime: Date,
    endTime: Date,
    configSnapshot: Record<string, any> = {},
    costConfig: CostConfig = this.defaultCostConfig
  ): EvaluationSummary {
    const warnings: string[] = [];
    const simDurationSeconds = Math.max(0, (endTime.getTime() - startTime.getTime()) / 1000.0);

    if (events.length === 0) {
      warnings.push('Event stream is empty; no events to evaluate.');
    }

    // State reconstruction containers
    const orders: Record<string, any> = {};
    const pickingTasks: Record<string, any> = {};
    const uniquePurchaseOrders = new Set<string>();
    let stockoutIncidents = 0;
    let totalPickerDistance = 0.0;

    const queueTimeline: Array<{ time: Date; depth: number }> = [];
    let currentQueueDepth = 0;
    let peakQueueDepth = 0;

    const inventoryChanges: Array<{ time: Date; delta: number }> = [];

    // Replay events
    for (const event of events) {
      const ts = event.virtual_timestamp;
      const p = event.payload || {};
      const etype = event.event_type;

      if (etype === 'CustomerOrderArrived') {
        const orderId = p.order_id || event.id;
        orders[orderId] = {
          order_id: orderId,
          arrived_at: ts,
          lines: p.lines || [],
          status: 'ARRIVED',
          allocated_at: null,
          ready_at: null,
          cancelled_at: null,
          stockout_units: 0,
          is_terminal: false,
          is_fulfilled: false,
          picked_units_count: 0
        };
        currentQueueDepth++;
        if (currentQueueDepth > peakQueueDepth) {
          peakQueueDepth = currentQueueDepth;
        }
        queueTimeline.push({ time: ts, depth: currentQueueDepth });
      } else if (etype === 'StockReserved') {
        const orderId = p.order_id;
        if (orderId && orders[orderId]) {
          orders[orderId].allocated_at = ts;
          orders[orderId].status = 'ALLOCATED';
          if (currentQueueDepth > 0) currentQueueDepth--;
          queueTimeline.push({ time: ts, depth: currentQueueDepth });
        }
      } else if (etype === 'PickingStarted') {
        const taskId = p.task_id;
        const orderId = p.order_id;
        const routeDist = Number(p.route?.total_distance_meters || 0);
        totalPickerDistance += routeDist;

        pickingTasks[taskId] = {
          task_id: taskId,
          order_id: orderId,
          started_at: ts,
          completed_at: null,
          route_distance: routeDist
        };
        if (orderId && orders[orderId]) {
          orders[orderId].status = 'PICKING';
        }
      } else if (etype === 'ItemPicked') {
        const taskId = p.task_id;
        const qty = Number(p.picked_quantity || 1);
        if (taskId && pickingTasks[taskId]) {
          const orderId = pickingTasks[taskId].order_id;
          if (orderId && orders[orderId]) {
            orders[orderId].picked_units_count += qty;
          }
        }
        inventoryChanges.push({ time: ts, delta: -qty });
      } else if (etype === 'ItemMissing') {
        const taskId = p.task_id;
        const missingQty = Number(p.missing_quantity || 1);
        stockoutIncidents++;
        if (taskId && pickingTasks[taskId]) {
          const orderId = pickingTasks[taskId].order_id;
          if (orderId && orders[orderId]) {
            orders[orderId].stockout_units += missingQty;
          }
        }
      } else if (etype === 'PickingCompleted') {
        const taskId = p.task_id;
        const orderId = p.order_id;
        if (taskId && pickingTasks[taskId]) {
          pickingTasks[taskId].completed_at = ts;
        }
        if (orderId && orders[orderId]) {
          orders[orderId].status = 'READY';
          orders[orderId].ready_at = ts;
          orders[orderId].is_terminal = true;
          orders[orderId].is_fulfilled = true;
        }
      } else if (etype === 'OrderCancelled') {
        const orderId = p.order_id;
        if (orderId && orders[orderId]) {
          orders[orderId].status = 'CANCELLED';
          orders[orderId].cancelled_at = ts;
          orders[orderId].is_terminal = true;
          if (currentQueueDepth > 0) currentQueueDepth--;
          queueTimeline.push({ time: ts, depth: currentQueueDepth });
        }
      } else if (etype === 'SupplierDeliveryDue') {
        if (p.po_id) uniquePurchaseOrders.add(p.po_id);
      } else if (etype === 'StockReceived') {
        const qty = Number(p.quantity || 0);
        if (qty > 0) {
          inventoryChanges.push({ time: ts, delta: qty });
        }
      }
    }

    // Handle allocation failed orders
    for (const order of Object.values(orders)) {
      if (!order.is_terminal) {
        if (!order.allocated_at && order.status !== 'READY') {
          order.status = 'FAILED';
          order.is_terminal = true;
          const reqUnits = order.lines.reduce((acc: number, l: any) => acc + Number(l.quantity || 1), 0);
          order.stockout_units = reqUnits;
          stockoutIncidents++;
          if (currentQueueDepth > 0) currentQueueDepth--;
        }
      }
    }

    const eligibleOrders = Object.values(orders).filter((o: any) => o.is_terminal);
    const fulfilledOrders = eligibleOrders.filter((o: any) => o.is_fulfilled);

    const kpis: Record<string, MetricValue> = {};

    // 1. Order Fill Rate
    if (eligibleOrders.length === 0) {
      kpis.order_fill_rate = {
        metric_name: 'order_fill_rate',
        value: 0.0,
        unit: '%',
        formula_ref: 'Fully Fulfilled Orders / Eligible Terminal Orders * 100',
        status: Object.keys(orders).length === 0 ? 'NOT_APPLICABLE' : 'ZERO',
        objective: 'HIGHER_IS_BETTER',
        numerator: 0.0,
        denominator: 0.0,
        sample_count: 0,
        warnings: ['No orders reached terminal fulfillment status in evaluated run.']
      };
    } else {
      const ofr = Number(((fulfilledOrders.length / eligibleOrders.length) * 100).toFixed(2));
      kpis.order_fill_rate = {
        metric_name: 'order_fill_rate',
        value: ofr,
        unit: '%',
        formula_ref: 'Fully Fulfilled Orders / Eligible Terminal Orders * 100',
        status: 'AVAILABLE',
        objective: 'HIGHER_IS_BETTER',
        numerator: fulfilledOrders.length,
        denominator: eligibleOrders.length,
        sample_count: eligibleOrders.length,
        warnings: []
      };
    }

    // 2. Unit Fill Rate & Line Fill Rate
    let totalReqUnits = 0;
    let totalPickedUnits = 0;
    let totalReqLines = 0;
    let totalFulfilledLines = 0;
    let totalStockoutUnits = 0;

    for (const o of eligibleOrders) {
      totalReqLines += o.lines.length;
      totalReqUnits += o.lines.reduce((acc: number, l: any) => acc + Number(l.quantity || 1), 0);
      totalPickedUnits += o.picked_units_count;
      totalStockoutUnits += o.stockout_units;
      if (o.is_fulfilled) {
        totalFulfilledLines += o.lines.length;
      }
    }

    kpis.line_fill_rate = {
      metric_name: 'line_fill_rate',
      value: totalReqLines > 0 ? Number(((totalFulfilledLines / totalReqLines) * 100).toFixed(2)) : 0.0,
      unit: '%',
      formula_ref: 'Fully Fulfilled Order Lines / Eligible Order Lines * 100',
      status: totalReqLines > 0 ? 'AVAILABLE' : 'ZERO',
      objective: 'HIGHER_IS_BETTER',
      numerator: totalFulfilledLines,
      denominator: totalReqLines,
      sample_count: totalReqLines,
      warnings: []
    };

    kpis.unit_fill_rate = {
      metric_name: 'unit_fill_rate',
      value: totalReqUnits > 0 ? Number(((totalPickedUnits / totalReqUnits) * 100).toFixed(2)) : 0.0,
      unit: '%',
      formula_ref: 'Successfully Picked Units / Requested Units * 100',
      status: totalReqUnits > 0 ? 'AVAILABLE' : 'ZERO',
      objective: 'HIGHER_IS_BETTER',
      numerator: totalPickedUnits,
      denominator: totalReqUnits,
      sample_count: totalReqUnits,
      warnings: []
    };

    const stockoutRate = totalReqUnits > 0 ? Number(((totalStockoutUnits / totalReqUnits) * 100).toFixed(2)) : 0.0;
    kpis.stockout_rate = {
      metric_name: 'stockout_rate',
      value: stockoutRate,
      unit: '%',
      formula_ref: 'Unfulfilled Requested Units Attributable to Stockout / Total Requested Units * 100',
      status: stockoutRate > 0 ? 'AVAILABLE' : 'ZERO',
      objective: 'LOWER_IS_BETTER',
      numerator: totalStockoutUnits,
      denominator: totalReqUnits,
      sample_count: totalReqUnits,
      warnings: []
    };

    kpis.stockout_incidents_count = {
      metric_name: 'stockout_incidents_count',
      value: stockoutIncidents,
      unit: 'incidents',
      formula_ref: 'Count of Distinct Stockout / Unfulfillable Order Rejections',
      status: stockoutIncidents > 0 ? 'AVAILABLE' : 'ZERO',
      objective: 'LOWER_IS_BETTER',
      sample_count: stockoutIncidents,
      warnings: []
    };

    // 3. Picking Duration
    const completedTasks = Object.values(pickingTasks).filter((t: any) => t.completed_at !== null);
    const taskDurations = completedTasks.map((t: any) => (t.completed_at.getTime() - t.started_at.getTime()) / 1000.0);

    if (taskDurations.length === 0) {
      kpis.picking_duration_seconds = {
        metric_name: 'picking_duration_seconds',
        value: 0.0,
        unit: 'seconds',
        formula_ref: 'Picking Completion Time - Picking Start Time',
        status: Object.keys(pickingTasks).length > 0 ? 'ZERO' : 'INSUFFICIENT_DATA',
        objective: 'LOWER_IS_BETTER',
        sample_count: 0,
        warnings: ['No picking tasks completed in evaluated run.']
      };
    } else {
      const sum = taskDurations.reduce((a, b) => a + b, 0);
      const mean = Number((sum / taskDurations.length).toFixed(2));
      const sorted = [...taskDurations].sort((a, b) => a - b);
      const median = Number((sorted[Math.floor(sorted.length / 2)]).toFixed(2));

      kpis.picking_duration_seconds = {
        metric_name: 'picking_duration_seconds',
        value: mean,
        unit: 'seconds',
        formula_ref: 'Picking Completion Time - Picking Start Time',
        status: 'AVAILABLE',
        objective: 'LOWER_IS_BETTER',
        mean,
        median,
        sample_count: taskDurations.length,
        warnings: []
      };
    }

    // 4. Total Picker Travel Distance
    kpis.total_picker_travel_distance_meters = {
      metric_name: 'total_picker_travel_distance_meters',
      value: Number(totalPickerDistance.toFixed(2)),
      unit: 'meters',
      formula_ref: 'Sum of Valid Recorded Layout Graph Edge Distances',
      status: totalPickerDistance > 0 ? 'AVAILABLE' : 'ZERO',
      objective: 'LOWER_IS_BETTER',
      sample_count: Object.keys(pickingTasks).length,
      warnings: []
    };

    // 5. Order Turnaround Time
    const turnaroundTimes = fulfilledOrders
      .filter((o: any) => o.ready_at && o.arrived_at)
      .map((o: any) => (o.ready_at.getTime() - o.arrived_at.getTime()) / 1000.0);

    if (turnaroundTimes.length === 0) {
      kpis.order_turnaround_time_seconds = {
        metric_name: 'order_turnaround_time_seconds',
        value: 0.0,
        unit: 'seconds',
        formula_ref: 'Order Ready Time - Order Creation/Arrival Time',
        status: 'INSUFFICIENT_DATA',
        objective: 'LOWER_IS_BETTER',
        sample_count: 0,
        warnings: ['No orders successfully fulfilled to calculate turnaround time.']
      };
    } else {
      const sum = turnaroundTimes.reduce((a, b) => a + b, 0);
      const mean = Number((sum / turnaroundTimes.length).toFixed(2));
      const sorted = [...turnaroundTimes].sort((a, b) => a - b);
      const median = Number((sorted[Math.floor(sorted.length / 2)]).toFixed(2));

      kpis.order_turnaround_time_seconds = {
        metric_name: 'order_turnaround_time_seconds',
        value: mean,
        unit: 'seconds',
        formula_ref: 'Order Ready Time - Order Creation/Arrival Time',
        status: 'AVAILABLE',
        objective: 'LOWER_IS_BETTER',
        mean,
        median,
        sample_count: turnaroundTimes.length,
        warnings: []
      };
    }

    // 6. Allocation Latency
    const allocationLatencies = Object.values(orders)
      .filter((o: any) => o.allocated_at && o.arrived_at)
      .map((o: any) => (o.allocated_at.getTime() - o.arrived_at.getTime()) / 1000.0);

    if (allocationLatencies.length === 0) {
      kpis.allocation_latency_seconds = {
        metric_name: 'allocation_latency_seconds',
        value: 0.0,
        unit: 'seconds',
        formula_ref: 'Order Allocation Time - Order Arrival Time',
        status: Object.keys(orders).length > 0 ? 'ZERO' : 'INSUFFICIENT_DATA',
        objective: 'LOWER_IS_BETTER',
        sample_count: 0,
        warnings: []
      };
    } else {
      const sum = allocationLatencies.reduce((a, b) => a + b, 0);
      const mean = Number((sum / allocationLatencies.length).toFixed(2));
      const sorted = [...allocationLatencies].sort((a, b) => a - b);
      const median = Number((sorted[Math.floor(sorted.length / 2)]).toFixed(2));

      kpis.allocation_latency_seconds = {
        metric_name: 'allocation_latency_seconds',
        value: mean,
        unit: 'seconds',
        formula_ref: 'Order Allocation Time - Order Arrival Time',
        status: 'AVAILABLE',
        objective: 'LOWER_IS_BETTER',
        mean,
        median,
        sample_count: allocationLatencies.length,
        warnings: []
      };
    }

    // 7. Picker Active Time, Idle Time, Utilization
    const intervals: Array<{ start: number; end: number }> = completedTasks.map((t: any) => ({
      start: Math.max(0, (t.started_at.getTime() - startTime.getTime()) / 1000.0),
      end: Math.min(simDurationSeconds, (t.completed_at.getTime() - startTime.getTime()) / 1000.0)
    }));

    intervals.sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [];
    for (const iv of intervals) {
      if (merged.length === 0) {
        merged.push({ ...iv });
      } else {
        const last = merged[merged.length - 1];
        if (iv.start <= last.end) {
          last.end = Math.max(last.end, iv.end);
        } else {
          merged.push({ ...iv });
        }
      }
    }
    const activeTimeSeconds = Number(merged.reduce((acc, iv) => acc + (iv.end - iv.start), 0).toFixed(2));

    kpis.picker_active_time_seconds = {
      metric_name: 'picker_active_time_seconds',
      value: activeTimeSeconds,
      unit: 'seconds',
      formula_ref: 'Sum of Non-Overlapping Intervals Assigned to Active Picking',
      status: activeTimeSeconds > 0 ? 'AVAILABLE' : 'ZERO',
      objective: 'NEUTRAL',
      sample_count: merged.length,
      warnings: []
    };

    kpis.picker_idle_time_seconds = {
      metric_name: 'picker_idle_time_seconds',
      value: null,
      unit: 'seconds',
      formula_ref: 'Observed Fleet Available Time - Active Time',
      status: 'INSUFFICIENT_DATA',
      objective: 'LOWER_IS_BETTER',
      warnings: ['Picker roster / fleet size not recorded in simulation events.']
    };

    kpis.picker_utilization_percent = {
      metric_name: 'picker_utilization_percent',
      value: null,
      unit: '%',
      formula_ref: 'Active Time / Available Fleet Time * 100',
      status: 'INSUFFICIENT_DATA',
      objective: 'HIGHER_IS_BETTER',
      warnings: ['Picker roster / fleet size not recorded in simulation events.']
    };

    // 8. Economic & Cost KPIs
    const unitHours = this.calculateInventoryUnitHours(startTime, endTime, 0, inventoryChanges);
    const holdingCost = Number((unitHours * costConfig.carrying_cost_per_unit_hour).toFixed(2));

    kpis.inventory_holding_cost = {
      metric_name: 'inventory_holding_cost',
      value: holdingCost,
      unit: costConfig.currency,
      formula_ref: 'Sum over SKUs of (Inventory Unit-Hours * Carrying Cost per Unit-Hour)',
      status: holdingCost > 0 ? 'AVAILABLE' : 'ZERO',
      objective: 'LOWER_IS_BETTER',
      numerator: unitHours,
      warnings: []
    };

    const stockoutPenalty = Number((totalStockoutUnits * costConfig.stockout_penalty_per_unit).toFixed(2));
    kpis.estimated_stockout_penalty = {
      metric_name: 'estimated_stockout_penalty',
      value: stockoutPenalty,
      unit: costConfig.currency,
      formula_ref: 'Unfulfilled Stockout Units * Configured Stockout Penalty per Unit',
      status: stockoutPenalty > 0 ? 'AVAILABLE' : 'ZERO',
      objective: 'LOWER_IS_BETTER',
      numerator: totalStockoutUnits,
      warnings: []
    };

    const poCost = Number((uniquePurchaseOrders.size * costConfig.cost_per_purchase_order).toFixed(2));
    kpis.purchase_order_transaction_cost = {
      metric_name: 'purchase_order_transaction_cost',
      value: poCost,
      unit: costConfig.currency,
      formula_ref: 'Count of Unique Eligible Purchase Orders * Cost per PO',
      status: poCost > 0 ? 'AVAILABLE' : 'ZERO',
      objective: 'LOWER_IS_BETTER',
      sample_count: uniquePurchaseOrders.size,
      warnings: []
    };

    kpis.expiry_waste_cost = {
      metric_name: 'expiry_waste_cost',
      value: 0.0,
      unit: costConfig.currency,
      formula_ref: 'Expired Quantity * Configured Unit Waste Cost',
      status: 'NOT_APPLICABLE',
      objective: 'LOWER_IS_BETTER',
      warnings: ['No lot-level expiry or spoilage events present in simulation event stream.']
    };

    // 9. Workload & Queue KPIs
    kpis.peak_queue_depth = {
      metric_name: 'peak_queue_depth',
      value: peakQueueDepth,
      unit: 'orders',
      formula_ref: 'Maximum Observed Orders Waiting in Allocation Queue',
      status: peakQueueDepth > 0 ? 'AVAILABLE' : 'ZERO',
      objective: 'LOWER_IS_BETTER',
      warnings: []
    };

    const backlogOrderHours = this.calculateBacklogOrderHours(startTime, endTime, queueTimeline);
    kpis.backlog_order_hours = {
      metric_name: 'backlog_order_hours',
      value: Number(backlogOrderHours.toFixed(2)),
      unit: 'order-hours',
      formula_ref: 'Area under Allocation Queue Depth Curve over Simulated Time',
      status: backlogOrderHours > 0 ? 'AVAILABLE' : 'ZERO',
      objective: 'LOWER_IS_BETTER',
      warnings: []
    };

    const simHours = Math.max(0.001, simDurationSeconds / 3600.0);
    const meanQueue = Number((backlogOrderHours / simHours).toFixed(2));
    kpis.mean_queue_depth = {
      metric_name: 'mean_queue_depth',
      value: meanQueue,
      unit: 'orders',
      formula_ref: 'Backlog Order-Hours / Total Simulated Hours',
      status: meanQueue > 0 ? 'AVAILABLE' : 'ZERO',
      objective: 'LOWER_IS_BETTER',
      warnings: []
    };

    return {
      evaluation_id: `eval_${runId}_${Date.now()}`,
      run_id: runId,
      scenario_id: scenarioId,
      seed,
      status: runStatus,
      simulated_duration_seconds: Number(simDurationSeconds.toFixed(2)),
      evaluator_version: '1.0.0',
      formula_version: '1.0.0',
      evaluated_at: new Date().toISOString(),
      event_count: events.length,
      policy_identifiers: [configSnapshot.policy_identifier || 'baseline_policies_v1'],
      policy_config: configSnapshot,
      cost_config: costConfig,
      kpis,
      data_quality_warnings: warnings,
      disclaimer: 'Simulated outcomes derived from synthetic scenarios — not verified real-world results.'
    };
  }

  /**
   * Fair comparison between two evaluation summaries.
   */
  async compareRuns(
    baselineRunId: string,
    candidateRunId: string,
    correlationId?: string
  ): Promise<ComparisonReport> {
    const baseline = await this.getOrComputeRunKpis(baselineRunId, correlationId);
    const candidate = await this.getOrComputeRunKpis(candidateRunId, correlationId);

    const warnings: string[] = [];

    // 1. Scenario compatibility
    const scenarioCompatible = baseline.scenario_id === candidate.scenario_id;
    if (!scenarioCompatible) {
      warnings.push(
        `Scenario ID mismatch: baseline='${baseline.scenario_id}' vs candidate='${candidate.scenario_id}'.`
      );
    }

    // 2. Duration compatibility (within 5%)
    const bDur = baseline.simulated_duration_seconds;
    const cDur = candidate.simulated_duration_seconds;
    const durationCompatible = Math.abs(bDur - cDur) <= (0.05 * Math.max(1.0, bDur));
    if (!durationCompatible) {
      warnings.push(`Simulated duration mismatch: baseline=${bDur}s vs candidate=${cDur}s.`);
    }

    // 3. Cost config compatibility
    const costCompatible =
      baseline.cost_config.currency === candidate.cost_config.currency &&
      baseline.cost_config.carrying_cost_per_unit_hour === candidate.cost_config.carrying_cost_per_unit_hour &&
      baseline.cost_config.stockout_penalty_per_unit === candidate.cost_config.stockout_penalty_per_unit;
    if (!costCompatible) {
      warnings.push('Economic cost configuration or currency differs between baseline and candidate.');
    }

    const policyVariation =
      JSON.stringify(baseline.policy_identifiers) !== JSON.stringify(candidate.policy_identifiers) ||
      JSON.stringify(baseline.policy_config) !== JSON.stringify(candidate.policy_config);

    // 4. Metric comparisons
    const comparisons: Record<string, MetricComparison> = {};
    const allMetricNames = new Set([
      ...Object.keys(baseline.kpis),
      ...Object.keys(candidate.kpis)
    ]);

    for (const mName of Array.from(allMetricNames).sort()) {
      const bMetric = baseline.kpis[mName];
      const cMetric = candidate.kpis[mName];

      if (!bMetric || !cMetric) {
        comparisons[mName] = {
          metric_name: mName,
          unit: bMetric?.unit || cMetric?.unit || '',
          baseline_value: bMetric?.value ?? null,
          candidate_value: cMetric?.value ?? null,
          baseline_status: bMetric?.status || 'NOT_APPLICABLE',
          candidate_status: cMetric?.status || 'NOT_APPLICABLE',
          objective: bMetric?.objective || cMetric?.objective || 'NEUTRAL',
          improvement_status: 'INCOMPARABLE'
        };
        continue;
      }

      const bVal = bMetric.value;
      const cVal = cMetric.value;

      if (
        bVal === null ||
        cVal === null ||
        bMetric.status === 'NOT_APPLICABLE' ||
        bMetric.status === 'INSUFFICIENT_DATA' ||
        bMetric.status === 'INVALID_EVENT_STREAM' ||
        cMetric.status === 'NOT_APPLICABLE' ||
        cMetric.status === 'INSUFFICIENT_DATA' ||
        cMetric.status === 'INVALID_EVENT_STREAM'
      ) {
        comparisons[mName] = {
          metric_name: mName,
          unit: bMetric.unit,
          baseline_value: bVal,
          candidate_value: cVal,
          baseline_status: bMetric.status,
          candidate_status: cMetric.status,
          objective: bMetric.objective,
          improvement_status: 'INCOMPARABLE'
        };
        continue;
      }

      const absDiff = Number((cVal - bVal).toFixed(4));
      let pctChange: number | null = null;
      let pctExplanation: string | null = null;

      if (bVal !== 0.0) {
        pctChange = Number((((cVal - bVal) / Math.abs(bVal)) * 100.0).toFixed(2));
      } else {
        pctExplanation = 'Baseline value is zero; percentage change undefined.';
      }

      let isImprovement: boolean | null = null;
      let improvementStatus: 'IMPROVED' | 'DEGRADED' | 'UNCHANGED' | 'INCOMPARABLE' | 'CHANGED' = 'UNCHANGED';

      if (absDiff !== 0.0) {
        if (bMetric.objective === 'HIGHER_IS_BETTER') {
          isImprovement = absDiff > 0;
        } else if (bMetric.objective === 'LOWER_IS_BETTER') {
          isImprovement = absDiff < 0;
        }

        if (isImprovement === true) {
          improvementStatus = 'IMPROVED';
        } else if (isImprovement === false) {
          improvementStatus = 'DEGRADED';
        } else {
          improvementStatus = 'CHANGED';
        }
      }

      comparisons[mName] = {
        metric_name: mName,
        unit: bMetric.unit,
        baseline_value: bVal,
        candidate_value: cVal,
        baseline_status: bMetric.status,
        candidate_status: cMetric.status,
        absolute_difference: absDiff,
        percentage_change: pctChange,
        percentage_change_explanation: pctExplanation,
        objective: bMetric.objective,
        is_improvement: isImprovement,
        improvement_status: improvementStatus
      };
    }

    return {
      baseline_run_id: baselineRunId,
      candidate_run_id: candidateRunId,
      scenario_compatible: scenarioCompatible,
      duration_compatible: durationCompatible,
      cost_config_compatible: costCompatible,
      policy_variation_detected: policyVariation,
      comparisons,
      compatibility_warnings: warnings,
      disclaimer: 'Simulated outcomes derived from synthetic scenarios — not verified real-world results.'
    };
  }

  private calculateInventoryUnitHours(
    simStart: Date,
    simEnd: Date,
    initialStock: number,
    changes: Array<{ time: Date; delta: number }>
  ): number {
    if (simEnd <= simStart) return 0.0;
    let totalUnitHours = 0.0;
    let currentStock = Math.max(0, initialStock);
    let lastTime = simStart.getTime();

    const sorted = [...changes].sort((a, b) => a.time.getTime() - b.time.getTime());

    for (const change of sorted) {
      const t = change.time.getTime();
      if (t > lastTime) {
        const intervalHours = (t - lastTime) / 3600000.0;
        totalUnitHours += currentStock * intervalHours;
        lastTime = t;
      }
      currentStock = Math.max(0, currentStock + change.delta);
    }

    if (simEnd.getTime() > lastTime) {
      const intervalHours = (simEnd.getTime() - lastTime) / 3600000.0;
      totalUnitHours += currentStock * intervalHours;
    }

    return totalUnitHours;
  }

  private calculateBacklogOrderHours(
    simStart: Date,
    simEnd: Date,
    timeline: Array<{ time: Date; depth: number }>
  ): number {
    if (timeline.length === 0 || simEnd <= simStart) return 0.0;
    let totalOrderHours = 0.0;
    let currentDepth = 0;
    let lastTime = simStart.getTime();

    const sorted = [...timeline].sort((a, b) => a.time.getTime() - b.time.getTime());

    for (const pt of sorted) {
      const t = pt.time.getTime();
      if (t > lastTime) {
        const intervalHours = (t - lastTime) / 3600000.0;
        totalOrderHours += currentDepth * intervalHours;
        lastTime = t;
      }
      currentDepth = Math.max(0, pt.depth);
    }

    if (simEnd.getTime() > lastTime) {
      const intervalHours = (simEnd.getTime() - lastTime) / 3600000.0;
      totalOrderHours += currentDepth * intervalHours;
    }

    return totalOrderHours;
  }

  private async persistEvaluationSummary(summary: EvaluationSummary): Promise<void> {
    await query(
      `INSERT INTO simulation_evaluations (
        id, run_id, scenario_id, seed,
        evaluator_version, formula_version, status,
        simulated_duration_seconds, cost_config, policy_config,
        kpis, summary, data_quality_warnings, disclaimer,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
      ON CONFLICT (run_id, evaluator_version, formula_version) DO UPDATE SET
        status = EXCLUDED.status,
        simulated_duration_seconds = EXCLUDED.simulated_duration_seconds,
        cost_config = EXCLUDED.cost_config,
        policy_config = EXCLUDED.policy_config,
        kpis = EXCLUDED.kpis,
        summary = EXCLUDED.summary,
        data_quality_warnings = EXCLUDED.data_quality_warnings,
        updated_at = NOW()`,
      [
        summary.evaluation_id,
        summary.run_id,
        summary.scenario_id,
        summary.seed,
        summary.evaluator_version,
        summary.formula_version,
        summary.status,
        summary.simulated_duration_seconds,
        JSON.stringify(summary.cost_config),
        JSON.stringify(summary.policy_config),
        JSON.stringify(summary.kpis),
        JSON.stringify(summary),
        JSON.stringify(summary.data_quality_warnings),
        summary.disclaimer
      ]
    );
  }
}

export const kpiEvaluatorService = new KpiEvaluatorService();
