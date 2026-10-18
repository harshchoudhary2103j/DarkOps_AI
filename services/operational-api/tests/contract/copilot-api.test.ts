// ============================================================================
// File: tests/contract/copilot-api.test.ts
// Description: Contract tests for Copilot REST endpoints.
// ============================================================================

import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { Express } from 'express';
import { copilotService } from '../../src/copilot/copilot.service';
import { copilotProposalRepository } from '../../src/repositories/copilot-proposal.repository';
import { copilotAuditRepository } from '../../src/repositories/copilot-audit.repository';

describe('Copilot REST API Contract Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  it('GET /api/v1/copilot/tools returns list of registered tools', async () => {
    const res = await request(app).get('/api/v1/copilot/tools');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(6);

    const toolNames = res.body.data.map((t: any) => t.name);
    expect(toolNames).toContain('queryStoreInventory');
    expect(toolNames).toContain('listStockoutRisks');
    expect(toolNames).toContain('emergencySurgeRestock');
    expect(toolNames).toContain('approveReplenishmentRecommendation');
  });

  it('POST /api/v1/copilot/chat rejects empty message with VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/copilot/chat')
      .send({ message: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/copilot/chat processes valid prompt via service', async () => {
    vi.spyOn(copilotService, 'chat').mockResolvedValue({
      reply: 'Inventory is healthy across stores.',
      toolCallsExecuted: [
        {
          tool_name: 'queryStoreInventory',
          parameters: { store_id: 'STORE-01' },
          result: { total_positions: 10 },
          isMutating: false
        }
      ],
      correlationId: 'corr-chat-test'
    });

    const res = await request(app)
      .post('/api/v1/copilot/chat')
      .send({ message: 'What is the stock in Store 01?', store_id: 'STORE-01' });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.reply).toBe('Inventory is healthy across stores.');
    expect(res.body.data.toolCallsExecuted).toHaveLength(1);
  });

  it('POST /api/v1/copilot/proposals/:id/decision validates decision payload', async () => {
    const res = await request(app)
      .post('/api/v1/copilot/proposals/prop-123/decision')
      .send({ decision: 'INVALID_DECISION' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/copilot/proposals/:id/decision processes APPROVE successfully', async () => {
    vi.spyOn(copilotService, 'handleProposalDecision').mockResolvedValue({
      status: 'EXECUTED',
      message: 'Action executed and verified',
      proposal: {
        id: 'prop-123',
        status: 'EXECUTED'
      } as any,
      verification: { verified: true }
    });

    const res = await request(app)
      .post('/api/v1/copilot/proposals/prop-123/decision')
      .send({ decision: 'APPROVE', reason: 'Reviewed by operator' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('EXECUTED');
  });

  it('GET /api/v1/copilot/audit-logs returns recent audit events', async () => {
    vi.spyOn(copilotAuditRepository, 'listRecent').mockResolvedValue([
      {
        id: 'aud-01',
        tool_name: 'queryStoreInventory',
        parameters: {},
        outcome: 'SUCCESS',
        actor_id: 'operator',
        created_at: new Date().toISOString()
      }
    ]);

    const res = await request(app).get('/api/v1/copilot/audit-logs');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].tool_name).toBe('queryStoreInventory');
  });
});
