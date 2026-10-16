export type InventoryMovementType =
  | 'OPENING_STOCK'
  | 'RECEIPT'
  | 'POSITIVE_ADJUSTMENT'
  | 'NEGATIVE_ADJUSTMENT'
  | 'RESERVATION'
  | 'RESERVATION_RELEASE'
  | 'PICK_CONSUMPTION';

export type ReservationStatus =
  | 'ACTIVE'
  | 'PARTIALLY_RELEASED'
  | 'PARTIALLY_CONSUMED'
  | 'RELEASED'
  | 'CONSUMED';

export type ReplenishmentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTED';

export type IdempotencyStatus =
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export interface InventoryPosition {
  id: string;
  store_id: string;
  sku_id: string;
  physical_on_hand: number;
  reserved_stock: number;
  available_stock: number; // Derived: physical_on_hand - reserved_stock
  incoming_units: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  store_id: string;
  sku_id: string;
  movement_type: InventoryMovementType;
  quantity: number;
  reservation_id?: string | null;
  reason?: string | null;
  actor_id: string;
  correlation_id?: string | null;
  idempotency_key?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
}

export interface InventoryReservation {
  id: string;
  store_id: string;
  sku_id: string;
  quantity: number;
  remaining_quantity: number;
  status: ReservationStatus;
  external_reference?: string | null;
  created_at: string;
  updated_at: string;
  expires_at?: string | null;
}

export interface IdempotencyRecord {
  key: string;
  scope: string;
  actor_id: string;
  request_hash: string;
  status: IdempotencyStatus;
  response_status?: number | null;
  response_body?: any | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface ReplenishmentRecommendation {
  id: string;
  store_id: string;
  sku_id: string;
  suggested_quantity: number;
  status: ReplenishmentStatus;
  reason: string;
  calculation_inputs: {
    physical_on_hand: number;
    reserved_stock: number;
    available_stock: number;
    incoming_units: number;
    reorder_point: number;
    target_stock_level: number;
    supplier_moq?: number;
    lead_time_hours?: number;
  };
  decision_actor_id?: string | null;
  decided_at?: string | null;
  executed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReconciliationReport {
  store_id: string;
  sku_id: string;
  stored_physical: number;
  stored_reserved: number;
  stored_available: number;
  stored_incoming: number;
  ledger_expected_physical: number;
  ledger_expected_reserved: number;
  ledger_expected_available: number;
  is_balanced: boolean;
  physical_discrepancy: number;
  reserved_discrepancy: number;
  movement_count: number;
  reconciled_at: string;
}
