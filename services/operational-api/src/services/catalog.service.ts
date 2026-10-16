import crypto from 'crypto';
import { withTransaction } from '../database/db';
import {
  Store,
  ServiceZone,
  Product,
  SKU,
  Supplier,
  SupplierSKU,
  WarehouseLayout,
  PaginationParams,
  PaginatedResult,
  StoreStatus,
  ServiceZoneStatus,
  ProductStatus,
  SKUStatus,
  SupplierStatus
} from '../domain/types';
import { validateWarehouseLayoutGraph } from '../domain/graph';
import { storeRepository } from '../repositories/store.repository';
import { serviceZoneRepository } from '../repositories/service-zone.repository';
import { productRepository } from '../repositories/product.repository';
import { skuRepository } from '../repositories/sku.repository';
import { supplierRepository } from '../repositories/supplier.repository';
import { warehouseLayoutRepository } from '../repositories/warehouse-layout.repository';
import { auditRepository } from '../repositories/audit.repository';

export class DomainValidationError extends Error {
  public details?: any;
  constructor(message: string, details?: any) {
    super(message);
    this.name = 'DomainValidationError';
    this.details = details;
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class CatalogService {
  // ---------------------------------------------------------------------------
  // Stores
  // ---------------------------------------------------------------------------
  async createStore(
    data: Omit<Store, 'created_at' | 'updated_at'>,
    actorId: string = 'system'
  ): Promise<Store> {
    return withTransaction(async (client) => {
      const now = new Date().toISOString();
      const store: Store = { ...data, created_at: now, updated_at: now };
      const created = await storeRepository.create(store, client);

      await auditRepository.record({
        id: crypto.randomUUID(),
        entity_type: 'STORE',
        entity_id: created.id,
        action: 'CREATE',
        actor_id: actorId,
        change_summary: { created },
        created_at: now
      }, client);

      return created;
    });
  }

  async getStore(id: string): Promise<Store | null> {
    return storeRepository.findById(id);
  }

  async listStores(params: PaginationParams, status?: StoreStatus): Promise<PaginatedResult<Store>> {
    return storeRepository.findAll(params, status);
  }

  async updateStore(
    id: string,
    updates: Partial<Store>,
    actorId: string = 'system'
  ): Promise<Store> {
    return withTransaction(async (client) => {
      const existing = await storeRepository.findById(id, client);
      if (!existing) {
        throw new NotFoundError(`Store with ID '${id}' not found`);
      }

      const updated = await storeRepository.update(id, updates, client);
      if (!updated) {
        throw new NotFoundError(`Store with ID '${id}' not found`);
      }

      const now = new Date().toISOString();
      await auditRepository.record({
        id: crypto.randomUUID(),
        entity_type: 'STORE',
        entity_id: id,
        action: 'UPDATE',
        actor_id: actorId,
        change_summary: { before: existing, after: updated },
        created_at: now
      }, client);

      return updated;
    });
  }

  async deleteStore(id: string, actorId: string = 'system'): Promise<boolean> {
    return withTransaction(async (client) => {
      const existing = await storeRepository.findById(id, client);
      if (!existing) {
        throw new NotFoundError(`Store with ID '${id}' not found`);
      }

      const deleted = await storeRepository.delete(id, client);
      if (deleted) {
        const now = new Date().toISOString();
        await auditRepository.record({
          id: crypto.randomUUID(),
          entity_type: 'STORE',
          entity_id: id,
          action: 'DELETE',
          actor_id: actorId,
          change_summary: { deleted: existing },
          created_at: now
        }, client);
      }
      return deleted;
    });
  }

  // ---------------------------------------------------------------------------
  // Service Zones
  // ---------------------------------------------------------------------------
  async createServiceZone(
    data: Omit<ServiceZone, 'created_at' | 'updated_at'>,
    actorId: string = 'system'
  ): Promise<ServiceZone> {
    return withTransaction(async (client) => {
      const store = await storeRepository.findById(data.store_id, client);
      if (!store) {
        throw new DomainValidationError(`Referenced store '${data.store_id}' does not exist`);
      }

      const now = new Date().toISOString();
      const zone: ServiceZone = { ...data, created_at: now, updated_at: now };
      const created = await serviceZoneRepository.create(zone, client);

      await auditRepository.record({
        id: crypto.randomUUID(),
        entity_type: 'SERVICE_ZONE',
        entity_id: created.id,
        action: 'CREATE',
        actor_id: actorId,
        change_summary: { created },
        created_at: now
      }, client);

      return created;
    });
  }

  async getServiceZone(id: string): Promise<ServiceZone | null> {
    return serviceZoneRepository.findById(id);
  }

  async listServiceZones(
    params: PaginationParams,
    storeId?: string,
    status?: ServiceZoneStatus
  ): Promise<PaginatedResult<ServiceZone>> {
    return serviceZoneRepository.findAll(params, storeId, status);
  }

  async updateServiceZone(
    id: string,
    updates: Partial<ServiceZone>,
    actorId: string = 'system'
  ): Promise<ServiceZone> {
    return withTransaction(async (client) => {
      const existing = await serviceZoneRepository.findById(id, client);
      if (!existing) {
        throw new NotFoundError(`Service zone with ID '${id}' not found`);
      }

      if (updates.store_id && updates.store_id !== existing.store_id) {
        const store = await storeRepository.findById(updates.store_id, client);
        if (!store) {
          throw new DomainValidationError(`Referenced store '${updates.store_id}' does not exist`);
        }
      }

      const updated = await serviceZoneRepository.update(id, updates, client);
      if (!updated) {
        throw new NotFoundError(`Service zone with ID '${id}' not found`);
      }

      const now = new Date().toISOString();
      await auditRepository.record({
        id: crypto.randomUUID(),
        entity_type: 'SERVICE_ZONE',
        entity_id: id,
        action: 'UPDATE',
        actor_id: actorId,
        change_summary: { before: existing, after: updated },
        created_at: now
      }, client);

      return updated;
    });
  }

  async deleteServiceZone(id: string, actorId: string = 'system'): Promise<boolean> {
    return withTransaction(async (client) => {
      const existing = await serviceZoneRepository.findById(id, client);
      if (!existing) {
        throw new NotFoundError(`Service zone with ID '${id}' not found`);
      }

      const deleted = await serviceZoneRepository.delete(id, client);
      if (deleted) {
        const now = new Date().toISOString();
        await auditRepository.record({
          id: crypto.randomUUID(),
          entity_type: 'SERVICE_ZONE',
          entity_id: id,
          action: 'DELETE',
          actor_id: actorId,
          change_summary: { deleted: existing },
          created_at: now
        }, client);
      }
      return deleted;
    });
  }

  // ---------------------------------------------------------------------------
  // Products
  // ---------------------------------------------------------------------------
  async createProduct(
    data: Omit<Product, 'created_at' | 'updated_at'>,
    actorId: string = 'system'
  ): Promise<Product> {
    return withTransaction(async (client) => {
      const now = new Date().toISOString();
      const product: Product = { ...data, created_at: now, updated_at: now };
      const created = await productRepository.create(product, client);

      await auditRepository.record({
        id: crypto.randomUUID(),
        entity_type: 'PRODUCT',
        entity_id: created.id,
        action: 'CREATE',
        actor_id: actorId,
        change_summary: { created },
        created_at: now
      }, client);

      return created;
    });
  }

  async getProduct(id: string): Promise<Product | null> {
    return productRepository.findById(id);
  }

  async listProducts(params: PaginationParams, category?: string): Promise<PaginatedResult<Product>> {
    return productRepository.findAll(params, category);
  }

  async updateProduct(
    id: string,
    updates: Partial<Product>,
    actorId: string = 'system'
  ): Promise<Product> {
    return withTransaction(async (client) => {
      const existing = await productRepository.findById(id, client);
      if (!existing) {
        throw new NotFoundError(`Product with ID '${id}' not found`);
      }

      const updated = await productRepository.update(id, updates, client);
      if (!updated) {
        throw new NotFoundError(`Product with ID '${id}' not found`);
      }

      const now = new Date().toISOString();
      await auditRepository.record({
        id: crypto.randomUUID(),
        entity_type: 'PRODUCT',
        entity_id: id,
        action: 'UPDATE',
        actor_id: actorId,
        change_summary: { before: existing, after: updated },
        created_at: now
      }, client);

      return updated;
    });
  }

  async deleteProduct(id: string, actorId: string = 'system'): Promise<boolean> {
    return withTransaction(async (client) => {
      const existing = await productRepository.findById(id, client);
      if (!existing) {
        throw new NotFoundError(`Product with ID '${id}' not found`);
      }

      const deleted = await productRepository.delete(id, client);
      if (deleted) {
        const now = new Date().toISOString();
        await auditRepository.record({
          id: crypto.randomUUID(),
          entity_type: 'PRODUCT',
          entity_id: id,
          action: 'DELETE',
          actor_id: actorId,
          change_summary: { deleted: existing },
          created_at: now
        }, client);
      }
      return deleted;
    });
  }

  // ---------------------------------------------------------------------------
  // SKUs
  // ---------------------------------------------------------------------------
  async createSKU(
    data: Omit<SKU, 'created_at' | 'updated_at'>,
    actorId: string = 'system'
  ): Promise<SKU> {
    return withTransaction(async (client) => {
      const product = await productRepository.findById(data.product_id, client);
      if (!product) {
        throw new DomainValidationError(`Referenced product '${data.product_id}' does not exist`);
      }

      const now = new Date().toISOString();
      const sku: SKU = { ...data, created_at: now, updated_at: now };
      const created = await skuRepository.create(sku, client);

      await auditRepository.record({
        id: crypto.randomUUID(),
        entity_type: 'SKU',
        entity_id: created.id,
        action: 'CREATE',
        actor_id: actorId,
        change_summary: { created },
        created_at: now
      }, client);

      return created;
    });
  }

  async getSKU(id: string): Promise<SKU | null> {
    return skuRepository.findById(id);
  }

  async getSKUByCode(skuCode: string): Promise<SKU | null> {
    return skuRepository.findBySkuCode(skuCode);
  }

  async listSKUs(
    params: PaginationParams,
    productId?: string,
    status?: SKUStatus
  ): Promise<PaginatedResult<SKU>> {
    return skuRepository.findAll(params, productId, status);
  }

  async updateSKU(
    id: string,
    updates: Partial<SKU>,
    actorId: string = 'system'
  ): Promise<SKU> {
    return withTransaction(async (client) => {
      const existing = await skuRepository.findById(id, client);
      if (!existing) {
        throw new NotFoundError(`SKU with ID '${id}' not found`);
      }

      if (updates.product_id && updates.product_id !== existing.product_id) {
        const product = await productRepository.findById(updates.product_id, client);
        if (!product) {
          throw new DomainValidationError(`Referenced product '${updates.product_id}' does not exist`);
        }
      }

      const updated = await skuRepository.update(id, updates, client);
      if (!updated) {
        throw new NotFoundError(`SKU with ID '${id}' not found`);
      }

      const now = new Date().toISOString();
      await auditRepository.record({
        id: crypto.randomUUID(),
        entity_type: 'SKU',
        entity_id: id,
        action: 'UPDATE',
        actor_id: actorId,
        change_summary: { before: existing, after: updated },
        created_at: now
      }, client);

      return updated;
    });
  }

  async deleteSKU(id: string, actorId: string = 'system'): Promise<boolean> {
    return withTransaction(async (client) => {
      const existing = await skuRepository.findById(id, client);
      if (!existing) {
        throw new NotFoundError(`SKU with ID '${id}' not found`);
      }

      const deleted = await skuRepository.delete(id, client);
      if (deleted) {
        const now = new Date().toISOString();
        await auditRepository.record({
          id: crypto.randomUUID(),
          entity_type: 'SKU',
          entity_id: id,
          action: 'DELETE',
          actor_id: actorId,
          change_summary: { deleted: existing },
          created_at: now
        }, client);
      }
      return deleted;
    });
  }

  // ---------------------------------------------------------------------------
  // Suppliers
  // ---------------------------------------------------------------------------
  async createSupplier(
    data: Omit<Supplier, 'created_at' | 'updated_at'>,
    actorId: string = 'system'
  ): Promise<Supplier> {
    return withTransaction(async (client) => {
      const now = new Date().toISOString();
      const supplier: Supplier = { ...data, created_at: now, updated_at: now };
      const created = await supplierRepository.create(supplier, client);

      await auditRepository.record({
        id: crypto.randomUUID(),
        entity_type: 'SUPPLIER',
        entity_id: created.id,
        action: 'CREATE',
        actor_id: actorId,
        change_summary: { created },
        created_at: now
      }, client);

      return created;
    });
  }

  async getSupplier(id: string): Promise<Supplier | null> {
    return supplierRepository.findById(id);
  }

  async listSuppliers(
    params: PaginationParams,
    status?: SupplierStatus
  ): Promise<PaginatedResult<Supplier>> {
    return supplierRepository.findAll(params, status);
  }

  async updateSupplier(
    id: string,
    updates: Partial<Supplier>,
    actorId: string = 'system'
  ): Promise<Supplier> {
    return withTransaction(async (client) => {
      const existing = await supplierRepository.findById(id, client);
      if (!existing) {
        throw new NotFoundError(`Supplier with ID '${id}' not found`);
      }

      const updated = await supplierRepository.update(id, updates, client);
      if (!updated) {
        throw new NotFoundError(`Supplier with ID '${id}' not found`);
      }

      const now = new Date().toISOString();
      await auditRepository.record({
        id: crypto.randomUUID(),
        entity_type: 'SUPPLIER',
        entity_id: id,
        action: 'UPDATE',
        actor_id: actorId,
        change_summary: { before: existing, after: updated },
        created_at: now
      }, client);

      return updated;
    });
  }

  async deleteSupplier(id: string, actorId: string = 'system'): Promise<boolean> {
    return withTransaction(async (client) => {
      const existing = await supplierRepository.findById(id, client);
      if (!existing) {
        throw new NotFoundError(`Supplier with ID '${id}' not found`);
      }

      const deleted = await supplierRepository.delete(id, client);
      if (deleted) {
        const now = new Date().toISOString();
        await auditRepository.record({
          id: crypto.randomUUID(),
          entity_type: 'SUPPLIER',
          entity_id: id,
          action: 'DELETE',
          actor_id: actorId,
          change_summary: { deleted: existing },
          created_at: now
        }, client);
      }
      return deleted;
    });
  }

  // ---------------------------------------------------------------------------
  // Supplier-SKUs
  // ---------------------------------------------------------------------------
  async linkSupplierSKU(
    link: Omit<SupplierSKU, 'created_at' | 'updated_at'>,
    actorId: string = 'system'
  ): Promise<SupplierSKU> {
    return withTransaction(async (client) => {
      const supplier = await supplierRepository.findById(link.supplier_id, client);
      if (!supplier) {
        throw new DomainValidationError(`Supplier '${link.supplier_id}' does not exist`);
      }
      const sku = await skuRepository.findById(link.sku_id, client);
      if (!sku) {
        throw new DomainValidationError(`SKU '${link.sku_id}' does not exist`);
      }

      const now = new Date().toISOString();
      const entity: SupplierSKU = { ...link, created_at: now, updated_at: now };
      const created = await supplierRepository.linkSKU(entity, client);

      await auditRepository.record({
        id: crypto.randomUUID(),
        entity_type: 'SUPPLIER',
        entity_id: link.supplier_id,
        action: 'UPDATE',
        actor_id: actorId,
        change_summary: { action: 'LINK_SKU', link: created },
        created_at: now
      }, client);

      return created;
    });
  }

  async unlinkSupplierSKU(
    supplierId: string,
    skuId: string,
    actorId: string = 'system'
  ): Promise<boolean> {
    return withTransaction(async (client) => {
      const deleted = await supplierRepository.unlinkSKU(supplierId, skuId, client);
      if (deleted) {
        const now = new Date().toISOString();
        await auditRepository.record({
          id: crypto.randomUUID(),
          entity_type: 'SUPPLIER',
          entity_id: supplierId,
          action: 'UPDATE',
          actor_id: actorId,
          change_summary: { action: 'UNLINK_SKU', sku_id: skuId },
          created_at: now
        }, client);
      }
      return deleted;
    });
  }

  async listSupplierSKUs(supplierId: string): Promise<SupplierSKU[]> {
    return supplierRepository.getSKUsForSupplier(supplierId);
  }

  // ---------------------------------------------------------------------------
  // Warehouse Layouts
  // ---------------------------------------------------------------------------
  async createWarehouseLayout(
    data: Omit<WarehouseLayout, 'created_at' | 'updated_at' | 'version'> & { version?: number },
    actorId: string = 'system'
  ): Promise<WarehouseLayout> {
    // 1. Validate warehouse layout graph reachability & structural rules (pure domain validation)
    const validation = validateWarehouseLayoutGraph(data.nodes, data.edges);
    if (!validation.valid) {
      throw new DomainValidationError('Warehouse layout graph validation failed', validation.errors);
    }

    // 2. Verify store exists
    const store = await storeRepository.findById(data.store_id);
    if (!store) {
      throw new DomainValidationError(`Referenced store '${data.store_id}' does not exist`);
    }

    return withTransaction(async (client) => {
      const now = new Date().toISOString();
      const layout: WarehouseLayout = {
        ...data,
        version: data.version ?? 1,
        created_at: now,
        updated_at: now
      };

      const created = await warehouseLayoutRepository.create(layout, client);

      await auditRepository.record({
        id: crypto.randomUUID(),
        entity_type: 'WAREHOUSE_LAYOUT',
        entity_id: created.id,
        action: 'CREATE',
        actor_id: actorId,
        change_summary: { created },
        created_at: now
      }, client);

      return created;
    });
  }

  async getWarehouseLayout(id: string): Promise<WarehouseLayout | null> {
    return warehouseLayoutRepository.findById(id);
  }

  async getActiveWarehouseLayout(storeId: string): Promise<WarehouseLayout | null> {
    return warehouseLayoutRepository.findActiveByStoreId(storeId);
  }

  async listWarehouseLayouts(
    storeId: string,
    params: PaginationParams
  ): Promise<PaginatedResult<WarehouseLayout>> {
    return warehouseLayoutRepository.findByStoreId(storeId, params);
  }

  async activateWarehouseLayout(id: string, actorId: string = 'system'): Promise<WarehouseLayout> {
    return withTransaction(async (client) => {
      const existing = await warehouseLayoutRepository.findById(id, client);
      if (!existing) {
        throw new NotFoundError(`Warehouse layout with ID '${id}' not found`);
      }

      // Re-validate graph connectivity prior to activation
      const validation = validateWarehouseLayoutGraph(existing.nodes, existing.edges);
      if (!validation.valid) {
        throw new DomainValidationError('Cannot activate invalid warehouse layout graph', validation.errors);
      }

      const activated = await warehouseLayoutRepository.activate(id, client);
      if (!activated) {
        throw new NotFoundError(`Warehouse layout with ID '${id}' not found`);
      }

      const now = new Date().toISOString();
      await auditRepository.record({
        id: crypto.randomUUID(),
        entity_type: 'WAREHOUSE_LAYOUT',
        entity_id: id,
        action: 'UPDATE',
        actor_id: actorId,
        change_summary: { action: 'ACTIVATE', before: existing, after: activated },
        created_at: now
      }, client);

      return activated;
    });
  }
}

export const catalogService = new CatalogService();
