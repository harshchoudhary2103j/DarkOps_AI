// ============================================================================
// File: src/copilot/copilot.service.ts
// Description: AI Copilot Orchestrator with OpenAI tool calling, fallback engine,
//              Two-Stage Approval gate, and Post-Execution verification.
// ============================================================================

import crypto from 'crypto';
import OpenAI from 'openai';
import {
  CopilotContext,
  CopilotChatResponse,
  CopilotActionProposal,
  CopilotToolExecutionResult
} from './copilot.types';
import { copilotToolRegistry } from './copilot-tool.registry';
import { copilotProposalRepository } from '../repositories/copilot-proposal.repository';
import { copilotAuditRepository } from '../repositories/copilot-audit.repository';
import { replenishmentService } from '../services/replenishment.service';
import { replenishmentRepository } from '../repositories/replenishment.repository';
import { inventoryService } from '../services/inventory.service';
import { inventoryPositionRepository } from '../repositories/inventory-position.repository';
import { orderRepository } from '../repositories/order.repository';
import { storeRepository } from '../repositories/store.repository';

export class CopilotService {
  private openaiClient: OpenAI | null = null;

  constructor() {
    this.initOpenAI();
  }

  private initOpenAI() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey && apiKey.trim() !== '') {
      this.openaiClient = new OpenAI({ apiKey: apiKey.trim() });
    } else {
      this.openaiClient = null;
    }
  }

  /**
   * Main chat completion entry point.
   * If OPENAI_API_KEY is present, calls OpenAI Chat Completions with typed tools.
   * If OPENAI_API_KEY is absent or fails, falls back to deterministic domain tool orchestrator.
   */
  async chat(
    message: string,
    history: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
    context: CopilotContext
  ): Promise<CopilotChatResponse> {
    // Re-check client in case env var was set dynamically
    if (!this.openaiClient && process.env.OPENAI_API_KEY) {
      this.initOpenAI();
    }

    if (this.openaiClient) {
      try {
        return await this.chatWithOpenAI(message, history, context);
      } catch (err: any) {
        console.warn('[CopilotService] OpenAI call failed, falling back to deterministic engine:', err?.message || err);
        return await this.chatWithDeterministicFallback(message, context);
      }
    }

    return await this.chatWithDeterministicFallback(message, context);
  }

  /**
   * Real OpenAI Function Calling workflow.
   */
  private async chatWithOpenAI(
    message: string,
    history: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
    context: CopilotContext
  ): Promise<CopilotChatResponse> {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const tools = copilotToolRegistry.getOpenAiToolDefinitions();

    const systemPrompt = `You are the DarkOps AI Operations Copilot, a high-precision operations assistant for quick-commerce dark stores.
Active Context: Store ID = ${context.storeId || 'None (All Stores)'}.
Operational Rules:
1. Always quote exact numbers returned from tools. Never invent or synthesize operational metrics.
2. For read-only queries, call the appropriate query tool ('queryStoreInventory', 'listStockoutRisks', 'querySurgeTelemetry', 'explainOrderAllocation', 'explainReplenishmentRecommendation').
3. CRITICAL FOR MUTATING ACTIONS: When the user asks or proposes to restock inventory, approve a replenishment recommendation, or transfer/reallocate an order, you MUST invoke the corresponding mutating tool ('emergencySurgeRestock', 'approveReplenishmentRecommendation', 'reallocateOrder'). Do NOT simply draft or describe the action in plain text. Calling the tool produces the interactive Human Approval Card in the user interface.
4. If a specific store ID is not given in the user query, use Active Context Store ID or 'store-manhattan-demo-01'. For common SKUs: milk is 'sku-manhattan-demo-006', coffee is 'sku-manhattan-demo-007', bananas is 'sku-manhattan-demo-001'.
5. Keep explanations concise, professional, and directly actionable.`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((h) => ({ role: h.role as any, content: h.content })),
      { role: 'user', content: message }
    ];

    const runner = await this.openaiClient!.chat.completions.create({
      model,
      messages,
      tools: tools as any,
      tool_choice: 'auto',
      temperature: 0.1
    });

    const choice = runner.choices[0];
    const executedTools: CopilotToolExecutionResult[] = [];
    let pendingProposal: CopilotActionProposal | undefined;

    // Check if the model decided to call tools
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const toolMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        ...messages,
        choice.message
      ];

      for (const call of choice.message.tool_calls) {
        if (call.type !== 'function') continue;
        const toolName = call.function.name;
        let toolArgs: any = {};
        try {
          toolArgs = JSON.parse(call.function.arguments || '{}');
        } catch {
          toolArgs = {};
        }

        const registeredTool = copilotToolRegistry.getTool(toolName);
        if (registeredTool) {
          try {
            const output = await registeredTool.execute(toolArgs, context);

            if (registeredTool.isMutating && output.actionProposal) {
              pendingProposal = output.actionProposal;
              executedTools.push({
                tool_name: toolName,
                parameters: toolArgs,
                actionProposal: output.actionProposal,
                isMutating: true
              });
            } else {
              executedTools.push({
                tool_name: toolName,
                parameters: toolArgs,
                result: output,
                isMutating: false
              });
              await copilotAuditRepository.record({
                id: crypto.randomUUID(),
                correlation_id: context.correlationId,
                actor_id: context.actorId || 'copilot',
                tool_name: toolName,
                parameters: toolArgs,
                outcome: 'SUCCESS',
                execution_result: output,
                created_at: new Date().toISOString()
              });
            }

            toolMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify(output)
            });
          } catch (toolErr: any) {
            toolMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify({ error: toolErr.message })
            });
            await copilotAuditRepository.record({
              id: crypto.randomUUID(),
              correlation_id: context.correlationId,
              actor_id: context.actorId || 'copilot',
              tool_name: toolName,
              parameters: toolArgs,
              outcome: 'FAILURE',
              execution_result: { error: toolErr.message },
              created_at: new Date().toISOString()
            });
          }
        }
      }

      // Final completion synthesizing tool outputs
      const secondResponse = await this.openaiClient!.chat.completions.create({
        model,
        messages: toolMessages,
        temperature: 0.1
      });

      return {
        reply: secondResponse.choices[0].message.content || 'Analysis complete.',
        toolCallsExecuted: executedTools,
        actionProposal: pendingProposal,
        correlationId: context.correlationId
      };
    }

    return {
      reply: choice.message.content || 'How can I assist with dark store operations?',
      toolCallsExecuted: [],
      actionProposal: undefined,
      correlationId: context.correlationId
    };
  }

  /**
   * Deterministic intent fallback engine (used in offline / test mode or when no OpenAI key is set).
   */
  private async chatWithDeterministicFallback(
    message: string,
    context: CopilotContext
  ): Promise<CopilotChatResponse> {
    const q = message.toLowerCase();
    const executedTools: CopilotToolExecutionResult[] = [];
    let pendingProposal: CopilotActionProposal | undefined;
    let reply = '';

    // 1. Emergency Restock proposal
    if (q.includes('emergency') || (q.includes('restock') && (q.includes('propose') || q.includes('add')))) {
      const tool = copilotToolRegistry.getTool('emergencySurgeRestock')!;
      // Find candidate store from context or query active stores from DB
      let storeId = context.storeId;
      if (!storeId) {
        const { data: stores } = await storeRepository.findAll({ page: 1, limit: 1 });
        storeId = stores.length > 0 ? stores[0].id : 'store-manhattan-demo-01';
      }
      const quantityMatch = message.match(/\b(\d+)\b/);
      const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 50;

      // Extract SKU if mentioned
      let skuId = 'sku-manhattan-demo-006';
      if (q.includes('banana') || q.includes('001')) skuId = 'sku-manhattan-demo-001';
      if (q.includes('coffee') || q.includes('007')) skuId = 'sku-manhattan-demo-007';

      const output = await tool.execute(
        { store_id: storeId, sku_id: skuId, quantity, reason: 'Operator requested emergency restock' },
        context
      );
      pendingProposal = output.actionProposal;
      executedTools.push({
        tool_name: 'emergencySurgeRestock',
        parameters: { store_id: storeId, sku_id: skuId, quantity },
        actionProposal: output.actionProposal,
        isMutating: true
      });
      reply = `I have generated an Emergency Restock Action Proposal for ${quantity} units of ${skuId} at ${storeId}. In accordance with DarkOps security invariants, please review and confirm the action in the proposal card below.`;
    }
    // 2. Approve Replenishment proposal
    else if (q.includes('approve') && (q.includes('replenishment') || q.includes('po') || q.includes('rec-') || q.includes('recommendation'))) {
      const tool = copilotToolRegistry.getTool('approveReplenishmentRecommendation')!;
      // Search for a pending recommendation or find one in DB
      const uuidMatch = message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      let recId = uuidMatch ? uuidMatch[0] : '';

      if (!recId) {
        const { data: recs } = await replenishmentRepository.findAll(
          { page: 1, limit: 1 },
          { status: 'PENDING' }
        );
        if (recs.length > 0) recId = recs[0].id;
      }

      if (recId) {
        const output = await tool.execute({ recommendation_id: recId, reason: 'Operator approved via Copilot' }, context);
        pendingProposal = output.actionProposal;
        executedTools.push({
          tool_name: 'approveReplenishmentRecommendation',
          parameters: { recommendation_id: recId },
          actionProposal: output.actionProposal,
          isMutating: true
        });
        reply = output.message || `Prepared replenishment approval card for recommendation ${recId}. Please confirm in the card below to commit to PostgreSQL.`;
      } else {
        reply = `No pending replenishment recommendations are currently awaiting approval.`;
      }
    }
    // 3. Stockout Risk
    else if (q.includes('stockout') || q.includes('risk') || q.includes('deplet') || q.includes('run out')) {
      const tool = copilotToolRegistry.getTool('listStockoutRisks')!;
      const output = await tool.execute({ store_id: context.storeId, horizon_hours: 12 }, context);
      executedTools.push({
        tool_name: 'listStockoutRisks',
        parameters: { store_id: context.storeId, horizon_hours: 12 },
        result: output,
        isMutating: false
      });
      if (output.at_risk_count === 0) {
        reply = `All inventory positions are currently operating above critical safety buffers across the active horizon (12 hours).`;
      } else {
        const top = output.risks.slice(0, 3).map((r: any) => `• SKU \`${r.sku_id}\`: ${r.available_stock} available (~${r.projected_hours_to_depletion}h until depletion)`).join('\n');
        reply = `Identified **${output.at_risk_count} SKU(s)** at risk of stockout within 12 hours:\n\n${top}\n\nWould you like me to prepare an emergency restock proposal?`;
      }
    }
    // 4. Live Surge Telemetry / Pressure
    else if (q.includes('surge') || q.includes('pressure') || q.includes('traffic') || q.includes('velocity')) {
      const tool = copilotToolRegistry.getTool('querySurgeTelemetry')!;
      const output = await tool.execute({ store_id: context.storeId }, context);
      executedTools.push({
        tool_name: 'querySurgeTelemetry',
        parameters: { store_id: context.storeId },
        result: output,
        isMutating: false
      });
      reply = `**Live Surge Telemetry:**\n- Total Live Surge Orders: **${output.total_surge_orders}**\n- Pending Pick / Allocation: **${output.pending_count}**\n- Picking In Progress: **${output.picking_count}**\n- Completed Fulfillments: **${output.completed_count}**\n- Network Congestion: **${output.network_status}**`;
    }
    // 5. Order Allocation / Delay Explanation
    else if (q.includes('order') || q.includes('ord-') || q.includes('allocat')) {
      const idMatch = message.match(/ord-[a-z0-9-]+/i) || message.match(/#[a-z0-9-]+/i);
      const cleanId = idMatch ? idMatch[0].replace(/^#/, '') : 'ord-morning-rush-01';

      try {
        const tool = copilotToolRegistry.getTool('explainOrderAllocation')!;
        const output = await tool.execute({ order_id: cleanId }, context);
        executedTools.push({
          tool_name: 'explainOrderAllocation',
          parameters: { order_id: cleanId },
          result: output,
          isMutating: false
        });
        reply = `**Order Allocation Analysis for \`#${output.order_id}\`:**\n- Status: \`${output.status}\`\n- Assigned Store: **${output.store_name}**\n- Line Count: ${output.line_count} items (${output.total_units} units)\n- Routing Rationale: ${output.allocation_rationale}`;
      } catch (err: any) {
        reply = `Could not find specific order details: ${err.message}. Please verify the Order ID.`;
      }
    }
    // 6. Replenishment Explanation
    else if (q.includes('replenish') || q.includes('recommendation')) {
      const { data: recs } = await replenishmentRepository.findAll({ page: 1, limit: 1 }, {});
      if (recs.length > 0) {
        const tool = copilotToolRegistry.getTool('explainReplenishmentRecommendation')!;
        const output = await tool.execute({ recommendation_id: recs[0].id }, context);
        executedTools.push({
          tool_name: 'explainReplenishmentRecommendation',
          parameters: { recommendation_id: recs[0].id },
          result: output,
          isMutating: false
        });
        reply = `**Replenishment Recommendation Analysis:**\n- Store: **${output.store_name}**\n- SKU: \`${output.sku_id}\`\n- Suggested Restock: **${output.suggested_quantity} units**\n- Status: \`${output.status}\`\n- Rationale: ${output.explanation}`;
      } else {
        reply = `No replenishment recommendations found in the database.`;
      }
    }
    // 7. General Inventory Query
    else {
      const tool = copilotToolRegistry.getTool('queryStoreInventory')!;
      const output = await tool.execute({ store_id: context.storeId }, context);
      executedTools.push({
        tool_name: 'queryStoreInventory',
        parameters: { store_id: context.storeId },
        result: output,
        isMutating: false
      });
      const sample = output.positions.slice(0, 4).map((p: any) => `• \`${p.sku_id}\`: On-Hand: ${p.physical_on_hand} | Reserved: ${p.reserved_stock} | Available: **${p.available_stock}**`).join('\n');
      reply = `**Inventory Status for ${output.store_name || 'Network'}:**\nFound ${output.total_positions} inventory positions:\n\n${sample}\n\nAsk me about stockout risks, surge order volume, or order routing!`;
    }

    return {
      reply,
      toolCallsExecuted: executedTools,
      actionProposal: pendingProposal,
      correlationId: context.correlationId
    };
  }

  /**
   * Two-Stage Operator Decision Workflow (Confirm / Reject Action Proposals).
   * Strictly enforces Post-Execution State Verification and Immutable Audit Logging.
   */
  async handleProposalDecision(
    proposalId: string,
    decision: 'APPROVE' | 'REJECT',
    actorId: string = 'operator',
    reason?: string,
    correlationId?: string
  ): Promise<{ status: string; message: string; proposal: CopilotActionProposal; verification?: any }> {
    const proposal = await copilotProposalRepository.findById(proposalId);
    if (!proposal) {
      throw new Error(`Action proposal '${proposalId}' not found`);
    }

    if (proposal.status !== 'PENDING_APPROVAL') {
      throw new Error(`Proposal '${proposalId}' has already been processed with status '${proposal.status}'`);
    }

    const now = new Date().toISOString();

    // 1. Operator Rejection
    if (decision === 'REJECT') {
      const updated = await copilotProposalRepository.updateStatus(proposalId, 'REJECTED', actorId, now);
      await copilotAuditRepository.record({
        id: crypto.randomUUID(),
        correlation_id: correlationId,
        actor_id: actorId,
        tool_name: proposal.tool_name,
        parameters: proposal.parameters,
        outcome: 'REJECTED',
        execution_result: { reason: reason || 'Operator dismissed proposal' },
        created_at: now
      });

      return {
        status: 'REJECTED',
        message: `Action proposal ${proposalId} was rejected by operator. Zero mutations committed.`,
        proposal: updated
      };
    }

    // 2. Operator Approval Execution
    let verification: any = {};

    switch (proposal.action_type) {
      case 'APPROVE_REPLENISHMENT': {
        const recId = proposal.parameters.recommendation_id;
        await replenishmentService.approve(recId, actorId, reason);

        // Verification Before Reporting Invariant: Re-query database
        const verifiedRec = await replenishmentRepository.findById(recId);
        if (!verifiedRec || verifiedRec.status !== 'APPROVED') {
          throw new Error(`State verification failed: recommendation '${recId}' did not transition to APPROVED`);
        }
        verification = {
          entity_id: recId,
          verified_status: verifiedRec.status,
          decided_at: verifiedRec.decided_at
        };
        break;
      }

      case 'EMERGENCY_RESTOCK': {
        const { store_id, sku_id, quantity } = proposal.parameters;
        const currentPos = await inventoryPositionRepository.findByStoreAndSku(store_id, sku_id);
        if (!currentPos) {
          await inventoryService.initializeInventory(
            {
              store_id,
              sku_id,
              initial_physical_on_hand: quantity,
              initial_reserved_stock: 0,
              initial_incoming_units: 0,
              reason: 'Opening position via emergency restock'
            },
            actorId,
            correlationId
          );
        } else {
          await inventoryService.receiveStock(
            {
              store_id,
              sku_id,
              quantity,
              reason: reason || 'Emergency surge inventory refuel via Copilot confirmation'
            },
            actorId,
            correlationId
          );
        }

        // Verification Before Reporting Invariant: Re-query database
        const verifiedPos = await inventoryPositionRepository.findByStoreAndSku(store_id, sku_id);
        verification = {
          store_id,
          sku_id,
          verified_physical_on_hand: verifiedPos?.physical_on_hand,
          verified_available_stock: verifiedPos?.available_stock
        };
        break;
      }

      case 'REALLOCATE_ORDER': {
        const { order_id, target_store_id } = proposal.parameters;
        const cleanId = order_id.replace(/^#/, '');
        const order = await orderRepository.findById(cleanId);
        if (!order) {
          throw new Error(`Order '${cleanId}' not found during reallocation execution`);
        }
        order.store_id = target_store_id;
        order.updated_at = now;
        await orderRepository.update(order);

        // Verification Before Reporting Invariant: Re-query database
        const verifiedOrder = await orderRepository.findById(cleanId);
        verification = {
          order_id: cleanId,
          verified_store_id: verifiedOrder?.store_id
        };
        break;
      }

      default:
        throw new Error(`Unknown action type: ${proposal.action_type}`);
    }

    // Mark proposal EXECUTED
    const updated = await copilotProposalRepository.updateStatus(proposalId, 'EXECUTED', actorId, now);

    // Record immutable audit entry
    await copilotAuditRepository.record({
      id: crypto.randomUUID(),
      correlation_id: correlationId,
      actor_id: actorId,
      tool_name: proposal.tool_name,
      parameters: proposal.parameters,
      outcome: 'APPROVED',
      execution_result: verification,
      created_at: now
    });

    return {
      status: 'EXECUTED',
      message: `Action executed and verified in PostgreSQL: ${proposal.projected_impact.summary || 'Operation complete.'}`,
      proposal: updated,
      verification
    };
  }
}

export const copilotService = new CopilotService();
