// ============================================================================
// File: tests/unit/copilot.test.ts
// Description: Unit tests for AI Copilot schemas, tool execution, two-stage
//              approval gate, post-execution verification & audit logging.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  QueryStoreInventorySchema,
  ListStockoutRisksSchema,
  ExplainReplenishmentRecommendationSchema,
  ExplainOrderAllocationSchema,
  EmergencySurgeRestockSchema,
  ApproveReplenishmentSchema
} from '../../src/copilot/copilot.schemas';
import { copilotToolRegistry } from '../../src/copilot/copilot-tool.registry';
import { copilotService } from '../../src/copilot/copilot.service';
import { copilotProposalRepository } from '../../src/repositories/copilot-proposal.repository';
import { copilotAuditRepository } from '../../src/repositories/copilot-audit.repository';
import { replenishmentRepository } from '../../src/repositories/replenishment.repository';
import { replenishmentService } from '../../src/services/replenishment.service';
import { inventoryService } from '../../src/services/inventory.service';
import { inventoryPositionRepository } from '../../src/repositories/inventory-position.repository';
import { storeRepository } from '../../src/repositories/store.repository';

describe('AI Copilot - Schema Validation & Security Invariants', () => {
  it('TC-COP-01: QueryStoreInventorySchema accepts valid inputs', () => {
    const valid = { store_id: 'STORE-01', sku_id: 'SKU-001', low_stock_only: true };
    const parsed = QueryStoreInventorySchema.parse(valid);
    expect(parsed.store_id).toBe('STORE-01');
    expect(parsed.low_stock_only).toBe(true);
  });

  it('TC-COP-02: ListStockoutRisksSchema rejects negative or excessive horizon hours', () => {
    expect(() => ListStockoutRisksSchema.parse({ horizon_hours: -5 })).toThrow();
    expect(() => ListStockoutRisksSchema.parse({ horizon_hours: 100 })).toThrow();
    expect(ListStockoutRisksSchema.parse({ horizon_hours: 24 }).horizon_hours).toBe(24);
  });

  it('TC-COP-03: ExplainReplenishmentRecommendationSchema rejects empty IDs', () => {
    expect(() => ExplainReplenishmentRecommendationSchema.parse({ recommendation_id: '' })).toThrow();
    expect(
      ExplainReplenishmentRecommendationSchema.parse({ recommendation_id: 'rec-valid-uuid-123' })
        .recommendation_id
    ).toBe('rec-valid-uuid-123');
  });

  it('TC-COP-04: EmergencySurgeRestockSchema rejects zero or negative restock quantities', () => {
    expect(() =>
      EmergencySurgeRestockSchema.parse({
        store_id: 'STORE-01',
        sku_id: 'SKU-MILK',
        quantity: 0
      })
    ).toThrow();

    expect(() =>
      EmergencySurgeRestockSchema.parse({
        store_id: 'STORE-01',
        sku_id: 'SKU-MILK',
        quantity: -10
      })
    ).toThrow();

    const valid = EmergencySurgeRestockSchema.parse({
      store_id: 'STORE-01',
      sku_id: 'SKU-MILK',
      quantity: 50
    });
    expect(valid.quantity).toBe(50);
  });

  it('TC-COP-05: Tool Registry exposes both read-only and mutating tools with proper flags', () => {
    const tools = copilotToolRegistry.getAllTools();
    const inventoryTool = tools.find((t) => t.name === 'queryStoreInventory');
    const restockTool = tools.find((t) => t.name === 'emergencySurgeRestock');
    const approveTool = tools.find((t) => t.name === 'approveReplenishmentRecommendation');

    expect(inventoryTool).toBeDefined();
    expect(inventoryTool?.isMutating).toBe(false);

    expect(restockTool).toBeDefined();
    expect(restockTool?.isMutating).toBe(true);

    expect(approveTool).toBeDefined();
    expect(approveTool?.isMutating).toBe(true);
  });
});

describe('AI Copilot - Two-Stage Approval Gate & Human In The Loop', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('TC-COP-08: Autonomous Mutation Prevention (Strict Invariant)', async () => {
    // When emergencySurgeRestock is executed by Copilot, it must NOT mutate inventory immediately.
    // Instead it must return an ActionProposal with status PENDING_APPROVAL.
    vi.spyOn(storeRepository, 'findById').mockResolvedValue({ id: 'STORE-01', name: 'Store #01' } as any);
    vi.spyOn(inventoryPositionRepository, 'findByStoreAndSku').mockResolvedValue({
      physical_on_hand: 10,
      available_stock: 5
    } as any);

    const createProposalSpy = vi.spyOn(copilotProposalRepository, 'create').mockResolvedValue({
      id: 'prop-test-001',
      action_type: 'EMERGENCY_RESTOCK',
      tool_name: 'emergencySurgeRestock',
      parameters: { store_id: 'STORE-01', sku_id: 'SKU-MILK', quantity: 60 },
      projected_impact: { summary: 'Add +60 units' },
      rationale: 'Surge protection',
      status: 'PENDING_APPROVAL',
      proposed_by: 'copilot',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const auditSpy = vi.spyOn(copilotAuditRepository, 'record').mockResolvedValue();
    const receiveStockSpy = vi.spyOn(inventoryService, 'receiveStock');

    const tool = copilotToolRegistry.getTool('emergencySurgeRestock')!;
    const output = await tool.execute(
      { store_id: 'STORE-01', sku_id: 'SKU-MILK', quantity: 60 },
      { actorId: 'copilot', correlationId: 'corr-test-123' }
    );

    expect(output.actionProposal).toBeDefined();
    expect(output.actionProposal.status).toBe('PENDING_APPROVAL');
    expect(output.requires_operator_approval).toBe(true);
    expect(createProposalSpy).toHaveBeenCalled();
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'PROPOSED', tool_name: 'emergencySurgeRestock' })
    );

    // CRITICAL: Ensure actual stock was NOT received yet!
    expect(receiveStockSpy).not.toHaveBeenCalled();
  });

  it('TC-COP-09: Operator Rejection discards proposal without mutations', async () => {
    const mockProposal = {
      id: 'prop-reject-01',
      action_type: 'EMERGENCY_RESTOCK' as const,
      tool_name: 'emergencySurgeRestock',
      parameters: { store_id: 'STORE-01', sku_id: 'SKU-MILK', quantity: 60 },
      projected_impact: { summary: 'Add +60 units' },
      rationale: 'Surge protection',
      status: 'PENDING_APPROVAL' as const,
      proposed_by: 'copilot',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    vi.spyOn(copilotProposalRepository, 'findById').mockResolvedValue(mockProposal);
    vi.spyOn(copilotProposalRepository, 'updateStatus').mockResolvedValue({
      ...mockProposal,
      status: 'REJECTED',
      decided_by: 'operator-alice'
    });
    const auditSpy = vi.spyOn(copilotAuditRepository, 'record').mockResolvedValue();
    const receiveStockSpy = vi.spyOn(inventoryService, 'receiveStock');

    const result = await copilotService.handleProposalDecision(
      'prop-reject-01',
      'REJECT',
      'operator-alice',
      'Inventory budget limit reached'
    );

    expect(result.status).toBe('REJECTED');
    expect(receiveStockSpy).not.toHaveBeenCalled();
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'REJECTED', actor_id: 'operator-alice' })
    );
  });

  it('TC-COP-10 & TC-COP-11: Operator Approval commits mutation & verifies PostgreSQL state', async () => {
    const mockProposal = {
      id: 'prop-approve-01',
      action_type: 'APPROVE_REPLENISHMENT' as const,
      tool_name: 'approveReplenishmentRecommendation',
      parameters: { recommendation_id: 'rec-test-999' },
      projected_impact: { summary: 'Approve PO for 100 units' },
      rationale: 'Safety stock replenishment',
      status: 'PENDING_APPROVAL' as const,
      proposed_by: 'copilot',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    vi.spyOn(copilotProposalRepository, 'findById').mockResolvedValue(mockProposal);
    vi.spyOn(copilotProposalRepository, 'updateStatus').mockResolvedValue({
      ...mockProposal,
      status: 'EXECUTED',
      decided_by: 'operator-bob'
    });
    const approveSpy = vi.spyOn(replenishmentService, 'approve').mockResolvedValue({} as any);

    // Verification mock: Re-querying database returns APPROVED
    vi.spyOn(replenishmentRepository, 'findById').mockResolvedValue({
      id: 'rec-test-999',
      status: 'APPROVED',
      decided_at: new Date().toISOString()
    } as any);

    const auditSpy = vi.spyOn(copilotAuditRepository, 'record').mockResolvedValue();

    const result = await copilotService.handleProposalDecision(
      'prop-approve-01',
      'APPROVE',
      'operator-bob',
      'Reviewed and approved'
    );

    expect(result.status).toBe('EXECUTED');
    expect(approveSpy).toHaveBeenCalledWith('rec-test-999', 'operator-bob', 'Reviewed and approved');
    expect(result.verification.verified_status).toBe('APPROVED');
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'APPROVED', actor_id: 'operator-bob' })
    );
  });

  it('TC-COP-12: Reject processing proposals that are not in PENDING_APPROVAL state', async () => {
    const mockProposal = {
      id: 'prop-done-01',
      action_type: 'EMERGENCY_RESTOCK' as const,
      tool_name: 'emergencySurgeRestock',
      parameters: {},
      projected_impact: {},
      rationale: 'Done',
      status: 'EXECUTED' as const,
      proposed_by: 'copilot',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    vi.spyOn(copilotProposalRepository, 'findById').mockResolvedValue(mockProposal);

    await expect(
      copilotService.handleProposalDecision('prop-done-01', 'APPROVE', 'operator-bob')
    ).rejects.toThrow(/already been processed/);
  });
});
