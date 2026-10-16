import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Truck,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api-client';
import { queryKeys } from '../../lib/query-client';
import { ReplenishmentRecommendation } from '../../types/domain';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge, getStatusBadgeVariant } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { ConfirmDialog } from '../../components/feedback/ConfirmDialog';
import { useToast } from '../../components/feedback/ToastProvider';
import { formatNumber } from '../../lib/formatters';
import { getRealisticProductName } from '../../lib/catalog-helper';

interface ReplenishmentPageProps {
  selectedStoreId?: string;
}

export const ReplenishmentPage: React.FC<ReplenishmentPageProps> = ({ selectedStoreId }) => {
  const queryClient = useQueryClient();
  const { showSuccess, showError, showWarning } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [selectedRec, setSelectedRec] = useState<ReplenishmentRecommendation | null>(null);

  // Modal dialog states
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('Safety buffer adjusted by floor manager');

  // Fetch Recommendations
  const {
    data: recsData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: queryKeys.recommendations({
      store_id: selectedStoreId || undefined,
      status: statusFilter || undefined,
    }),
    queryFn: () =>
      apiClient.listRecommendations({
        store_id: selectedStoreId || undefined,
        status: statusFilter || undefined,
        limit: 50,
      }),
  });

  // Approve Mutation
  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.approveRecommendation(id),
    onSuccess: (resp) => {
      showSuccess('Recommendation Approved', `PO recommendation for ${resp.data.sku_id} was successfully approved.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.recommendations() });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory() });
      setIsApproveOpen(false);
    },
    onError: (err: ApiError) => {
      showError('Approval Failed', err.message || 'Server rejected approval request.');
    },
  });

  // Execute / Receive Stock Mutation
  const executeMutation = useMutation({
    mutationFn: (id: string) => apiClient.executeRecommendation(id),
    onSuccess: (resp) => {
      showSuccess(
        'Stock Received & Inbounded',
        `Received +${resp.data.suggested_quantity} units of ${resp.data.sku_id}. Physical and ATP positions are now replenished!`
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.recommendations() });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory() });
    },
    onError: (err: ApiError) => {
      showError('Inbound Failed', err.message || 'Failed to receive stock.');
    },
  });

  // Reject Mutation
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.rejectRecommendation(id, reason),
    onSuccess: (resp) => {
      showWarning('Recommendation Rejected', `PO recommendation for ${resp.data.sku_id} was rejected.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.recommendations() });
      setIsRejectOpen(false);
    },
    onError: (err: ApiError) => {
      showError('Rejection Failed', err.message || 'Server rejected request.');
    },
  });

  // Generate Mutation
  const generateMutation = useMutation({
    mutationFn: (storeId: string) => apiClient.generateRecommendations(storeId),
    onSuccess: (resp) => {
      const count = resp.data?.length || 0;
      showSuccess('Recommendations Generated', `Calculated ${count} replenishment recommendations from demand signals.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.recommendations() });
      setIsGenerateOpen(false);
    },
    onError: (err: ApiError) => {
      showError('Generation Failed', err.message || 'Could not generate recommendations.');
    },
  });

  const recommendations = recsData?.data || [];

  const handleOpenApprove = (rec: ReplenishmentRecommendation) => {
    setSelectedRec(rec);
    setIsApproveOpen(true);
  };

  const handleOpenReject = (rec: ReplenishmentRecommendation) => {
    setSelectedRec(rec);
    setIsRejectOpen(true);
  };

  const columns: Column<ReplenishmentRecommendation>[] = [
    {
      key: 'sku_code',
      header: 'SKU / Product',
      render: (item) => (
        <div>
          <div className="font-mono font-semibold text-white text-xs">{item.sku_code || item.sku_id}</div>
          <div className="text-[11px] text-slate-300 truncate max-w-xs font-medium">
            {getRealisticProductName(item.sku_code || item.sku_id, item.product_name)}
          </div>
        </div>
      ),
    },
    {
      key: 'store_id',
      header: 'Store Hub',
      render: (item) => <span className="font-mono text-xs text-slate-300">{item.store_id}</span>,
    },
    {
      key: 'recommended_quantity',
      header: 'Recommended Order',
      align: 'right',
      render: (item) => {
        const qty = item.recommended_quantity ?? item.suggested_quantity ?? 0;
        return (
          <span className="font-mono font-bold text-cyan-300 text-sm">
            {formatNumber(qty)} <span className="text-[10px] text-slate-400 font-normal">units</span>
          </span>
        );
      },
    },
    {
      key: 'current_inventory',
      header: 'Current Stock',
      align: 'right',
      render: (item) => {
        const onHand = item.current_inventory ?? (item as any).calculation_inputs?.physical_on_hand ?? 0;
        return (
          <span className="font-mono text-slate-300">
            {formatNumber(onHand)}
          </span>
        );
      },
    },
    {
      key: 'safety_stock_deficit',
      header: 'Stock Deficit',
      align: 'right',
      render: (item) => {
        const deficit = item.safety_stock_deficit ?? Math.max(0, ((item as any).calculation_inputs?.reorder_point || 0) - ((item as any).calculation_inputs?.available_stock || 0));
        return (
          <span className="font-mono text-rose-400 font-semibold">
            -{formatNumber(deficit)}
          </span>
        );
      },
    },
    {
      key: 'supplier_id',
      header: 'Supplier & MOQ',
      render: (item) => (
        <div>
          <div className="text-slate-200 text-xs font-medium">{item.supplier_name || item.supplier_id || 'Primary Supplier'}</div>
          <div className="text-[10px] text-slate-400 font-mono">
            MOQ: {item.min_order_quantity ?? 1} &bull; Pack: {item.pack_size ?? 1}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (item) => (
        <Badge variant={getStatusBadgeVariant(item.status)} size="sm" dot>
          {item.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Decisions',
      align: 'right',
      render: (item) => {
        if (item.status === 'PENDING') {
          return (
            <div className="flex items-center justify-end gap-1.5">
              <Button
                size="sm"
                variant="primary"
                onClick={() => handleOpenApprove(item)}
                className="text-xs h-7 px-2.5 bg-emerald-600 hover:bg-emerald-500 border-emerald-500/30"
                id={`btn-approve-${item.id}`}
              >
                Approve PO
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => handleOpenReject(item)}
                className="text-xs h-7 px-2"
                id={`btn-reject-${item.id}`}
              >
                Reject
              </Button>
            </div>
          );
        }
        if (item.status === 'APPROVED') {
          return (
            <div className="flex items-center justify-end gap-1.5">
              <Button
                size="sm"
                variant="primary"
                onClick={() => executeMutation.mutate(item.id)}
                isLoading={executeMutation.isPending}
                className="text-xs h-7 px-2.5 bg-cyan-600 hover:bg-cyan-500 border-cyan-500/30 font-semibold"
                id={`btn-receive-${item.id}`}
              >
                Inbound & Receive
              </Button>
            </div>
          );
        }
        if (item.status === 'EXECUTED') {
          return (
            <span className="text-[11px] text-emerald-400 font-medium flex items-center justify-end gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Stock Received
            </span>
          );
        }
        return (
          <span className="text-[11px] text-slate-400 italic">
            {item.decision_by ? `By ${item.decision_by}` : 'Processed'}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Title & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-cyan-400" />
            Replenishment Management & PO Approval
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Review demand-aware replenishment recommendations, enforce supplier pack-sizes, and approve purchase orders.
          </p>
        </div>

        {/* Buttons & Status Filters */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Status Segment Filter */}
          <div className="flex items-center bg-navy-900 border border-navy-750 p-0.5 rounded-xl text-xs">
            {['PENDING', 'APPROVED', 'REJECTED', ''].map((st) => (
              <button
                key={st || 'all'}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  statusFilter === st ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {st ? st : 'All Statuses'}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            variant="primary"
            onClick={() => setIsGenerateOpen(true)}
            leftIcon={<Sparkles className="w-3.5 h-3.5" />}
            id="btn-open-generate-recs"
          >
            Generate Inbound POs
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            aria-label="Refresh recommendations"
            id="btn-refresh-recs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Main DataTable */}
      <DataTable
        columns={columns}
        data={recommendations}
        keyExtractor={(item) => item.id}
        isLoading={isLoading}
        emptyTitle="No replenishment recommendations"
        emptyDescription="There are no purchase order recommendations matching the current filter."
        id="table-recommendations"
      />

      {/* Approve Confirmation Modal */}
      {selectedRec && (
        <ConfirmDialog
          isOpen={isApproveOpen}
          onClose={() => setIsApproveOpen(false)}
          onConfirm={() => approveMutation.mutate(selectedRec.id)}
          isLoading={approveMutation.isPending}
          title="Approve Purchase Order Recommendation"
          message={`Are you sure you want to approve ordering ${selectedRec.recommended_quantity} units of SKU ${selectedRec.sku_code || selectedRec.sku_id}? This will transition the recommendation to APPROVED status in the Operational API.`}
          confirmText="Confirm & Authorize Order"
          id="dialog-confirm-approve"
        />
      )}

      {/* Reject Dialog Modal */}
      {selectedRec && (
        <Dialog
          isOpen={isRejectOpen}
          onClose={() => setIsRejectOpen(false)}
          title="Reject Replenishment Recommendation"
          description={`Provide an operational reason for rejecting recommendation ${selectedRec.id}`}
          id="dialog-reject-rec"
          footer={
            <>
              <Button size="sm" variant="outline" onClick={() => setIsRejectOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="danger"
                isLoading={rejectMutation.isPending}
                onClick={() => rejectMutation.mutate({ id: selectedRec.id, reason: rejectReason })}
                id="btn-confirm-reject"
              >
                Confirm Rejection
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-300 block">
              Rejection Reason & Audit Note:
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full bg-navy-950 border border-navy-750 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              placeholder="e.g., Storage capacity reached, supplier minimum renegotiated, or seasonal variance..."
            />
          </div>
        </Dialog>
      )}

      {/* Generate Recommendations Dialog */}
      <Dialog
        isOpen={isGenerateOpen}
        onClose={() => setIsGenerateOpen(false)}
        title="Generate Replenishment Recommendations"
        description="Trigger deterministic replenishment calculation based on catalog safety stocks, lead times, and current physical balances."
        id="dialog-generate-recs"
        footer={
          <>
            <Button size="sm" variant="outline" onClick={() => setIsGenerateOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              isLoading={generateMutation.isPending}
              onClick={() => generateMutation.mutate(selectedStoreId || 'store_nyc_01')}
              id="btn-trigger-generation"
            >
              Run Policy Evaluation
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs text-slate-300">
          <p>
            The Operational API will evaluate all active catalog SKUs against target dark store{' '}
            <span className="font-mono text-cyan-300 font-bold">{selectedStoreId || 'All Stores / Default'}</span>.
          </p>
          <div className="p-3 bg-navy-950/70 border border-navy-750 rounded-xl space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-400">Target Safety Stock Factor:</span>
              <span className="text-white">1.5x Daily Demand</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Lead Time Buffer:</span>
              <span className="text-white">24 Hours</span>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
