// ============================================================================
// File: src/components/copilot/CopilotActionCard.tsx
// Description: Two-Stage Human Approval Proposal Card component with verification.
// ============================================================================

import React, { useState } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Loader2,
  Sparkles,
  Building2,
  Package
} from 'lucide-react';
import { api } from '../../lib/api-client';

export interface ActionProposalData {
  id: string;
  action_type: 'EMERGENCY_RESTOCK' | 'APPROVE_REPLENISHMENT' | 'LAUNCH_SURGE_TRAFFIC' | 'REALLOCATE_ORDER';
  tool_name: string;
  target_entity_type?: string;
  target_entity_id?: string;
  parameters: Record<string, any>;
  projected_impact: Record<string, any>;
  rationale: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'EXPIRED';
  proposed_by: string;
  created_at: string;
}

interface CopilotActionCardProps {
  proposal: ActionProposalData;
  onDecision?: (proposalId: string, status: string, verification?: any) => void;
}

export const CopilotActionCard: React.FC<CopilotActionCardProps> = ({ proposal, onDecision }) => {
  const [loading, setLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(proposal.status);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDecision = async (decision: 'APPROVE' | 'REJECT') => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.copilotDecideProposal(proposal.id, decision, `Operator decision via Copilot card`);
      const updatedStatus = res.data.proposal?.status || (decision === 'APPROVE' ? 'EXECUTED' : 'REJECTED');
      setCurrentStatus(updatedStatus);
      setVerificationResult(res.data.verification);
      if (onDecision) {
        onDecision(proposal.id, updatedStatus, res.data.verification);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process decision');
    } finally {
      setLoading(false);
    }
  };

  const getActionBadgeColor = (type: string) => {
    switch (type) {
      case 'EMERGENCY_RESTOCK':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'APPROVE_REPLENISHMENT':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'REALLOCATE_ORDER':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      default:
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
    }
  };

  return (
    <div className="my-3 p-4 rounded-xl bg-navy-900/90 border-2 border-amber-500/30 shadow-xl backdrop-blur-md transition-all">
      {/* Top Banner: Gated Safety Warning */}
      <div className="flex items-center justify-between pb-3 border-b border-navy-750">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400 animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
            Action Gated • Operator Approval Required
          </span>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-medium border ${getActionBadgeColor(
            proposal.action_type
          )}`}
        >
          {proposal.action_type.replace('_', ' ')}
        </span>
      </div>

      {/* Proposal Summary & Impact */}
      <div className="mt-3 space-y-2 text-sm text-slate-200">
        <div className="p-2.5 rounded-lg bg-navy-950/60 border border-navy-800 text-xs">
          <div className="font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            Projected Operational Impact
          </div>
          <p className="text-slate-300 font-sans leading-relaxed">
            {proposal.projected_impact?.summary || proposal.rationale}
          </p>
        </div>

        {/* Entity Metadata Chips */}
        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
          {proposal.parameters?.store_name && (
            <div className="flex items-center gap-1.5 p-2 rounded bg-navy-800/50 border border-navy-750">
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <div className="truncate">
                <span className="text-slate-400 block text-[10px]">Target Store</span>
                <span className="font-medium text-slate-200">{proposal.parameters.store_name}</span>
              </div>
            </div>
          )}

          {proposal.parameters?.sku_id && (
            <div className="flex items-center gap-1.5 p-2 rounded bg-navy-800/50 border border-navy-750">
              <Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <div className="truncate">
                <span className="text-slate-400 block text-[10px]">SKU Target</span>
                <span className="font-mono text-cyan-300">{proposal.parameters.sku_id}</span>
              </div>
            </div>
          )}

          {proposal.parameters?.quantity && (
            <div className="flex items-center gap-1.5 p-2 rounded bg-navy-800/50 border border-navy-750 col-span-2">
              <ArrowRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <div>
                <span className="text-slate-400 block text-[10px]">Restock Quantity</span>
                <span className="font-bold text-emerald-400 text-sm">+{proposal.parameters.quantity} Units</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error message if execution fails */}
      {errorMessage && (
        <div className="mt-3 p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Decision State or Buttons */}
      <div className="mt-4 pt-3 border-t border-navy-750/80 flex items-center justify-between">
        {currentStatus === 'PENDING_APPROVAL' ? (
          <div className="flex items-center gap-2 w-full justify-end">
            <button
              onClick={() => handleDecision('REJECT')}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-navy-800 hover:bg-navy-750 border border-navy-700 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <XCircle className="w-3.5 h-3.5 text-slate-400" />
              Dismiss
            </button>
            <button
              onClick={() => handleDecision('APPROVE')}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/40 shadow-lg shadow-emerald-950 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  Confirm & Execute
                </>
              )}
            </button>
          </div>
        ) : currentStatus === 'EXECUTED' || currentStatus === 'APPROVED' ? (
          <div className="w-full flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold">Action Verified & Committed in PostgreSQL</span>
            </div>
            {verificationResult?.verified_status && (
              <span className="font-mono bg-emerald-900/60 px-2 py-0.5 rounded text-[11px]">
                Status: {verificationResult.verified_status}
              </span>
            )}
          </div>
        ) : (
          <div className="w-full flex items-center gap-2 p-2 rounded-lg bg-slate-800/40 border border-slate-700 text-xs text-slate-400">
            <XCircle className="w-4 h-4 text-slate-400" />
            <span>Action rejected by operator. Zero database changes committed.</span>
          </div>
        )}
      </div>
    </div>
  );
};
