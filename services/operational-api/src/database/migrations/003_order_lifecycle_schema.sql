-- ============================================================================
-- Migration: 003_order_lifecycle_schema.sql
-- Description: Orders, Order Lines, Picking Tasks, Pick Items, Lifecycle Events,
--              and Durable Allocation Workflows.
-- ============================================================================

-- 1. ORDERS TABLE
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) PRIMARY KEY,
  customer_id VARCHAR(64),
  customer_latitude NUMERIC(9, 6) NOT NULL CHECK (customer_latitude >= -90.0 AND customer_latitude <= 90.0),
  customer_longitude NUMERIC(9, 6) NOT NULL CHECK (customer_longitude >= -180.0 AND customer_longitude <= 180.0),
  delivery_zone_id VARCHAR(64) REFERENCES service_zones(id) ON DELETE SET NULL,
  store_id VARCHAR(64) REFERENCES stores(id) ON DELETE RESTRICT,
  status VARCHAR(32) NOT NULL DEFAULT 'CREATED' CHECK (status IN (
    'CREATED',
    'ALLOCATION_PENDING',
    'ALLOCATED',
    'PICKING',
    'PICKED',
    'READY',
    'CANCELLED',
    'FAILED'
  )),
  line_count INT NOT NULL CHECK (line_count > 0),
  total_requested_units INT NOT NULL CHECK (total_requested_units > 0),
  failure_code VARCHAR(64),
  failure_reason TEXT,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  allocated_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- 2. ORDER LINES TABLE
CREATE TABLE IF NOT EXISTS order_lines (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku_id VARCHAR(64) NOT NULL REFERENCES skus(id) ON DELETE RESTRICT,
  requested_quantity INT NOT NULL CHECK (requested_quantity > 0),
  reserved_quantity INT NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  picked_quantity INT NOT NULL DEFAULT 0 CHECK (picked_quantity >= 0),
  missing_quantity INT NOT NULL DEFAULT 0 CHECK (missing_quantity >= 0),
  damaged_quantity INT NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
  reservation_id VARCHAR(64) REFERENCES inventory_reservations(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',
    'ALLOCATED',
    'PICKING',
    'PICKED',
    'PARTIALLY_PICKED',
    'FAILED',
    'CANCELLED'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_order_lines_order_sku UNIQUE (order_id, sku_id),
  CONSTRAINT chk_order_line_picked_bounds CHECK (picked_quantity + missing_quantity + damaged_quantity <= requested_quantity)
);

CREATE INDEX IF NOT EXISTS idx_order_lines_order_id ON order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_order_lines_sku_id ON order_lines(sku_id);
CREATE INDEX IF NOT EXISTS idx_order_lines_reservation_id ON order_lines(reservation_id);

-- 3. PICKING TASKS TABLE
CREATE TABLE IF NOT EXISTS picking_tasks (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  store_id VARCHAR(64) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',
    'IN_PROGRESS',
    'COMPLETED',
    'FAILED'
  )),
  assigned_picker_id VARCHAR(64),
  version INT NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_picking_tasks_order UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_picking_tasks_store_status ON picking_tasks(store_id, status);
CREATE INDEX IF NOT EXISTS idx_picking_tasks_order_id ON picking_tasks(order_id);

-- 4. PICK ITEMS TABLE
CREATE TABLE IF NOT EXISTS pick_items (
  id VARCHAR(64) PRIMARY KEY,
  picking_task_id VARCHAR(64) NOT NULL REFERENCES picking_tasks(id) ON DELETE CASCADE,
  order_line_id VARCHAR(64) NOT NULL REFERENCES order_lines(id) ON DELETE RESTRICT,
  sku_id VARCHAR(64) NOT NULL REFERENCES skus(id) ON DELETE RESTRICT,
  shelf_location VARCHAR(128),
  requested_quantity INT NOT NULL CHECK (requested_quantity > 0),
  confirmed_picked_quantity INT NOT NULL DEFAULT 0 CHECK (confirmed_picked_quantity >= 0),
  missing_quantity INT NOT NULL DEFAULT 0 CHECK (missing_quantity >= 0),
  damaged_quantity INT NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',
    'PICKED',
    'MISSING',
    'DAMAGED',
    'PARTIALLY_PICKED'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_pick_item_bounds CHECK (confirmed_picked_quantity + missing_quantity + damaged_quantity <= requested_quantity)
);

CREATE INDEX IF NOT EXISTS idx_pick_items_task ON pick_items(picking_task_id);
CREATE INDEX IF NOT EXISTS idx_pick_items_order_line ON pick_items(order_line_id);

-- 5. ORDER LIFECYCLE EVENTS TABLE (DURABLE AUDIT / EVENT LOG)
CREATE TABLE IF NOT EXISTS order_lifecycle_events (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  from_status VARCHAR(32),
  to_status VARCHAR(32),
  actor_id VARCHAR(64) NOT NULL DEFAULT 'system',
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_date ON order_lifecycle_events(order_id, created_at ASC);

-- 6. ALLOCATION WORKFLOWS TABLE (SAGA / COMPENSATION STATE TRACKING)
CREATE TABLE IF NOT EXISTS allocation_workflows (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  candidate_store_id VARCHAR(64) REFERENCES stores(id) ON DELETE RESTRICT,
  status VARCHAR(32) NOT NULL DEFAULT 'EVALUATING' CHECK (status IN (
    'EVALUATING',
    'RESERVING',
    'COMPENSATING',
    'SUCCEEDED',
    'FAILED'
  )),
  reserved_lines JSONB NOT NULL DEFAULT '[]',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_allocation_workflows_order ON allocation_workflows(order_id, status);
