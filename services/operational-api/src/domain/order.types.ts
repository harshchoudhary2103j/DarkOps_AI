export type OrderStatus =
  | 'CREATED'
  | 'ALLOCATION_PENDING'
  | 'ALLOCATED'
  | 'PICKING'
  | 'PICKED'
  | 'READY'
  | 'CANCELLED'
  | 'FAILED';

export type OrderLineStatus =
  | 'PENDING'
  | 'ALLOCATED'
  | 'PICKING'
  | 'PICKED'
  | 'PARTIALLY_PICKED'
  | 'FAILED'
  | 'CANCELLED';

export type PickingTaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED';

export type PickItemStatus =
  | 'PENDING'
  | 'PICKED'
  | 'MISSING'
  | 'DAMAGED'
  | 'PARTIALLY_PICKED';

export type AllocationWorkflowStatus =
  | 'EVALUATING'
  | 'RESERVING'
  | 'COMPENSATING'
  | 'SUCCEEDED'
  | 'FAILED';

export interface Order {
  id: string;
  customer_id?: string | null;
  customer_latitude: number;
  customer_longitude: number;
  delivery_zone_id?: string | null;
  store_id?: string | null;
  store_name?: string | null;
  status: OrderStatus;
  line_count: number;
  total_requested_units: number;
  failure_code?: string | null;
  failure_reason?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  allocated_at?: string | null;
  cancelled_at?: string | null;
  completed_at?: string | null;
  lines?: OrderLine[];
}

export interface OrderLine {
  id: string;
  order_id: string;
  sku_id: string;
  requested_quantity: number;
  reserved_quantity: number;
  picked_quantity: number;
  missing_quantity: number;
  damaged_quantity: number;
  reservation_id?: string | null;
  status: OrderLineStatus;
  created_at: string;
  updated_at: string;
  sku_code?: string;
  product_name?: string;
  unit_price?: number;
}

export interface PickingTask {
  id: string;
  order_id: string;
  store_id: string;
  status: PickingTaskStatus;
  assigned_picker_id?: string | null;
  version: number;
  started_at?: string | null;
  completed_at?: string | null;
  failure_reason?: string | null;
  created_at: string;
  updated_at: string;
  items?: PickItem[];
}

export interface PickItem {
  id: string;
  picking_task_id: string;
  order_line_id: string;
  sku_id: string;
  shelf_location?: string | null;
  requested_quantity: number;
  confirmed_picked_quantity: number;
  missing_quantity: number;
  damaged_quantity: number;
  status: PickItemStatus;
  created_at: string;
  updated_at: string;
  sku_code?: string;
  product_name?: string;
}

export interface OrderLifecycleEvent {
  id: string;
  order_id: string;
  event_type: string;
  from_status?: string | null;
  to_status?: string | null;
  actor_id: string;
  payload: Record<string, any>;
  created_at: string;
}

export interface AllocationWorkflowRecord {
  id: string;
  order_id: string;
  candidate_store_id?: string | null;
  status: AllocationWorkflowStatus;
  reserved_lines: Array<{
    sku_id: string;
    reservation_id: string;
    quantity: number;
  }>;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}
