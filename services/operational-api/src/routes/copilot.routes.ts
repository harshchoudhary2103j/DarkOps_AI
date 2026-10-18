// ============================================================================
// File: src/routes/copilot.routes.ts
// Description: Express endpoints for AI Copilot chat, proposals, decisions & audit.
// ============================================================================

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  CopilotChatRequestSchema,
  CopilotProposalDecisionSchema
} from '../copilot/copilot.schemas';
import { copilotService } from '../copilot/copilot.service';
import { copilotToolRegistry } from '../copilot/copilot-tool.registry';
import { copilotProposalRepository } from '../repositories/copilot-proposal.repository';
import { copilotAuditRepository } from '../repositories/copilot-audit.repository';

export const copilotRouter = Router();

// -----------------------------------------------------------------------------
// POST /api/v1/copilot/chat
// -----------------------------------------------------------------------------
copilotRouter.post('/chat', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const validated = CopilotChatRequestSchema.parse(req.body);
    const result = await copilotService.chat(
      validated.message,
      validated.history || [],
      {
        actorId: req.actorId || 'operator',
        correlationId: req.correlationId || 'corr-copilot-default',
        storeId: validated.store_id
      }
    );
    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// GET /api/v1/copilot/proposals - List Recent Action Proposals
// -----------------------------------------------------------------------------
copilotRouter.get('/proposals', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const proposals = await copilotProposalRepository.listRecent(20);
    res.status(200).json({ data: proposals });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// GET /api/v1/copilot/proposals/:id - Get Action Proposal By ID
// -----------------------------------------------------------------------------
copilotRouter.get('/proposals/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const proposal = await copilotProposalRepository.findById(id);
    if (!proposal) {
      return res.status(404).json({
        error: { code: 'PROPOSAL_NOT_FOUND', message: `Proposal '${id}' not found` }
      });
    }
    res.status(200).json({ data: proposal });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// POST /api/v1/copilot/proposals/:id/decision - Approve or Reject Action Proposal
// -----------------------------------------------------------------------------
copilotRouter.post('/proposals/:id/decision', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const body = CopilotProposalDecisionSchema.parse(req.body);
    const result = await copilotService.handleProposalDecision(
      id,
      body.decision,
      req.actorId || 'operator',
      body.reason,
      req.correlationId
    );
    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// GET /api/v1/copilot/audit-logs - View Copilot Audit Trail
// -----------------------------------------------------------------------------
copilotRouter.get('/audit-logs', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const logs = await copilotAuditRepository.listRecent(50);
    res.status(200).json({ data: logs });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// GET /api/v1/copilot/tools - Registered Tool Specifications
// -----------------------------------------------------------------------------
copilotRouter.get('/tools', (_req: AuthenticatedRequest, res: Response) => {
  const tools = copilotToolRegistry.getAllTools().map((t) => ({
    name: t.name,
    description: t.description,
    isMutating: t.isMutating,
    schema: t.openAiDefinition.function.parameters
  }));
  res.status(200).json({ data: tools });
});
