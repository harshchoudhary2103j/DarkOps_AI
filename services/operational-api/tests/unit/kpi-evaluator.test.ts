import { describe, it, expect } from 'vitest';
import { kpiEvaluatorService } from '../../src/services/kpi-evaluator.service';

describe('KPI Evaluator Unit Tests', () => {
  it('computes exact deterministic metrics matching manual fixtures', () => {
    const t0 = new Date('2026-10-16T10:00:00Z');
    const events = [
      {
        id: 'evt_01',
        sequence_number: 1,
        event_type: 'SupplierDeliveryDue',
        virtual_timestamp: t0,
        priority: 1,
        payload: { po_id: 'po_01', quantity: 10 },
        status: 'PROCESSED'
      },
      {
        id: 'evt_02',
        sequence_number: 2,
        event_type: 'StockReceived',
        virtual_timestamp: t0,
        priority: 1,
        payload: { quantity: 10 },
        status: 'PROCESSED'
      },
      {
        id: 'evt_03',
        sequence_number: 3,
        event_type: 'CustomerOrderArrived',
        virtual_timestamp: t0,
        priority: 2,
        payload: {
          order_id: 'ord_01',
          lines: [
            { sku_id: 'sku_A', quantity: 2 },
            { sku_id: 'sku_B', quantity: 3 }
          ]
        },
        status: 'PROCESSED'
      },
      {
        id: 'evt_04',
        sequence_number: 4,
        event_type: 'StockReserved',
        virtual_timestamp: new Date(t0.getTime() + 60000),
        priority: 4,
        payload: { order_id: 'ord_01' },
        status: 'PROCESSED'
      },
      {
        id: 'evt_05',
        sequence_number: 5,
        event_type: 'PickingStarted',
        virtual_timestamp: new Date(t0.getTime() + 120000),
        priority: 5,
        payload: {
          task_id: 'task_01',
          order_id: 'ord_01',
          route: { total_distance_meters: 120.0 }
        },
        status: 'PROCESSED'
      },
      {
        id: 'evt_06',
        sequence_number: 6,
        event_type: 'ItemPicked',
        virtual_timestamp: new Date(t0.getTime() + 180000),
        priority: 6,
        payload: { task_id: 'task_01', picked_quantity: 5 },
        status: 'PROCESSED'
      },
      {
        id: 'evt_07',
        sequence_number: 7,
        event_type: 'PickingCompleted',
        virtual_timestamp: new Date(t0.getTime() + 240000),
        priority: 7,
        payload: { task_id: 'task_01', order_id: 'ord_01' },
        status: 'PROCESSED'
      },
      {
        id: 'evt_08',
        sequence_number: 8,
        event_type: 'CustomerOrderArrived',
        virtual_timestamp: new Date(t0.getTime() + 300000),
        priority: 2,
        payload: {
          order_id: 'ord_02',
          lines: [{ sku_id: 'sku_A', quantity: 4 }]
        },
        status: 'PROCESSED'
      },
      {
        id: 'evt_09',
        sequence_number: 9,
        event_type: 'StockReserved',
        virtual_timestamp: new Date(t0.getTime() + 360000),
        priority: 4,
        payload: { order_id: 'ord_02' },
        status: 'PROCESSED'
      },
      {
        id: 'evt_10',
        sequence_number: 10,
        event_type: 'PickingStarted',
        virtual_timestamp: new Date(t0.getTime() + 420000),
        priority: 5,
        payload: {
          task_id: 'task_02',
          order_id: 'ord_02',
          route: { total_distance_meters: 80.0 }
        },
        status: 'PROCESSED'
      },
      {
        id: 'evt_11',
        sequence_number: 11,
        event_type: 'ItemPicked',
        virtual_timestamp: new Date(t0.getTime() + 540000),
        priority: 6,
        payload: { task_id: 'task_02', picked_quantity: 4 },
        status: 'PROCESSED'
      },
      {
        id: 'evt_12',
        sequence_number: 12,
        event_type: 'PickingCompleted',
        virtual_timestamp: new Date(t0.getTime() + 600000),
        priority: 7,
        payload: { task_id: 'task_02', order_id: 'ord_02' },
        status: 'PROCESSED'
      },
      {
        id: 'evt_13',
        sequence_number: 13,
        event_type: 'CustomerOrderArrived',
        virtual_timestamp: new Date(t0.getTime() + 600000),
        priority: 2,
        payload: {
          order_id: 'ord_03',
          lines: [{ sku_id: 'sku_C', quantity: 3 }]
        },
        status: 'PROCESSED'
      }
    ];

    const summary = kpiEvaluatorService.computeEvaluationFromEvents(
      'run_unit_01',
      'scen_01',
      42,
      events,
      'SUCCEEDED',
      t0,
      new Date(t0.getTime() + 900000)
    );

    const kpis = summary.kpis;

    expect(kpis.order_fill_rate.value).toBe(66.67);
    expect(kpis.order_fill_rate.numerator).toBe(2);
    expect(kpis.order_fill_rate.denominator).toBe(3);

    expect(kpis.unit_fill_rate.value).toBe(75.0);
    expect(kpis.unit_fill_rate.numerator).toBe(9);
    expect(kpis.unit_fill_rate.denominator).toBe(12);

    expect(kpis.line_fill_rate.value).toBe(75.0);
    expect(kpis.line_fill_rate.numerator).toBe(3);
    expect(kpis.line_fill_rate.denominator).toBe(4);

    expect(kpis.stockout_rate.value).toBe(25.0);
    expect(kpis.stockout_rate.numerator).toBe(3);
    expect(kpis.stockout_rate.denominator).toBe(12);

    expect(kpis.stockout_incidents_count.value).toBe(1);

    expect(kpis.picking_duration_seconds.value).toBe(150.0);
    expect(kpis.total_picker_travel_distance_meters.value).toBe(200.0);
    expect(kpis.order_turnaround_time_seconds.value).toBe(270.0);
    expect(kpis.allocation_latency_seconds.value).toBe(60.0);

    expect(kpis.purchase_order_transaction_cost.value).toBe(25.0);
    expect(kpis.estimated_stockout_penalty.value).toBe(15.0);
    expect(kpis.expiry_waste_cost.status).toBe('NOT_APPLICABLE');
    expect(kpis.peak_queue_depth.value).toBe(1);
  });
});
