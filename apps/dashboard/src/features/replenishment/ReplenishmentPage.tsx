import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Truck,
  Sparkles,
  RefreshCw,
  Target,
  X,
  CheckCircle2,
  Zap,
  ArrowDown,
  Store as StoreIcon,
} from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api-client';
import { queryKeys } from '../../lib/query-client';
import { ReplenishmentRecommendation, Store } from '../../types/domain';
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

export const ReplenishmentPage: React.FC<ReplenishmentPageProps> = ({ selectedStoreId: propStoreId }) => {
  const queryClient = useQueryClient();
  const { showSuccess, showError, showWarning } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Target refuel query parameters (passed from Inventory "Refuel" button)
  const targetSkuId = searchParams.get('targetSkuId') || searchParams.get('skuId') || '';
  const targetStoreId = searchParams.get('targetStoreId') || searchParams.get('storeId') || '';
  const targetSkuCode = searchParams.get('targetSkuCode') || searchParams.get('skuCode') || '';
  const targetName = searchParams.get('targetName') || '';

  // Active store filter (target store from URL takes precedence, then prop)
  const effectiveStoreId = targetStoreId || propStoreId || '';

  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [selectedRec, setSelectedRec] = useState<ReplenishmentRecommendation | null>(null);

  // Modal dialog states
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('Safety buffer adjusted by floor manager');

  // Fetch registered stores
  const { data: storesData } = useQuery({
    queryKey: queryKeys.stores,
    queryFn: () => apiClient.listStores(),
  });
  const stores: Store[] = storesData?.data || [];
  const storeMap = useMemo(() => {
    const map = new Map<string, Store>();
    for (const s of stores) map.set(s.id, s);
    return map;
  }, [stores]);

  // Fetch Recommendations
  const {
    data: recsData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: queryKeys.recommendations({
      store_id: effectiveStoreId || undefined,
      status: statusFilter || undefined,
    }),
    queryFn: () =>
      apiClient.listRecommendations({
        store_id: effectiveStoreId || undefined,
        status: statusFilter || undefined,
        limit: 100,
      }),
  });

  const rawRecommendations = recsData?.data || [];

  // Match target recommendation if targetSkuId is present
  const targetRec = useMemo(() => {
    if (!targetSkuId) return null;
    return (
      rawRecommendations.find(
        (r) => r.sku_id === targetSkuId && (!targetStoreId || r.store_id === targetStoreId)
      ) || null
    );
  }, [rawRecommendations, targetSkuId, targetStoreId]);

  // If a targetSkuId is active, sort recommendations so the target recommendation is pinned at the top!
  const recommendations = useMemo(() => {
    if (!targetRec) return rawRecommendations;
    const others = rawRecommendations.filter((r) => r.id !== targetRec.id);
    return [targetRec, ...others];
  }, [rawRecommendations, targetRec]);

  // Auto-scroll to the target row when mounted or target identified
  useEffect(() => {
    if (targetRec) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`rec-row-${targetRec.id}`);
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [targetRec?.id]);

  // Approve Mutation
  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.approveRecommendation(id),
    onSuccess: (resp) => {
      showSuccess(
        'Recommendation Approved',
        `PO recommendation for ${getRealisticProductName(resp.data.sku_id)} was successfully approved.`
      );
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
        `Received +${resp.data.suggested_quantity} units of ${getRealisticProductName(resp.data.sku_id)}. Physical and ATP positions replenished!`
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

  // Emergency Refuel Mutation (Fast restock)
  const emergencyRestockMutation = useMutation({
    mutationFn: ({ storeId, quantity }: { storeId: string; quantity: number }) =>
      apiClient.emergencySurgeRestock({ store_id: storeId, quantity }),
    onSuccess: () => {
      showSuccess('Emergency Stock Received', 'Inbounded emergency stock buffer to store inventory.');
      queryClient.invalidateQueries({ queryKey: queryKeys.recommendations() });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory() });
    },
    onError: (err: ApiError) => {
      showError('Restock Failed', err.message || 'Could not execute emergency stock inbound.');
    },
  });

  // Clear target refuel parameters
  const handleClearTarget = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('targetSkuId');
    newParams.delete('skuId');
    newParams.delete('targetStoreId');
    newParams.delete('storeId');
    newParams.delete('targetSkuCode');
    newParams.delete('skuCode');
    newParams.delete('targetName');
    setSearchParams(newParams);
  };

  const handleOpenApprove = (rec: ReplenishmentRecommendation) => {
    setSelectedRec(rec);
    setIsApproveOpen(true);
  };

  const handleOpenReject = (rec: ReplenishmentRecommendation) => {
    setSelectedRec(rec);
    setIsRejectOpen(true);
  };

  const handleScrollToTarget = () => {
    if (targetRec) {
      document.getElementById(`rec-row-${targetRec.id}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }
  };

  const columns: Column<ReplenishmentRecommendation>[] = [
    {
      key: 'sku_code',
      header: 'SKU / Product',
      render: (item) => {
        const isTarget = Boolean(targetRec && item.id === targetRec.id);
        const productName = getRealisticProductName(item.sku_code || item.sku_id, item.product_name);
        return (
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white tracking-tight">{productName}</span>
              {isTarget && (
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/25 text-amber-300 border border-amber-400 font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm animate-pulse">
                  <Target className="w-3 h-3 text-amber-300" />
                  Target Item
                </span>
              )}
            </div>
            <div className="font-mono text-[11px] text-slate-400 mt-0.5">{item.sku_code || item.sku_id}</div>
          </div>
        );
      },
    },
    {
      key: 'store_id',
      header: 'Store Hub',
      render: (item) => {
        const storeInfo = storeMap.get(item.store_id);
        return (
          <div>
            <span className="text-xs text-slate-200 font-medium">{storeInfo?.name || item.store_id}</span>
            <div className="font-mono text-[10px] text-slate-400">{item.store_id}</div>
          </div>
        );
      },
    },
    {
      key: 'recommended_quantity',
      header: 'Recommended Order',
      align: 'right',
      render: (item) => {
        const qty = item.recommended_quantity ?? item.suggested_quantity ?? 0;
        return (
          <span className="font-mono font-bold text-cyan-300 text-sm">
            +{formatNumber(qty)} <span className="text-[10px] text-slate-400 font-normal">units</span>
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
        return <span className="font-mono text-slate-300">{formatNumber(onHand)}</span>;
      },
    },
    {
      key: 'safety_stock_deficit',
      header: 'Stock Deficit',
      align: 'right',
      render: (item) => {
        const deficit =
          item.safety_stock_deficit ??
          Math.max(
            0,
            ((item as any).calculation_inputs?.reorder_point || 0) -
              ((item as any).calculation_inputs?.available_stock || 0)
          );
        return <span className="font-mono text-rose-400 font-semibold">-{formatNumber(deficit)}</span>;
      },
    },
    {
      key: 'supplier_id',
      header: 'Supplier & MOQ',
      render: (item) => (
        <div>
          <div className="text-slate-200 text-xs font-medium">
            {item.supplier_name || item.supplier_id || 'Primary Supplier'}
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            MOQ: {item.min_order_quantity ?? 50} &bull; Pack: {item.pack_size ?? 1}
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
        const isTarget = Boolean(targetRec && item.id === targetRec.id);
        if (item.status === 'PENDING') {
          return (
            <div className="flex items-center justify-end gap-1.5">
              <Button
                size="sm"
                variant="primary"
                onClick={() => handleOpenApprove(item)}
                className={`text-xs h-7 px-2.5 ${
                  isTarget
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 border-amber-300 font-bold shadow-md shadow-amber-500/20'
                    : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500/30'
                }`}
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
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Stock Inbounded
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

  const targetStoreObj = storeMap.get(targetStoreId);
  const targetDisplayProduct = targetName || getRealisticProductName(targetSkuCode || targetSkuId);

  return (
    <div className="space-y-6" id="replenishment-page">
      {/* 1. Page Title & Action Header */}
      <div className="bg-navy-900 border border-navy-750 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
              <Truck className="w-4 h-4 text-cyan-400" />
            </div>
            Replenishment Management & PO Approval
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Review demand-aware purchase order recommendations, inspect safety target deficits, and authorize stock
            inbound batches into physical dark store inventory.
          </p>
        </div>

        {/* Global Controls & Generate Button */}
        <div className="flex items-center gap-2.5 flex-wrap">
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

      {/* 2. Target Refuel Control Banner (When navigated from Inventory "Refuel") */}
      {targetSkuId && (
        <div
          className={`border rounded-2xl p-5 shadow-lg transition-all ${
            targetRec
              ? 'bg-gradient-to-r from-navy-900 via-amber-950/20 to-navy-900 border-amber-500/50 shadow-amber-500/10'
              : 'bg-navy-900 border-navy-750'
          }`}
          id="banner-target-refuel"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  targetRec
                    ? 'bg-amber-500/20 border border-amber-400 text-amber-300 shadow-md shadow-amber-500/20 animate-pulse'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                <Target className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Active Refuel Target
                  </span>
                  <h3 className="text-base font-bold text-white tracking-tight">{targetDisplayProduct}</h3>
                  <span className="text-xs font-mono text-slate-400">({targetSkuCode || targetSkuId})</span>
                </div>
                <div className="text-xs text-slate-300 mt-1 flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <StoreIcon className="w-3.5 h-3.5 text-cyan-400" />
                    <strong>{targetStoreObj?.name || targetStoreId || 'Target Dark Store'}</strong>
                  </span>
                  {targetRec ? (
                    <>
                      <span>&bull;</span>
                      <span className="text-cyan-300 font-mono">
                        Recommended PO:{' '}
                        <strong>
                          +{formatNumber(targetRec.recommended_quantity ?? targetRec.suggested_quantity ?? 0)} units
                        </strong>
                      </span>
                      <span>&bull;</span>
                      <span className="text-slate-400">
                        Status:{' '}
                        <Badge variant={getStatusBadgeVariant(targetRec.status)} size="sm">
                          {targetRec.status}
                        </Badge>
                      </span>
                    </>
                  ) : (
                    <span className="text-amber-400 text-xs">
                      &bull; No pending purchase order proposal generated yet for this SKU.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Target Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {targetRec ? (
                <>
                  {targetRec.status === 'PENDING' && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleOpenApprove(targetRec)}
                      className="text-xs bg-amber-500 hover:bg-amber-400 text-navy-950 font-bold border-amber-300 shadow-md shadow-amber-500/25"
                      id="btn-target-approve"
                    >
                      Approve PO (+
                      {formatNumber(targetRec.recommended_quantity ?? targetRec.suggested_quantity ?? 0)} units)
                    </Button>
                  )}
                  {targetRec.status === 'APPROVED' && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => executeMutation.mutate(targetRec.id)}
                      isLoading={executeMutation.isPending}
                      className="text-xs bg-cyan-600 hover:bg-cyan-500 font-bold"
                      id="btn-target-receive"
                    >
                      Inbound & Receive Stock Now
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleScrollToTarget}
                    leftIcon={<ArrowDown className="w-3.5 h-3.5" />}
                    className="text-xs"
                  >
                    View Row in Table
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => generateMutation.mutate(targetStoreId || 'store_nyc_01')}
                    isLoading={generateMutation.isPending}
                    leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                    className="text-xs"
                  >
                    Generate PO Recommendation
                  </Button>
                  {targetStoreId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        emergencyRestockMutation.mutate({ storeId: targetStoreId, quantity: 100 })
                      }
                      isLoading={emergencyRestockMutation.isPending}
                      leftIcon={<Zap className="w-3.5 h-3.5 text-amber-400" />}
                      className="text-xs text-amber-300 border-amber-500/30 hover:bg-amber-500/10"
                    >
                      Emergency Inbound (+100)
                    </Button>
                  )}
                </>
              )}

              <Button
                size="sm"
                variant="outline"
                onClick={handleClearTarget}
                leftIcon={<X className="w-3 h-3" />}
                className="text-xs text-slate-400 hover:text-white"
                id="btn-clear-target"
              >
                Clear Target
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Status Filter Tabs */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center bg-navy-900 border border-navy-750 p-1 rounded-xl text-xs">
          {[
            { id: 'PENDING', label: 'Pending Review' },
            { id: 'APPROVED', label: 'Approved' },
            { id: 'EXECUTED', label: 'Stock Inbounded' },
            { id: 'REJECTED', label: 'Rejected' },
            { id: '', label: 'All Recommendations' },
          ].map((tab) => (
            <button
              key={tab.id || 'all'}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                statusFilter === tab.id
                  ? 'bg-brand-500 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
              id={`filter-status-${tab.id || 'all'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Showing <strong className="text-white">{recommendations.length}</strong> recommendations
          {effectiveStoreId && ` for ${storeMap.get(effectiveStoreId)?.name || effectiveStoreId}`}
        </div>
      </div>

      {/* 4. Main DataTable */}
      <DataTable
        columns={columns}
        data={recommendations}
        keyExtractor={(item) => item.id}
        isLoading={isLoading}
        rowClassName={(item) =>
          targetRec && item.id === targetRec.id
            ? 'bg-amber-500/15 border-l-4 border-amber-400 ring-2 ring-amber-400/40 shadow-xl shadow-amber-500/10'
            : ''
        }
        rowId={(item) => `rec-row-${item.id}`}
        emptyTitle="No replenishment recommendations found"
        emptyDescription={
          targetSkuId
            ? `No recommendations match the filter for target SKU ${targetDisplayProduct}. Click "Generate Inbound POs" to evaluate demand signals.`
            : 'There are no purchase order recommendations matching the current filter.'
        }
        id="table-recommendations"
      />

      {/* 5. Approve Confirmation Modal */}
      {selectedRec && (
        <ConfirmDialog
          isOpen={isApproveOpen}
          onClose={() => setIsApproveOpen(false)}
          onConfirm={() => approveMutation.mutate(selectedRec.id)}
          isLoading={approveMutation.isPending}
          title="Approve Purchase Order Recommendation"
          message={`Are you sure you want to approve ordering ${
            selectedRec.recommended_quantity ?? selectedRec.suggested_quantity ?? 0
          } units of ${getRealisticProductName(
            selectedRec.sku_code || selectedRec.sku_id,
            selectedRec.product_name
          )}? This will transition the recommendation to APPROVED status in the Operational API.`}
          confirmText="Confirm & Authorize Order"
          id="dialog-confirm-approve"
        />
      )}

      {/* 6. Reject Dialog Modal */}
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
            <label className="text-xs font-semibold text-slate-300 block">Rejection Reason & Audit Note:</label>
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

      {/* 7. Generate Recommendations Dialog */}
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
              onClick={() =>
                generateMutation.mutate(targetStoreId || effectiveStoreId || 'store-manhattan-demo-02')
              }
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
            <span className="font-mono text-cyan-300 font-bold">
              {storeMap.get(targetStoreId || effectiveStoreId)?.name ||
                targetStoreId ||
                effectiveStoreId ||
                'All Stores / Default'}
            </span>
            .
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
