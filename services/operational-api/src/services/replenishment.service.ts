import crypto from 'crypto';
import { ReplenishmentRecommendation } from '../domain/inventory.types';
import {
  InvalidReservationStateError,
  ReplenishmentRecommendationNotFoundError
} from './inventory-errors';
import { replenishmentRepository, ReplenishmentFilters } from '../repositories/replenishment.repository';
import { inventoryPositionRepository } from '../repositories/inventory-position.repository';
import { supplierRepository } from '../repositories/supplier.repository';
import { PaginationParams, PaginatedResult } from '../domain/types';

export class ReplenishmentService {
  /**
   * Deterministic threshold-based replenishment recommendation generation.
   * Scans store inventory positions and identifies SKUs below reorder thresholds.
   */
  async generateRecommendations(
    storeId: string,
    safetyStockFactor: number = 1.5,
    leadTimeBufferHours: number = 24
  ): Promise<ReplenishmentRecommendation[]> {
    const generated: ReplenishmentRecommendation[] = [];

    // Retrieve all positions for store
    const { data: positions } = await inventoryPositionRepository.findAll(
      { page: 1, limit: 100 },
      { store_id: storeId }
    );

    for (const pos of positions) {
      // Check if a PENDING recommendation already exists to prevent duplicate spam
      const existing = await replenishmentRepository.findPendingByStoreAndSku(storeId, pos.sku_id);
      if (existing) {
        continue;
      }

      // Sourcing lead times and MOQ
      let supplierMoq = 50;
      let leadTimeHours = 24;

      // Check if any supplier has a link for this SKU
      // For structural Phase 02, use conservative defaults or SKU pack sizes
      const reorderPoint = Math.ceil(supplierMoq * safetyStockFactor);
      const effectiveStock = pos.available_stock + pos.incoming_units;

      if (effectiveStock <= reorderPoint) {
        const targetStockLevel = reorderPoint * 2;
        const deficit = targetStockLevel - effectiveStock;
        const suggestedQty = Math.max(deficit, supplierMoq);

        const rec: ReplenishmentRecommendation = {
          id: crypto.randomUUID(),
          store_id: storeId,
          sku_id: pos.sku_id,
          suggested_quantity: suggestedQty,
          status: 'PENDING',
          reason: `Available stock (${pos.available_stock}) + incoming (${pos.incoming_units}) <= reorder point (${reorderPoint})`,
          calculation_inputs: {
            physical_on_hand: pos.physical_on_hand,
            reserved_stock: pos.reserved_stock,
            available_stock: pos.available_stock,
            incoming_units: pos.incoming_units,
            reorder_point: reorderPoint,
            target_stock_level: targetStockLevel,
            supplier_moq: supplierMoq,
            lead_time_hours: leadTimeHours
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const saved = await replenishmentRepository.create(rec);
        generated.push(saved);
      }
    }

    return generated;
  }

  async approve(id: string, actorId: string, reason?: string): Promise<ReplenishmentRecommendation> {
    const rec = await replenishmentRepository.findById(id);
    if (!rec) {
      throw new ReplenishmentRecommendationNotFoundError(`Recommendation '${id}' not found`);
    }

    if (rec.status !== 'PENDING') {
      throw new InvalidReservationStateError(`Cannot approve recommendation with current status '${rec.status}'`);
    }

    rec.status = 'APPROVED';
    rec.decision_actor_id = actorId;
    rec.decided_at = new Date().toISOString();
    if (reason) {
      rec.reason = `${rec.reason} | Approved: ${reason}`;
    }

    return replenishmentRepository.update(rec);
  }

  async reject(id: string, actorId: string, reason?: string): Promise<ReplenishmentRecommendation> {
    const rec = await replenishmentRepository.findById(id);
    if (!rec) {
      throw new ReplenishmentRecommendationNotFoundError(`Recommendation '${id}' not found`);
    }

    if (rec.status !== 'PENDING') {
      throw new InvalidReservationStateError(`Cannot reject recommendation with current status '${rec.status}'`);
    }

    rec.status = 'REJECTED';
    rec.decision_actor_id = actorId;
    rec.decided_at = new Date().toISOString();
    if (reason) {
      rec.reason = `${rec.reason} | Rejected: ${reason}`;
    }

    return replenishmentRepository.update(rec);
  }

  async execute(id: string, actorId: string): Promise<ReplenishmentRecommendation> {
    const rec = await replenishmentRepository.findById(id);
    if (!rec) {
      throw new ReplenishmentRecommendationNotFoundError(`Recommendation '${id}' not found`);
    }

    if (rec.status !== 'APPROVED') {
      throw new InvalidReservationStateError(`Cannot execute recommendation with status '${rec.status}'. Must be APPROVED first.`);
    }

    rec.status = 'EXECUTED';
    rec.executed_at = new Date().toISOString();

    return replenishmentRepository.update(rec);
  }

  async list(params: PaginationParams, filters: ReplenishmentFilters): Promise<PaginatedResult<ReplenishmentRecommendation>> {
    return replenishmentRepository.findAll(params, filters);
  }

  async getById(id: string): Promise<ReplenishmentRecommendation | null> {
    return replenishmentRepository.findById(id);
  }
}

export const replenishmentService = new ReplenishmentService();
