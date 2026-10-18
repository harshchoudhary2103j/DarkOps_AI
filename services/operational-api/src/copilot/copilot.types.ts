// ============================================================================
// File: src/copilot/copilot.types.ts
// Description: Domain types for AI Operations Copilot, tools, proposals & audit.
// ============================================================================

export type CopilotRole = 'system' | 'user' | 'assistant' | 'tool';

export interface CopilotChatMessage {
  role: CopilotRole;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export type CopilotActionType =
  | 'EMERGENCY_RESTOCK'
  | 'APPROVE_REPLENISHMENT'
  | 'LAUNCH_SURGE_TRAFFIC'
  | 'REALLOCATE_ORDER';

export type CopilotProposalStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTED'
  | 'EXPIRED';

export interface CopilotActionProposal {
  id: string;
  action_type: CopilotActionType;
  tool_name: string;
  target_entity_type?: string;
  target_entity_id?: string;
  parameters: Record<string, any>;
  projected_impact: Record<string, any>;
  rationale: string;
  status: CopilotProposalStatus;
  proposed_by: string;
  decided_by?: string;
  decided_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CopilotAuditEvent {
  id: string;
  correlation_id?: string;
  actor_id: string;
  tool_name: string;
  parameters: Record<string, any>;
  outcome: 'SUCCESS' | 'FAILURE' | 'PROPOSED' | 'APPROVED' | 'REJECTED';
  execution_result?: Record<string, any>;
  created_at: string;
}

export interface CopilotContext {
  actorId: string;
  correlationId: string;
  storeId?: string;
}

export interface CopilotToolExecutionResult {
  tool_name: string;
  parameters: Record<string, any>;
  result?: any;
  actionProposal?: CopilotActionProposal;
  isMutating: boolean;
}

export interface CopilotChatResponse {
  reply: string;
  toolCallsExecuted: CopilotToolExecutionResult[];
  actionProposal?: CopilotActionProposal;
  correlationId: string;
}
