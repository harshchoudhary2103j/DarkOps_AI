-- ==============================================================================
-- Migration: 001_catalog_schema.sql
-- Description: Initial Catalog Schema (Stores, Service Zones, Products, SKUs,
--              Suppliers, Supplier-SKUs, Warehouse Layouts, and Audit Events)
-- ==============================================================================

-- 1. Stores Table
CREATE TABLE IF NOT EXISTS stores (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE')),
    latitude NUMERIC(9, 6) NOT NULL CHECK (latitude >= -90.0 AND latitude <= 90.0),
    longitude NUMERIC(9, 6) NOT NULL CHECK (longitude >= -180.0 AND longitude <= 180.0),
    service_area JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stores_status ON stores(status);

-- 2. Service Zones Table (belongs to exactly one store)
CREATE TABLE IF NOT EXISTS service_zones (
    id VARCHAR(64) PRIMARY KEY,
    store_id VARCHAR(64) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    boundary JSONB NOT NULL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_zones_store_id ON service_zones(store_id);
CREATE INDEX IF NOT EXISTS idx_service_zones_status ON service_zones(status);

-- 3. Products Table
CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(32) NOT NULL CHECK (status IN ('ACTIVE', 'DISCONTINUED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

-- 4. SKUs Table
CREATE TABLE IF NOT EXISTS skus (
    id VARCHAR(64) PRIMARY KEY,
    product_id VARCHAR(64) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    sku_code VARCHAR(100) NOT NULL UNIQUE,
    pack_size INTEGER NOT NULL CHECK (pack_size > 0),
    shelf_life_days INTEGER NOT NULL CHECK (shelf_life_days > 0),
    storage_temp JSONB NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0.0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(32) NOT NULL CHECK (status IN ('ACTIVE', 'DISCONTINUED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skus_product_id ON skus(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_skus_sku_code ON skus(sku_code);
CREATE INDEX IF NOT EXISTS idx_skus_status ON skus(status);

-- 5. Suppliers Table
CREATE TABLE IF NOT EXISTS suppliers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    default_lead_time_hours INTEGER NOT NULL CHECK (default_lead_time_hours > 0),
    default_moq INTEGER NOT NULL CHECK (default_moq > 0),
    review_schedule JSONB NOT NULL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);

-- 6. Supplier-SKU M:N Relationship Table
CREATE TABLE IF NOT EXISTS supplier_skus (
    supplier_id VARCHAR(64) NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    sku_id VARCHAR(64) NOT NULL REFERENCES skus(id) ON DELETE RESTRICT,
    supplier_sku_code VARCHAR(100),
    lead_time_hours INTEGER NOT NULL CHECK (lead_time_hours > 0),
    moq INTEGER NOT NULL CHECK (moq > 0),
    unit_cost NUMERIC(10, 2) NOT NULL CHECK (unit_cost >= 0.0),
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (supplier_id, sku_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_skus_sku_id ON supplier_skus(sku_id);

-- 7. Warehouse Layouts Table
CREATE TABLE IF NOT EXISTS warehouse_layouts (
    id VARCHAR(64) PRIMARY KEY,
    store_id VARCHAR(64) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    status VARCHAR(32) NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
    nodes JSONB NOT NULL,
    edges JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_layout_store_version UNIQUE (store_id, version)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_layouts_store_id ON warehouse_layouts(store_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_layouts_status ON warehouse_layouts(status);

-- 8. Catalog Audit Events Table
CREATE TABLE IF NOT EXISTS catalog_audit_events (
    id VARCHAR(64) PRIMARY KEY,
    entity_type VARCHAR(64) NOT NULL CHECK (entity_type IN ('STORE', 'SERVICE_ZONE', 'PRODUCT', 'SKU', 'SUPPLIER', 'WAREHOUSE_LAYOUT')),
    entity_id VARCHAR(64) NOT NULL,
    action VARCHAR(32) NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
    actor_id VARCHAR(255) NOT NULL DEFAULT 'system',
    change_summary JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON catalog_audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON catalog_audit_events(created_at);
