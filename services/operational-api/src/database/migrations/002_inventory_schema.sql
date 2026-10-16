-- ============================================================================
-- Migration: 002_inventory_schema.sql
-- Description: Core inventory accounting, immutable movement ledger, reservations,
--              durable idempotency records, and replenishment recommendations.
-- ============================================================================

-- 1. INVENTORY POSITIONS TABLE
CREATE TABLE IF NOT EXISTS inventory_positions (
  id VARCHAR(64) PRIMARY KEY,
  store_id VARCHAR(64) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  sku_id VARCHAR(64) NOT NULL REFERENCES skus(id) ON DELETE RESTRICT,
  physical_on_hand INT NOT NULL DEFAULT 0 CHECK (physical_on_hand >= 0),
  reserved_stock INT NOT NULL DEFAULT 0 CHECK (reserved_stock >= 0),
  incoming_units INT NOT NULL DEFAULT 0 CHECK (incoming_units >= 0),
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_inventory_positions_store_sku UNIQUE (store_id, sku_id),
  CONSTRAINT chk_reserved_le_physical CHECK (reserved_stock <= physical_on_hand)
);

CREATE INDEX IF NOT EXISTS idx_inv_positions_store ON inventory_positions (store_id);
CREATE INDEX IF NOT EXISTS idx_inv_positions_sku ON inventory_positions (sku_id);
CREATE INDEX IF NOT EXISTS idx_inv_positions_low_stock ON inventory_positions (store_id, (physical_on_hand - reserved_stock));

-- 2. INVENTORY RESERVATIONS TABLE
CREATE TABLE IF NOT EXISTS inventory_reservations (
  id VARCHAR(64) PRIMARY KEY,
  store_id VARCHAR(64) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  sku_id VARCHAR(64) NOT NULL REFERENCES skus(id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  remaining_quantity INT NOT NULL CHECK (remaining_quantity >= 0),
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PARTIALLY_RELEASED', 'PARTIALLY_CONSUMED', 'RELEASED', 'CONSUMED')),
  external_reference VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  CONSTRAINT chk_remaining_le_quantity CHECK (remaining_quantity <= quantity)
);

CREATE INDEX IF NOT EXISTS idx_reservations_store_sku ON inventory_reservations (store_id, sku_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_created ON inventory_reservations (created_at DESC);

-- 3. IMMUTABLE INVENTORY MOVEMENTS (LEDGER) TABLE
CREATE TABLE IF NOT EXISTS inventory_movements (
  id VARCHAR(64) PRIMARY KEY,
  store_id VARCHAR(64) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  sku_id VARCHAR(64) NOT NULL REFERENCES skus(id) ON DELETE RESTRICT,
  movement_type VARCHAR(32) NOT NULL CHECK (movement_type IN (
    'OPENING_STOCK',
    'RECEIPT',
    'POSITIVE_ADJUSTMENT',
    'NEGATIVE_ADJUSTMENT',
    'RESERVATION',
    'RESERVATION_RELEASE',
    'PICK_CONSUMPTION'
  )),
  quantity INT NOT NULL CHECK (quantity > 0),
  reservation_id VARCHAR(64) REFERENCES inventory_reservations(id) ON DELETE SET NULL,
  reason VARCHAR(255),
  actor_id VARCHAR(64) NOT NULL,
  correlation_id VARCHAR(64),
  idempotency_key VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movements_store_sku_date ON inventory_movements (store_id, sku_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_movements_reservation ON inventory_movements (reservation_id);
CREATE INDEX IF NOT EXISTS idx_movements_type ON inventory_movements (movement_type);
CREATE INDEX IF NOT EXISTS idx_movements_idempotency ON inventory_movements (idempotency_key);

-- 4. DURABLE IDEMPOTENCY RECORDS TABLE
CREATE TABLE IF NOT EXISTS idempotency_records (
  key VARCHAR(255) NOT NULL,
  scope VARCHAR(64) NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
  response_status INT,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (key, scope)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_records (expires_at);

-- 5. REPLENISHMENT RECOMMENDATIONS TABLE
CREATE TABLE IF NOT EXISTS replenishment_recommendations (
  id VARCHAR(64) PRIMARY KEY,
  store_id VARCHAR(64) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  sku_id VARCHAR(64) NOT NULL REFERENCES skus(id) ON DELETE RESTRICT,
  suggested_quantity INT NOT NULL CHECK (suggested_quantity > 0),
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED')),
  reason TEXT NOT NULL,
  calculation_inputs JSONB NOT NULL,
  decision_actor_id VARCHAR(64),
  decided_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_replenishment_store_sku ON replenishment_recommendations (store_id, sku_id, status);
CREATE INDEX IF NOT EXISTS idx_replenishment_status_date ON replenishment_recommendations (status, created_at DESC);
