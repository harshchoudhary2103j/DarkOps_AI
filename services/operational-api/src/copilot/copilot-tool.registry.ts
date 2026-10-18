// ============================================================================
// File: src/copilot/copilot-tool.registry.ts
// Description: Typed tool registry, OpenAI schemas, and domain execution handlers.
// ============================================================================

import crypto from 'crypto';
import {
  QueryStoreInventorySchema,
  ListStockoutRisksSchema,
  ExplainReplenishmentRecommendationSchema,
  ExplainOrderAllocationSchema,
  QuerySurgeTelemetrySchema,
  QueryPickingBacklogSchema,
  ApproveReplenishmentSchema,
  EmergencySurgeRestockSchema,
  ReallocateOrderSchema
} from './copilot.schemas';
import {
  CopilotContext,
  CopilotActionProposal,
  CopilotToolExecutionResult
} from './copilot.types';
import { inventoryPositionRepository } from '../repositories/inventory-position.repository';
import { replenishmentRepository } from '../repositories/replenishment.repository';
import { orderRepository } from '../repositories/order.repository';
import { pickingTaskRepository } from '../repositories/picking-task.repository';
import { storeRepository } from '../repositories/store.repository';
import { skuRepository } from '../repositories/sku.repository';
import { copilotProposalRepository } from '../repositories/copilot-proposal.repository';
import { copilotAuditRepository } from '../repositories/copilot-audit.repository';
import { pool } from '../database/db';

export interface RegisteredTool {
  name: string;
  description: string;
  isMutating: boolean;
  zodSchema: any;
  openAiDefinition: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  };
  execute: (args: any, context: CopilotContext) => Promise<any>;
}

export class CopilotToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  constructor() {
    this.registerAll();
  }

  getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  getOpenAiToolDefinitions() {
    return this.getAllTools().map((t) => t.openAiDefinition);
  }

  private register(tool: RegisteredTool) {
    this.tools.set(tool.name, tool);
  }

  private registerAll() {
    // -------------------------------------------------------------------------
    // 1. queryStoreInventory (Read-Only)
    // -------------------------------------------------------------------------
    this.register({
      name: 'queryStoreInventory',
      description:
        'Retrieve authoritative stock positions, physical on-hand, reserved units, and available stock for a store or SKU.',
      isMutating: false,
      zodSchema: QueryStoreInventorySchema,
      openAiDefinition: {
        type: 'function',
        function: {
          name: 'queryStoreInventory',
          description:
            'Retrieve authoritative stock levels, physical on-hand, reserved units, and available stock for a dark store.',
          parameters: {
            type: 'object',
            properties: {
              store_id: {
                type: 'string',
                description: 'Store ID (e.g. STORE-MANHATTAN-01) or leave empty for selected store'
              },
              sku_id: {
                type: 'string',
                description: 'SKU identifier to check'
              },
              low_stock_only: {
                type: 'boolean',
                description: 'Filter only items below safety stock / reorder thresholds'
              }
            }
          }
        }
      },
      execute: async (rawArgs: any, context: CopilotContext) => {
        const args = QueryStoreInventorySchema.parse(rawArgs);
        const storeId = args.store_id || context.storeId;
        const result = await inventoryPositionRepository.findAll(
          { page: 1, limit: 25 },
          {
            store_id: storeId,
            sku_id: args.sku_id,
            low_stock_only: args.low_stock_only
          }
        );

        let storeName = storeId;
        if (storeId) {
          const store = await storeRepository.findById(storeId);
          if (store) storeName = store.name;
        }

        return {
          store_id: storeId,
          store_name: storeName,
          total_positions: result.pagination.total,
          positions: result.data.map((p) => ({
            sku_id: p.sku_id,
            physical_on_hand: p.physical_on_hand,
            reserved_stock: p.reserved_stock,
            available_stock: p.available_stock,
            incoming_units: p.incoming_units,
            status: p.available_stock <= 10 ? 'LOW_BUFFER' : 'HEALTHY'
          }))
        };
      }
    });

    // -------------------------------------------------------------------------
    // 2. listStockoutRisks (Read-Only)
    // -------------------------------------------------------------------------
    this.register({
      name: 'listStockoutRisks',
      description:
        'Scan store inventory for SKUs at immediate risk of depletion or stockout under current demand conditions.',
      isMutating: false,
      zodSchema: ListStockoutRisksSchema,
      openAiDefinition: {
        type: 'function',
        function: {
          name: 'listStockoutRisks',
          description:
            'Identify SKUs projected to hit stockout or critically low buffer within a given time horizon.',
          parameters: {
            type: 'object',
            properties: {
              store_id: {
                type: 'string',
                description: 'Store identifier'
              },
              horizon_hours: {
                type: 'integer',
                description: 'Forecast horizon in hours (default: 12)'
              }
            }
          }
        }
      },
      execute: async (rawArgs: any, context: CopilotContext) => {
        const args = ListStockoutRisksSchema.parse(rawArgs);
        const storeId = args.store_id || context.storeId;
        const result = await inventoryPositionRepository.findAll(
          { page: 1, limit: 50 },
          { store_id: storeId, low_stock_only: true }
        );

        return {
          store_id: storeId,
          horizon_hours: args.horizon_hours,
          at_risk_count: result.data.length,
          risks: result.data.map((p) => {
            const burnRatePerHour = Math.max(1, Math.round(p.reserved_stock * 0.8) + 2);
            const hoursRemaining =
              burnRatePerHour > 0 ? Number((p.available_stock / burnRatePerHour).toFixed(1)) : 999;
            return {
              sku_id: p.sku_id,
              available_stock: p.available_stock,
              reserved_stock: p.reserved_stock,
              burn_rate_hourly: burnRatePerHour,
              projected_hours_to_depletion: hoursRemaining,
              urgency: hoursRemaining < 3 ? 'CRITICAL' : hoursRemaining < 8 ? 'HIGH' : 'MEDIUM'
            };
          })
        };
      }
    });

    // -------------------------------------------------------------------------
    // 3. explainReplenishmentRecommendation (Read-Only)
    // -------------------------------------------------------------------------
    this.register({
      name: 'explainReplenishmentRecommendation',
      description:
        'Explain the lead times, safety stocks, supplier MOQs, and mathematical rationale behind an automated replenishment recommendation.',
      isMutating: false,
      zodSchema: ExplainReplenishmentRecommendationSchema,
      openAiDefinition: {
        type: 'function',
        function: {
          name: 'explainReplenishmentRecommendation',
          description:
            'Retrieve mathematical inputs, supplier MOQs, lead times, and policy rationale for a specific replenishment recommendation.',
          parameters: {
            type: 'object',
            required: ['recommendation_id'],
            properties: {
              recommendation_id: {
                type: 'string',
                description: 'UUID of the replenishment recommendation'
              }
            }
          }
        }
      },
      execute: async (rawArgs: any) => {
        const args = ExplainReplenishmentRecommendationSchema.parse(rawArgs);
        const rec = await replenishmentRepository.findById(args.recommendation_id);
        if (!rec) {
          throw new Error(`Replenishment recommendation '${args.recommendation_id}' not found`);
        }

        const store = await storeRepository.findById(rec.store_id);

        return {
          id: rec.id,
          store_id: rec.store_id,
          store_name: store?.name || rec.store_id,
          sku_id: rec.sku_id,
          suggested_quantity: rec.suggested_quantity,
          status: rec.status,
          reason: rec.reason,
          calculation_inputs: rec.calculation_inputs,
          created_at: rec.created_at,
          explanation: `Automated replenishment formula evaluated store stock. Available stock was at or below the reorder point (${rec.calculation_inputs?.reorder_point || 'threshold'}). Suggested order is ${rec.suggested_quantity} units factoring supplier minimum order quantity (${rec.calculation_inputs?.supplier_moq || 50}) and lead time buffer.`
        };
      }
    });

    // -------------------------------------------------------------------------
    // 4. explainOrderAllocation (Read-Only)
    // -------------------------------------------------------------------------
    this.register({
      name: 'explainOrderAllocation',
      description:
        'Explain why an order was assigned to a particular dark store, including distance, picking queue latency, and stock availability trade-offs.',
      isMutating: false,
      zodSchema: ExplainOrderAllocationSchema,
      openAiDefinition: {
        type: 'function',
        function: {
          name: 'explainOrderAllocation',
          description:
            'Explain dark store selection and routing trade-offs for a customer order.',
          parameters: {
            type: 'object',
            required: ['order_id'],
            properties: {
              order_id: {
                type: 'string',
                description: 'Order ID (e.g. #ord-morning-rush-01 or ord-surge-001)'
              }
            }
          }
        }
      },
      execute: async (rawArgs: any) => {
        const args = ExplainOrderAllocationSchema.parse(rawArgs);
        const cleanId = args.order_id.replace(/^#/, '');
        const order = await orderRepository.findById(cleanId);
        if (!order) {
          throw new Error(`Order '${args.order_id}' not found`);
        }

        const store = order.store_id ? await storeRepository.findById(order.store_id) : null;

        return {
          order_id: order.id,
          status: order.status,
          store_id: order.store_id,
          store_name: store?.name || (order as any).store_name || 'Unassigned',
          customer_coordinates: {
            lat: order.customer_latitude,
            lon: order.customer_longitude
          },
          line_count: order.line_count,
          total_units: order.total_requested_units,
          allocation_rationale: order.store_id
            ? `Assigned to ${store?.name || order.store_id} based on combined lowest estimated time to doorstep: candidate store had physical stock available, active picker capacity, and minimal queue wait time.`
            : `Order has not been successfully allocated. Pending inventory reservation or coverage zone resolution.`
        };
      }
    });

    // -------------------------------------------------------------------------
    // 5. querySurgeTelemetry (Read-Only)
    // -------------------------------------------------------------------------
    this.register({
      name: 'querySurgeTelemetry',
      description:
        'Inspect live surge order traffic, order arrival velocity, queue bottlenecks, and dark store pressure.',
      isMutating: false,
      zodSchema: QuerySurgeTelemetrySchema,
      openAiDefinition: {
        type: 'function',
        function: {
          name: 'querySurgeTelemetry',
          description:
            'Retrieve live surge traffic statistics, order arrival rates, and queue pressure across dark stores.',
          parameters: {
            type: 'object',
            properties: {
              store_id: {
                type: 'string',
                description: 'Optional store identifier'
              }
            }
          }
        }
      },
      execute: async (rawArgs: any, context: CopilotContext) => {
        const args = QuerySurgeTelemetrySchema.parse(rawArgs);
        const storeId = args.store_id || context.storeId;

        // Query surge order statistics from PostgreSQL
        const sql = `
          SELECT
            COUNT(*) as total_surge_orders,
            COUNT(*) FILTER (WHERE status = 'PENDING') as pending_count,
            COUNT(*) FILTER (WHERE status = 'ALLOCATED') as allocated_count,
            COUNT(*) FILTER (WHERE status = 'PICKING') as picking_count,
            COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_count
          FROM orders
          WHERE id LIKE 'ord-surge-%'
          ${storeId ? 'AND store_id = $1' : ''}
        `;
        const params = storeId ? [storeId] : [];
        const { rows } = await pool.query(sql, params);
        const stats = rows[0] || {};

        return {
          store_id: storeId || 'ALL_STORES',
          surge_active: parseInt(stats.total_surge_orders || '0', 10) > 0,
          total_surge_orders: parseInt(stats.total_surge_orders || '0', 10),
          pending_count: parseInt(stats.pending_count || '0', 10),
          allocated_count: parseInt(stats.allocated_count || '0', 10),
          picking_count: parseInt(stats.picking_count || '0', 10),
          completed_count: parseInt(stats.completed_count || '0', 10),
          estimated_average_fulfillment_minutes: 8.4,
          network_status:
            parseInt(stats.pending_count || '0', 10) > 5 ? 'CONGESTED' : 'NORMAL'
        };
      }
    });

    // -------------------------------------------------------------------------
    // 6. queryPickingBacklog (Read-Only)
    // -------------------------------------------------------------------------
    this.register({
      name: 'queryPickingBacklog',
      description:
        'Inspect active warehouse picking tasks, picker workloads, and tasks approaching SLA breach.',
      isMutating: false,
      zodSchema: QueryPickingBacklogSchema,
      openAiDefinition: {
        type: 'function',
        function: {
          name: 'queryPickingBacklog',
          description:
            'Inspect picking queue status, in-progress tasks, and potential bottlenecks in dark store picking.',
          parameters: {
            type: 'object',
            properties: {
              store_id: {
                type: 'string',
                description: 'Store identifier'
              },
              status: {
                type: 'string',
                enum: ['PENDING_PICK', 'PICKING', 'PICKED', 'FAILED'],
                description: 'Filter by picking task status'
              }
            }
          }
        }
      },
      execute: async (rawArgs: any, context: CopilotContext) => {
        const args = QueryPickingBacklogSchema.parse(rawArgs);
        const storeId = args.store_id || context.storeId;
        const result = await pickingTaskRepository.findAll({
          page: 1,
          limit: 20,
          store_id: storeId,
          status: args.status
        });

        return {
          store_id: storeId || 'ALL_STORES',
          total_tasks: result.pagination.total,
          tasks: result.data.map((t) => ({
            id: t.id,
            order_id: t.order_id,
            store_id: t.store_id,
            status: t.status,
            assigned_picker: t.assigned_picker_id || 'UNASSIGNED',
            started_at: t.started_at,
            created_at: t.created_at
          }))
        };
      }
    });

    // -------------------------------------------------------------------------
    // 7. approveReplenishmentRecommendation (Mutating - Gated)
    // -------------------------------------------------------------------------
    this.register({
      name: 'approveReplenishmentRecommendation',
      description:
        'Propose operator approval of an inbound replenishment recommendation. GATED: Generates an action proposal card for operator confirmation.',
      isMutating: true,
      zodSchema: ApproveReplenishmentSchema,
      openAiDefinition: {
        type: 'function',
        function: {
          name: 'approveReplenishmentRecommendation',
          description:
            'Propose operator approval for a pending replenishment recommendation. Requires human operator confirmation before committing.',
          parameters: {
            type: 'object',
            required: ['recommendation_id'],
            properties: {
              recommendation_id: {
                type: 'string',
                description: 'UUID of the replenishment recommendation to approve'
              },
              reason: {
                type: 'string',
                description: 'Operational justification for approving'
              }
            }
          }
        }
      },
      execute: async (rawArgs: any, context: CopilotContext) => {
        const args = ApproveReplenishmentSchema.parse(rawArgs);
        const rec = await replenishmentRepository.findById(args.recommendation_id);
        if (!rec) {
          throw new Error(`Recommendation '${args.recommendation_id}' not found`);
        }

        if (rec.status !== 'PENDING') {
          return {
            already_processed: true,
            status: rec.status,
            message: `Recommendation '${args.recommendation_id}' is already in status '${rec.status}' and cannot be approved.`
          };
        }

        const store = await storeRepository.findById(rec.store_id);

        // Create action proposal for human operator confirmation
        const proposal: CopilotActionProposal = {
          id: crypto.randomUUID(),
          action_type: 'APPROVE_REPLENISHMENT',
          tool_name: 'approveReplenishmentRecommendation',
          target_entity_type: 'REPLENISHMENT_RECOMMENDATION',
          target_entity_id: rec.id,
          parameters: {
            recommendation_id: rec.id,
            store_id: rec.store_id,
            store_name: store?.name || rec.store_id,
            sku_id: rec.sku_id,
            suggested_quantity: rec.suggested_quantity,
            reason: args.reason || 'Approved via AI Copilot operational recommendation'
          },
          projected_impact: {
            summary: `Approve inbound PO for ${rec.suggested_quantity} units of ${rec.sku_id} into ${store?.name || rec.store_id}.`,
            quantity: rec.suggested_quantity,
            store_id: rec.store_id,
            sku_id: rec.sku_id
          },
          rationale: args.reason || rec.reason,
          status: 'PENDING_APPROVAL',
          proposed_by: context.actorId || 'copilot',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const savedProposal = await copilotProposalRepository.create(proposal);

        await copilotAuditRepository.record({
          id: crypto.randomUUID(),
          correlation_id: context.correlationId,
          actor_id: context.actorId || 'copilot',
          tool_name: 'approveReplenishmentRecommendation',
          parameters: args,
          outcome: 'PROPOSED',
          execution_result: { proposal_id: savedProposal.id },
          created_at: new Date().toISOString()
        });

        return {
          actionProposal: savedProposal,
          requires_operator_approval: true,
          message: `I have prepared an approval proposal for recommendation ${rec.id} (${rec.suggested_quantity} units of ${rec.sku_id}). Please review and confirm in the confirmation card.`
        };
      }
    });

    // -------------------------------------------------------------------------
    // 8. emergencySurgeRestock (Mutating - Gated)
    // -------------------------------------------------------------------------
    this.register({
      name: 'emergencySurgeRestock',
      description:
        'Propose an immediate physical inventory restock to avert stockout during live surge conditions. GATED: Generates an action proposal card.',
      isMutating: true,
      zodSchema: EmergencySurgeRestockSchema,
      openAiDefinition: {
        type: 'function',
        function: {
          name: 'emergencySurgeRestock',
          description:
            'Propose emergency physical stock replenishment for a SKU running dangerously low during surge traffic.',
          parameters: {
            type: 'object',
            required: ['store_id', 'sku_id', 'quantity'],
            properties: {
              store_id: {
                type: 'string',
                description: 'Target dark store ID'
              },
              sku_id: {
                type: 'string',
                description: 'SKU identifier to restock'
              },
              quantity: {
                type: 'integer',
                description: 'Number of units to restock'
              },
              reason: {
                type: 'string',
                description: 'Reason for emergency restock'
              }
            }
          }
        }
      },
      execute: async (rawArgs: any, context: CopilotContext) => {
        const args = EmergencySurgeRestockSchema.parse(rawArgs);
        const store = await storeRepository.findById(args.store_id);
        const currentPos = await inventoryPositionRepository.findByStoreAndSku(
          args.store_id,
          args.sku_id
        );

        const currentPhysical = currentPos ? currentPos.physical_on_hand : 0;
        const currentAvailable = currentPos ? currentPos.available_stock : 0;

        const proposal: CopilotActionProposal = {
          id: crypto.randomUUID(),
          action_type: 'EMERGENCY_RESTOCK',
          tool_name: 'emergencySurgeRestock',
          target_entity_type: 'INVENTORY_POSITION',
          target_entity_id: `${args.store_id}:${args.sku_id}`,
          parameters: {
            store_id: args.store_id,
            store_name: store?.name || args.store_id,
            sku_id: args.sku_id,
            quantity: args.quantity,
            reason: args.reason || 'Emergency surge inventory refuel'
          },
          projected_impact: {
            summary: `Add +${args.quantity} units to physical inventory at ${store?.name || args.store_id}.`,
            current_physical_on_hand: currentPhysical,
            current_available: currentAvailable,
            projected_physical_on_hand: currentPhysical + args.quantity,
            projected_available: currentAvailable + args.quantity
          },
          rationale: args.reason || 'Surge order depletion prevention',
          status: 'PENDING_APPROVAL',
          proposed_by: context.actorId || 'copilot',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const savedProposal = await copilotProposalRepository.create(proposal);

        await copilotAuditRepository.record({
          id: crypto.randomUUID(),
          correlation_id: context.correlationId,
          actor_id: context.actorId || 'copilot',
          tool_name: 'emergencySurgeRestock',
          parameters: args,
          outcome: 'PROPOSED',
          execution_result: { proposal_id: savedProposal.id },
          created_at: new Date().toISOString()
        });

        return {
          actionProposal: savedProposal,
          requires_operator_approval: true,
          message: `I have prepared an Emergency Restock proposal to add ${args.quantity} units of ${args.sku_id} to ${store?.name || args.store_id}. Please confirm below to commit.`
        };
      }
    });

    // -------------------------------------------------------------------------
    // 9. reallocateOrder (Mutating - Gated)
    // -------------------------------------------------------------------------
    this.register({
      name: 'reallocateOrder',
      description:
        'Propose transferring a stuck or delayed customer order from a congested dark store to an alternative store. GATED.',
      isMutating: true,
      zodSchema: ReallocateOrderSchema,
      openAiDefinition: {
        type: 'function',
        function: {
          name: 'reallocateOrder',
          description:
            'Propose reassigning an order from a congested store to another dark store.',
          parameters: {
            type: 'object',
            required: ['order_id', 'target_store_id'],
            properties: {
              order_id: {
                type: 'string',
                description: 'Order ID'
              },
              target_store_id: {
                type: 'string',
                description: 'Destination store ID'
              },
              reason: {
                type: 'string',
                description: 'Justification for transfer'
              }
            }
          }
        }
      },
      execute: async (rawArgs: any, context: CopilotContext) => {
        const args = ReallocateOrderSchema.parse(rawArgs);
        const cleanId = args.order_id.replace(/^#/, '');
        const order = await orderRepository.findById(cleanId);
        if (!order) {
          throw new Error(`Order '${args.order_id}' not found`);
        }

        const targetStore = await storeRepository.findById(args.target_store_id);

        const proposal: CopilotActionProposal = {
          id: crypto.randomUUID(),
          action_type: 'REALLOCATE_ORDER',
          tool_name: 'reallocateOrder',
          target_entity_type: 'ORDER',
          target_entity_id: order.id,
          parameters: {
            order_id: order.id,
            previous_store_id: order.store_id,
            target_store_id: args.target_store_id,
            target_store_name: targetStore?.name || args.target_store_id,
            reason: args.reason || 'Manual load balancing via Copilot'
          },
          projected_impact: {
            summary: `Transfer order #${order.id} to ${targetStore?.name || args.target_store_id} to alleviate picker queue latency.`,
            order_id: order.id,
            target_store_id: args.target_store_id
          },
          rationale: args.reason || 'Queue congestion mitigation',
          status: 'PENDING_APPROVAL',
          proposed_by: context.actorId || 'copilot',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const savedProposal = await copilotProposalRepository.create(proposal);

        await copilotAuditRepository.record({
          id: crypto.randomUUID(),
          correlation_id: context.correlationId,
          actor_id: context.actorId || 'copilot',
          tool_name: 'reallocateOrder',
          parameters: args,
          outcome: 'PROPOSED',
          execution_result: { proposal_id: savedProposal.id },
          created_at: new Date().toISOString()
        });

        return {
          actionProposal: savedProposal,
          requires_operator_approval: true,
          message: `I have prepared a proposal to reallocate Order #${order.id} to ${targetStore?.name || args.target_store_id}. Please confirm to execute the transfer.`
        };
      }
    });
  }
}

export const copilotToolRegistry = new CopilotToolRegistry();
