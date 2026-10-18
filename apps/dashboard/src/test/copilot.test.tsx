// ============================================================================
// File: src/test/copilot.test.tsx
// Description: Frontend tests for AI Operations Copilot Drawer & Action Card.
// ============================================================================

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CopilotActionCard, ActionProposalData } from '../components/copilot/CopilotActionCard';
import { CopilotTriggerButton } from '../components/copilot/CopilotTriggerButton';
import { CopilotDrawer } from '../components/copilot/CopilotDrawer';
import { api } from '../lib/api-client';

describe('Copilot Action Card (Two-Stage Human In The Loop)', () => {
  const sampleProposal: ActionProposalData = {
    id: 'prop-test-456',
    action_type: 'EMERGENCY_RESTOCK',
    tool_name: 'emergencySurgeRestock',
    parameters: {
      store_id: 'STORE-MANHATTAN-01',
      store_name: 'Manhattan Hub #01',
      sku_id: 'sku-manhattan-demo-006',
      quantity: 50
    },
    projected_impact: {
      summary: 'Add +50 units of Organic Whole Milk to avert surge stockout.'
    },
    rationale: 'Active surge traffic burn rate is 18 units/hr',
    status: 'PENDING_APPROVAL',
    proposed_by: 'copilot',
    created_at: new Date().toISOString()
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders action proposal details, parameters, and buttons', () => {
    render(<CopilotActionCard proposal={sampleProposal} />);

    expect(screen.getByText(/Operator Approval Required/i)).toBeInTheDocument();
    expect(screen.getByText('EMERGENCY RESTOCK')).toBeInTheDocument();
    expect(
      screen.getByText(/Add \+50 units of Organic Whole Milk to avert surge stockout/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Manhattan Hub #01')).toBeInTheDocument();
    expect(screen.getByText('sku-manhattan-demo-006')).toBeInTheDocument();
    expect(screen.getByText('+50 Units')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm & execute/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
  });

  it('executes approval decision and shows verified state', async () => {
    const decideSpy = vi.spyOn(api, 'copilotDecideProposal').mockResolvedValue({
      data: {
        status: 'EXECUTED',
        message: 'Action verified',
        proposal: { ...sampleProposal, status: 'EXECUTED' },
        verification: { verified_status: 'APPROVED' }
      }
    } as any);

    const onDecisionMock = vi.fn();
    render(<CopilotActionCard proposal={sampleProposal} onDecision={onDecisionMock} />);

    const approveBtn = screen.getByRole('button', { name: /confirm & execute/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(decideSpy).toHaveBeenCalledWith('prop-test-456', 'APPROVE', expect.any(String));
      expect(screen.getByText(/Action Verified & Committed in PostgreSQL/i)).toBeInTheDocument();
    });
  });

  it('handles operator rejection cleanly without mutation', async () => {
    const decideSpy = vi.spyOn(api, 'copilotDecideProposal').mockResolvedValue({
      data: {
        status: 'REJECTED',
        message: 'Rejected',
        proposal: { ...sampleProposal, status: 'REJECTED' }
      }
    } as any);

    render(<CopilotActionCard proposal={sampleProposal} />);

    const dismissBtn = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(decideSpy).toHaveBeenCalledWith('prop-test-456', 'REJECT', expect.any(String));
      expect(screen.getByText(/Action rejected by operator/i)).toBeInTheDocument();
    });
  });
});

describe('Copilot Trigger Button & Drawer UI', () => {
  it('renders trigger button and fires click event', () => {
    const handleClick = vi.fn();
    render(<CopilotTriggerButton isOpen={false} onClick={handleClick} />);

    const button = screen.getByRole('button', { name: /open ai operations copilot/i });
    expect(button).toBeInTheDocument();
    expect(screen.getByText('AI Copilot')).toBeInTheDocument();

    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders Copilot Drawer with active store scope and sends message', async () => {
    const chatSpy = vi.spyOn(api, 'copilotChat').mockResolvedValue({
      data: {
        reply: 'Manhattan Hub #01 has 42 units of Whole Milk available.',
        toolCallsExecuted: [
          {
            tool_name: 'queryStoreInventory',
            parameters: { store_id: 'STORE-MANHATTAN-01' },
            isMutating: false
          }
        ],
        correlationId: 'corr-ui-test'
      }
    } as any);

    const handleClose = vi.fn();
    render(
      <CopilotDrawer
        isOpen={true}
        onClose={handleClose}
        selectedStoreId="STORE-MANHATTAN-01"
      />
    );

    expect(screen.getByText('DarkOps AI Copilot')).toBeInTheDocument();
    expect(screen.getByText('STORE-MANHATTAN-01')).toBeInTheDocument();

    // Type a question into input
    const input = screen.getByPlaceholderText(/Ask about inventory/i);
    fireEvent.change(input, { target: { value: 'How much milk is left?' } });

    const sendBtn = screen.getByRole('button', { name: /send message/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(chatSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'How much milk is left?',
          store_id: 'STORE-MANHATTAN-01'
        })
      );
      expect(screen.getByText(/has 42 units of Whole Milk available/i)).toBeInTheDocument();
      expect(screen.getByText('queryStoreInventory')).toBeInTheDocument();
    });
  });
});
