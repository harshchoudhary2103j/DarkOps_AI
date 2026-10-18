// ============================================================================
// File: src/copilot/copilot.schemas.ts
// Description: Zod validation schemas for AI Copilot chat and registered tools.
// ============================================================================

import { z } from 'zod';

export const CopilotChatRequestSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty'),
  store_id: z.string().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant', 'tool']),
        content: z.string()
      })
    )
    .optional()
    .default([])
});

export const CopilotProposalDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().optional()
});

// Tool 1: Query Store Inventory (Read-Only)
export const QueryStoreInventorySchema = z.object({
  store_id: z.string().optional().describe('Store identifier (e.g. STORE-MANHATTAN-01)'),
  sku_id: z.string().optional().describe('SKU code or identifier to inspect'),
  low_stock_only: z.boolean().optional().describe('Filter only SKUs below reorder buffer')
});

// Tool 2: List Stockout Risks (Read-Only)
export const ListStockoutRisksSchema = z.object({
  store_id: z.string().optional().describe('Store identifier to check for stockout risks'),
  horizon_hours: z
    .number()
    .int()
    .min(1)
    .max(72)
    .optional()
    .default(12)
    .describe('Forecast horizon in hours (1-72)')
});

// Tool 3: Explain Replenishment Recommendation (Read-Only)
export const ExplainReplenishmentRecommendationSchema = z.object({
  recommendation_id: z
    .string()
    .min(1, 'Recommendation ID is required')
    .describe('UUID of the replenishment recommendation')
});

// Tool 4: Explain Order Allocation (Read-Only)
export const ExplainOrderAllocationSchema = z.object({
  order_id: z
    .string()
    .min(1, 'Order ID is required')
    .describe('Order identifier (e.g. #ord-morning-rush-01 or UUID)')
});

// Tool 5: Query Live Surge Telemetry (Read-Only)
export const QuerySurgeTelemetrySchema = z.object({
  store_id: z.string().optional().describe('Optional store ID to filter surge pressure')
});

// Tool 6: Query Picking Backlog (Read-Only)
export const QueryPickingBacklogSchema = z.object({
  store_id: z.string().optional().describe('Optional store ID to filter picking backlog'),
  status: z
    .enum(['PENDING_PICK', 'PICKING', 'PICKED', 'FAILED'])
    .optional()
    .describe('Filter by task picking status')
});

// Tool 7: Approve Replenishment Recommendation (Mutating - Gated)
export const ApproveReplenishmentSchema = z.object({
  recommendation_id: z
    .string()
    .min(1, 'Recommendation ID is required')
    .describe('UUID of the replenishment recommendation to approve'),
  reason: z.string().optional().describe('Optional operator justification')
});

// Tool 8: Emergency Surge Restock (Mutating - Gated)
export const EmergencySurgeRestockSchema = z.object({
  store_id: z.string().min(1, 'Store ID is required').describe('Target store ID to receive restock'),
  sku_id: z.string().min(1, 'SKU ID is required').describe('SKU identifier to refuel'),
  quantity: z
    .number()
    .int()
    .min(1, 'Quantity must be at least 1')
    .describe('Number of units to restock into physical inventory'),
  reason: z.string().optional().describe('Operational justification for emergency restock')
});

// Tool 9: Reallocate Order (Mutating - Gated)
export const ReallocateOrderSchema = z.object({
  order_id: z.string().min(1, 'Order ID is required').describe('ID of the order to reallocate'),
  target_store_id: z
    .string()
    .min(1, 'Target store ID is required')
    .describe('Destination dark store ID'),
  reason: z.string().optional().describe('Justification for order transfer')
});
