import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Badge, getStatusBadgeVariant } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Dialog } from '../components/ui/Dialog';
import { SyntheticBanner } from '../components/layout/SyntheticBanner';

describe('UI Primitives and Layout Components', () => {
  it('renders Synthetic Environment Banner with exact required message', () => {
    render(<SyntheticBanner />);
    const banner = screen.getByRole('complementary', { name: /synthetic environment notice/i });
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(
      'Operating in Synthetic Quick-Commerce Environment — All data and metrics are simulated.'
    );
  });

  it('renders Badge with correct status variants', () => {
    expect(getStatusBadgeVariant('ACTIVE')).toBe('emerald');
    expect(getStatusBadgeVariant('PENDING')).toBe('amber');
    expect(getStatusBadgeVariant('CANCELLED')).toBe('rose');
    expect(getStatusBadgeVariant('DISPATCHED')).toBe('cyan');

    const { rerender } = render(<Badge variant="emerald" id="badge-test">Active Store</Badge>);
    expect(screen.getByText('Active Store')).toBeInTheDocument();

    rerender(<Badge variant="rose">Out of Stock</Badge>);
    expect(screen.getByText('Out of Stock')).toBeInTheDocument();
  });

  it('renders Button and handles click events and loading states', () => {
    const handleClick = vi.fn();
    const { rerender } = render(
      <Button id="test-btn" onClick={handleClick}>
        Confirm Action
      </Button>
    );

    const btn = screen.getByRole('button', { name: /confirm action/i });
    fireEvent.click(btn);
    expect(handleClick).toHaveBeenCalledTimes(1);

    // When loading, button is disabled
    rerender(
      <Button id="test-btn" onClick={handleClick} isLoading>
        Confirm Action
      </Button>
    );
    expect(btn).toBeDisabled();
  });

  it('renders Card with header and content', () => {
    render(
      <Card id="test-card">
        <CardHeader title="Store Hub Alpha" description="Active Dark Store" />
        <CardContent>
          <div>Queue depth: 5</div>
        </CardContent>
      </Card>
    );

    expect(screen.getByText('Store Hub Alpha')).toBeInTheDocument();
    expect(screen.getByText('Active Dark Store')).toBeInTheDocument();
    expect(screen.getByText('Queue depth: 5')).toBeInTheDocument();
  });

  it('renders EmptyState and calls action callback', () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        title="No Orders Found"
        description="Try adjusting your status filter."
        actionText="Reset Filter"
        onAction={onAction}
        id="empty-test"
      />
    );

    expect(screen.getByText('No Orders Found')).toBeInTheDocument();
    const actionBtn = screen.getByRole('button', { name: /reset filter/i });
    fireEvent.click(actionBtn);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders ErrorState with error details and retry button', () => {
    const onRetry = vi.fn();
    render(
      <ErrorState
        title="Database Connection Timeout"
        message="Could not reach PostgreSQL ledger."
        code="DB_TIMEOUT"
        onRetry={onRetry}
        id="error-test"
      />
    );

    expect(screen.getByText('Database Connection Timeout')).toBeInTheDocument();
    expect(screen.getByText('Could not reach PostgreSQL ledger.')).toBeInTheDocument();
    expect(screen.getByText(/Code: DB_TIMEOUT/i)).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders Dialog modal and handles close and Escape key', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Dialog isOpen={true} onClose={onClose} title="Approve Recommendation" id="modal-test">
        <p>Confirm purchase order creation?</p>
      </Dialog>
    );

    expect(screen.getByText('Approve Recommendation')).toBeInTheDocument();
    expect(screen.getByText('Confirm purchase order creation?')).toBeInTheDocument();

    // Close button click
    const closeBtn = screen.getByRole('button', { name: /close dialog/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Escape key press
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    // When closed, renders nothing
    rerender(
      <Dialog isOpen={false} onClose={onClose} title="Approve Recommendation" id="modal-test">
        <p>Confirm purchase order creation?</p>
      </Dialog>
    );
    expect(screen.queryByText('Approve Recommendation')).not.toBeInTheDocument();
  });
});
