export type StoreStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
export type SKUStatus = 'ACTIVE' | 'DISCONTINUED' | 'DRAFT';
export type OrderStatus =
  | 'PENDING'
  | 'ALLOCATED'
  | 'PICKING'
  | 'PICKED'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'CANCELLED';

export type PickingTaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
export type RecommendationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
export type MovementType = 'RECEIPT' | 'ALLOCATION' | 'DEALLOCATION' | 'CONSUMPTION' | 'ADJUSTMENT';

export interface Store {
  id: string;
  name: string;
  code: string;
  status: StoreStatus;
  latitude: number;
  longitude: number;
  address?: string | null;
  contact_phone?: string | null;
  service_radius_km?: number;
  current_queue_depth?: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceZone {
  id: string;
  store_id: string;
  name: string;
  code: string;
  status: 'ACTIVE' | 'INACTIVE';
  polygon_geojson?: {
    type: 'Polygon';
    coordinates: number[][][];
  } | null;
  priority?: number;
  sla_target_minutes?: number;
  created_at: string;
}

export interface SKU {
  id: string;
  product_id: string;
  sku_code: string;
  name: string;
  barcode?: string | null;
  unit_of_measure: string;
  pack_size: number;
  dimensions_cm?: { length: number; width: number; height: number } | null;
  weight_grams?: number | null;
  is_perishable: boolean;
  shelf_life_days?: number | null;
  status: SKUStatus;
  product_name?: string;
  created_at: string;
}

export interface InventoryPosition {
  id?: string;
  store_id: string;
  sku_id: string;
  on_hand?: number;
  reserved?: number;
  available?: number;
  physical_on_hand?: number;
  reserved_stock?: number;
  available_stock?: number;
  min_threshold?: number;
  max_threshold?: number;
  safety_stock?: number;
  reorder_point?: number;
  incoming_po_qty?: number;
  incoming_units?: number;
  unit_of_measure?: string;
  sku_code?: string;
  product_name?: string;
  store_name?: string;
  updated_at?: string;
  created_at?: string;
}

export interface InventoryMovement {
  id: string;
  store_id: string;
  sku_id: string;
  movement_type: MovementType;
  quantity: number;
  reference_id?: string | null;
  created_at: string;
  sku_code?: string;
  product_name?: string;
}

export interface ReplenishmentRecommendation {
  id: string;
  store_id: string;
  sku_id: string;
  recommended_quantity: number;
  suggested_quantity?: number;
  current_inventory: number;
  safety_stock_deficit: number;
  supplier_id?: string | null;
  status: RecommendationStatus;
  decision_by?: string | null;
  decision_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  sku_code?: string;
  product_name?: string;
  supplier_name?: string;
  pack_size?: number;
  min_order_quantity?: number;
  lead_time_days?: number;
  estimated_cost?: number;
}

export interface OrderLine {
  id: string;
  order_id: string;
  sku_id: string;
  quantity?: number;
  requested_quantity?: number;
  reserved_quantity?: number;
  picked_quantity?: number;
  missing_quantity?: number;
  damaged_quantity?: number;
  unit_price?: number;
  price?: number;
  sku_code?: string;
  product_name?: string;
}

export interface OrderEvent {
  id: string;
  order_id: string;
  status: OrderStatus;
  notes?: string | null;
  actor_id?: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  store_id: string;
  status: OrderStatus;
  customer_id?: string | null;
  delivery_address?: string | null;
  sla_deadline?: string | null;
  created_at: string;
  updated_at: string;
  lines?: OrderLine[];
  events?: OrderEvent[];
  line_count?: number;
  store_name?: string;
}

export interface PickItem {
  id: string;
  task_id: string;
  sku_id: string;
  shelf_node_id?: string;
  quantity_requested: number;
  quantity_picked: number;
  status: 'PENDING' | 'PICKED' | 'SHORT' | 'SKIPPED';
  sku_code?: string;
  product_name?: string;
}

export interface PickingTask {
  id: string;
  order_id: string;
  store_id: string;
  status: PickingTaskStatus;
  picker_id?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  items?: PickItem[];
}

export interface WarehouseNode {
  id: string;
  type: 'DISPATCH_STATION' | 'SHELF' | 'INTERSECTION' | 'AISLE_WAYPOINT';
  x: number;
  y: number;
  aisle_id?: string;
  shelf_id?: string;
  zone?: string;
}

export interface WarehouseEdge {
  from_node?: string;
  to_node?: string;
  source?: string;
  target?: string;
  distance?: number;
  distance_meters?: number;
  bidirectional?: boolean;
}

export interface WarehouseLayout {
  id: string;
  store_id: string;
  name?: string;
  version: number;
  status?: string;
  is_active?: boolean;
  nodes?: WarehouseNode[];
  edges?: WarehouseEdge[];
  layout_data?: {
    id?: string;
    store_id?: string;
    nodes: WarehouseNode[];
    edges: WarehouseEdge[];
  };
  created_at: string;
}

export interface RouteBaselineComparison {
  baseline_distance_meters: number;
  baseline_route_nodes: string[];
  distance_reduction_meters: number;
  distance_reduction_percent: number;
  baseline_policy: string;
}

export interface PickerRouteDecisions {
  task_id: string;
  store_id: string;
  route_nodes: string[];
  ordered_stops: string[];
  total_distance_meters: number;
  travel_duration_seconds: number;
  pick_duration_seconds: number;
  total_duration_seconds: number;
  baseline_comparison?: RouteBaselineComparison | null;
}

export interface PickerRouteResponse {
  status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'TIMEOUT' | 'INVALID_INPUT' | 'ERROR';
  objective_value?: number | null;
  execution_time_ms: number;
  constraint_status: Record<string, boolean>;
  decisions: PickerRouteDecisions;
  explanations: string[];
  diagnostics?: Record<string, any>;
  fallback?: {
    attempted: boolean;
    used: boolean;
    policy_id?: string | null;
    reason?: string | null;
  };
}

export interface EvaluationKPI {
  code: string;
  name: string;
  category: string;
  unit: string;
  direction: 'MINIMIZE' | 'MAXIMIZE';
  baseline_value: number;
  candidate_value: number;
  absolute_delta: number;
  percentage_delta: number;
  status: 'AVAILABLE' | 'ZERO' | 'NOT_APPLICABLE' | 'INSUFFICIENT_DATA';
}

export type SimulationRunStatus = 'QUEUED' | 'RUNNING' | 'PAUSED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export type SimulationEventStatus = 'SCHEDULED' | 'PROCESSED' | 'FAILED';

export interface SimulationRun {
  id: string;
  scenario_id: string;
  seed: number;
  status: SimulationRunStatus;
  start_time: string;
  end_time: string;
  current_virtual_time: string;
  event_count: number;
  config_snapshot: Record<string, any>;
  failure_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SimulationEvent {
  id: string;
  run_id: string;
  sequence_number: number;
  event_type: string;
  virtual_timestamp: string;
  priority: number;
  payload: Record<string, any>;
  status: SimulationEventStatus;
  error_message?: string | null;
  causation_id?: string | null;
  created_at: string;
}

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

export interface CreateSimulationRunPayload {
  scenario_id: string;
  seed: number;
  duration_hours: number;
  policy_identifier?: string;
  policy_config?: Record<string, any>;
  demand_config?: {
    base_hourly_rate?: number;
    surge_multiplier?: number;
    min_basket_size?: number;
    max_basket_size?: number;
  };
  supplier_lead_time_min_hours?: number;
  supplier_lead_time_max_hours?: number;
}

export interface EvaluationMetricValue {
  metric_name: string;
  value: number | null;
  unit: string;
  formula_ref: string;
  status: 'AVAILABLE' | 'ZERO' | 'NOT_APPLICABLE' | 'INSUFFICIENT_DATA' | 'INVALID_EVENT_STREAM';
  objective: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'NEUTRAL';
  numerator?: number | null;
  denominator?: number | null;
  sample_count?: number | null;
  warnings?: string[];
}

export interface EvaluationSummary {
  evaluation_id: string;
  run_id: string;
  scenario_id: string;
  seed: number | string;
  status: string;
  simulated_duration_seconds: number;
  evaluator_version: string;
  formula_version: string;
  evaluated_at: string;
  event_count: number;
  policy_identifiers: string[];
  policy_config: Record<string, any>;
  cost_config: Record<string, any>;
  kpis: Record<string, EvaluationMetricValue>;
  data_quality_warnings: string[];
  disclaimer: string;
}

export interface MetricComparisonResult {
  metric_name: string;
  unit: string;
  baseline_value: number | null;
  candidate_value: number | null;
  baseline_status: 'AVAILABLE' | 'ZERO' | 'NOT_APPLICABLE' | 'INSUFFICIENT_DATA' | 'INVALID_EVENT_STREAM';
  candidate_status: 'AVAILABLE' | 'ZERO' | 'NOT_APPLICABLE' | 'INSUFFICIENT_DATA' | 'INVALID_EVENT_STREAM';
  absolute_difference?: number | null;
  percentage_change?: number | null;
  percentage_change_explanation?: string | null;
  objective: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'NEUTRAL';
  is_improvement?: boolean | null;
  improvement_status: 'IMPROVED' | 'DEGRADED' | 'UNCHANGED' | 'INCOMPARABLE' | 'CHANGED';
}

export interface ComparisonReport {
  baseline_run_id: string;
  candidate_run_id: string;
  scenario_compatible: boolean;
  duration_compatible: boolean;
  cost_config_compatible: boolean;
  policy_variation_detected: boolean;
  comparisons: Record<string, MetricComparisonResult>;
  compatibility_warnings: string[];
  disclaimer: string;
}

export interface EvaluationComparisonReport {
  baseline_run_id: string;
  candidate_run_id: string;
  generated_at?: string;
  evaluator_version?: string;
  kpis?: EvaluationKPI[];
  cost_breakdown?: {
    holding_cost_delta: number;
    stockout_penalty_delta: number;
    transaction_cost_delta: number;
    total_cost_delta: number;
  };
  summary?: string;
  // Full backend comparison fields
  scenario_compatible?: boolean;
  duration_compatible?: boolean;
  cost_config_compatible?: boolean;
  policy_variation_detected?: boolean;
  comparisons?: Record<string, MetricComparisonResult>;
  compatibility_warnings?: string[];
  disclaimer?: string;
}
