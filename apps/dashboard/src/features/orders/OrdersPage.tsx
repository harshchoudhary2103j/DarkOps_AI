import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingBag,
  Package,
  RefreshCw,
  Search,
  Store as StoreIcon,
} from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api-client';
import { queryKeys } from '../../lib/query-client';
import { Order } from '../../types/domain';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge, getStatusBadgeVariant } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/feedback/ToastProvider';
import { formatDate } from '../../lib/formatters';
import {
  getRealisticProductName,
  getRealisticUnitPrice,
  getOrderDisplayName,
  getStoreSubdivision,
} from '../../lib/catalog-helper';

interface OrdersPageProps {
  selectedStoreId?: string;
}

export const OrdersPage: React.FC<OrdersPageProps> = ({ selectedStoreId }) => {
  const queryClient = useQueryClient();
  const { showSuccess, showError, showWarning } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Modals
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('Customer requested cancellation');

  // Fetch Stores for human-readable dark store name resolution
  const { data: storesData } = useQuery({
    queryKey: queryKeys.stores,
    queryFn: () => apiClient.listStores(),
  });
  const stores = storesData?.data || [];
  const storeMap = useMemo(() => {
    const map = new Map<string, any>();
    stores.forEach((s) => map.set(s.id, s));
    return map;
  }, [stores]);

  // 1. Fetch Orders
  const {
    data: ordersData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: queryKeys.orders({
      store_id: selectedStoreId || undefined,
      status: statusFilter || undefined,
    }),
    queryFn: () =>
      apiClient.listOrders({
        store_id: selectedStoreId || undefined,
        status: statusFilter || undefined,
        limit: 50,
      }),
  });

  // 2. Fetch Selected Order Detail
  const { data: orderDetailData, isLoading: isDetailLoading } = useQuery({
    queryKey: queryKeys.order(selectedOrder?.id || ''),
    queryFn: () => apiClient.getOrder(selectedOrder!.id),
    enabled: Boolean(selectedOrder),
  });

  // Allocate Order Mutation
  const allocateMutation = useMutation({
    mutationFn: (orderId: string) => apiClient.allocateOrder(orderId),
    onSuccess: (resp) => {
      showSuccess('Order Allocated', `Order ${resp.data.id.slice(0, 8)} successfully allocated to dark store stock.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.orders() });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory() });
      if (selectedOrder) {
        setSelectedOrder(resp.data);
      }
    },
    onError: (err: ApiError) => {
      showError('Allocation Failed', err.message || 'Cannot allocate stock for this order.');
    },
  });

  // Cancel Order Mutation
  const cancelMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      apiClient.cancelOrder(orderId, reason),
    onSuccess: (resp) => {
      showWarning('Order Cancelled', `Order ${resp.data.id.slice(0, 8)} was cancelled.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.orders() });
      setIsCancelOpen(false);
      if (selectedOrder) {
        setSelectedOrder(resp.data);
      }
    },
    onError: (err: ApiError) => {
      showError('Cancellation Failed', err.message || 'Could not cancel order.');
    },
  });

  const orders = ordersData?.data || [];
  const detailedOrder = orderDetailData?.data || selectedOrder;

  // Filter client-side by search
  const filteredOrders = orders.filter((o) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      o.id.toLowerCase().includes(term) ||
      (o.customer_id || '').toLowerCase().includes(term) ||
      (o.delivery_address || '').toLowerCase().includes(term)
    );
  });

  const columns: Column<Order>[] = [
    {
      key: 'id',
      header: 'Order Reference & Customer',
      render: (item) => {
        const orderInfo = getOrderDisplayName(item);
        return (
          <div>
            <div className="font-semibold text-white text-xs flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>{orderInfo.name}</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
              <span className="text-cyan-300 font-bold">{orderInfo.orderCode}</span>
              <span>&bull;</span>
              <span>{orderInfo.customerName}</span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'store_id',
      header: 'Assigned Dark Store',
      render: (item) => {
        const store = storeMap.get(item.store_id);
        const storeName = item.store_name || store?.name || 'Awaiting Allocation';
        const subdivision = getStoreSubdivision(item.store_id, storeName);
        return (
          <div>
            <div className="text-xs text-slate-200 font-semibold flex items-center gap-1.5">
              <StoreIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{storeName}</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
              <span className="text-cyan-300/80">{subdivision}</span>
              {item.store_id && (
                <>
                  <span>&bull;</span>
                  <span className="text-slate-500">{item.store_id}</span>
                </>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Lifecycle State',
      align: 'center',
      render: (item) => (
        <Badge variant={getStatusBadgeVariant(item.status)} size="sm" dot>
          {item.status}
        </Badge>
      ),
    },
    {
      key: 'line_count',
      header: 'Basket Items',
      align: 'center',
      render: (item) => (
        <span className="font-mono text-slate-300 text-xs">
          {item.line_count || (item.lines ? item.lines.length : 1)} lines
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Placed At',
      render: (item) => <span className="text-slate-400 text-[11px]">{formatDate(item.created_at)}</span>,
    },
    {
      key: 'actions',
      header: 'Operational Actions',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          {item.status === 'PENDING' && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => allocateMutation.mutate(item.id)}
              isLoading={allocateMutation.isPending}
              className="text-xs h-7 px-2.5"
              id={`btn-allocate-${item.id}`}
            >
              Allocate
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectedOrder(item)}
            className="text-xs h-7 px-2.5"
            id={`btn-inspect-order-${item.id}`}
          >
            Inspect
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Title & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-cyan-400" />
            Order Operations & Fulfillment Lifecycle
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Supervise end-to-end customer order state machine, stock allocation reserves, and warehouse picking tasks.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="input-orders-search"
              placeholder="Search Order ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-navy-900 border border-navy-750 text-xs rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 w-44"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center bg-navy-900 border border-navy-750 p-0.5 rounded-xl text-xs">
            {['', 'PENDING', 'ALLOCATED', 'PICKING', 'DELIVERED'].map((st) => (
              <button
                key={st || 'all'}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  statusFilter === st ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {st ? st : 'All Orders'}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            aria-label="Refresh orders"
            id="btn-refresh-orders"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Main Orders DataTable */}
      <DataTable
        columns={columns}
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        isLoading={isLoading}
        emptyTitle="No orders found"
        emptyDescription="There are no customer orders matching the filter criteria."
        id="table-orders"
      />

      {/* Detailed Order Inspector Dialog */}
      {selectedOrder && (
        <Dialog
          isOpen={Boolean(selectedOrder)}
          onClose={() => setSelectedOrder(null)}
          maxWidth="xl"
          title={
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-cyan-400" />
              <span>Order Details &bull; {selectedOrder.id}</span>
            </div>
          }
          description={`Created on ${formatDate(selectedOrder.created_at)}`}
          id="dialog-order-details"
          footer={
            <div className="flex items-center justify-between w-full">
              <div>
                {selectedOrder.status !== 'CANCELLED' && selectedOrder.status !== 'DELIVERED' && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setIsCancelOpen(true)}
                    id="btn-open-cancel"
                  >
                    Cancel Order
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedOrder.status === 'PENDING' && (
                  <Button
                    size="sm"
                    variant="primary"
                    isLoading={allocateMutation.isPending}
                    onClick={() => allocateMutation.mutate(selectedOrder.id)}
                    id="btn-dialog-allocate"
                  >
                    Allocate to Dark Store
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => setSelectedOrder(null)}>
                  Close
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-5">
            {/* Status Header Badge */}
            <div className="p-3 bg-navy-950/60 border border-navy-750 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 block">Current Status</span>
                <span className="text-sm font-bold text-white tracking-wide">
                  {selectedOrder.status}
                </span>
              </div>
              <Badge variant={getStatusBadgeVariant(selectedOrder.status)} size="md" dot>
                {selectedOrder.status}
              </Badge>
            </div>

            {/* Line Items Table */}
            <div>
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Basket Line Items ({detailedOrder?.lines?.length || 0})
              </h4>
              <div className="border border-navy-750 rounded-xl overflow-hidden bg-navy-950/40">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-navy-900 border-b border-navy-750 text-slate-400">
                      <th className="px-3.5 py-2.5">SKU</th>
                      <th className="px-3.5 py-2.5">Product Name</th>
                      <th className="px-3.5 py-2.5 text-right">Quantity</th>
                      <th className="px-3.5 py-2.5 text-right">Unit Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-800">
                    {detailedOrder?.lines && detailedOrder.lines.length > 0 ? (
                      detailedOrder.lines.map((l) => {
                        const qty = l.requested_quantity ?? l.quantity ?? l.reserved_quantity ?? 1;
                        const rawSku = l.sku_code || l.sku_id;
                        const displayName = getRealisticProductName(rawSku, l.product_name);
                        const unitPrice = getRealisticUnitPrice(rawSku, l.unit_price ?? l.price);

                        return (
                          <tr key={l.id}>
                            <td className="px-3.5 py-2 font-mono text-cyan-300">{rawSku}</td>
                            <td className="px-3.5 py-2 text-slate-300 font-medium">{displayName}</td>
                            <td className="px-3.5 py-2 text-right font-mono font-bold text-white">{qty}</td>
                            <td className="px-3.5 py-2 text-right font-mono text-slate-300">
                              ${unitPrice.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-500">
                          {isDetailLoading ? 'Loading order lines...' : 'No basket line details available.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Lifecycle Event History Timeline */}
            <div>
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                State Transition Audit History
              </h4>
              <div className="border border-navy-750 rounded-xl p-3 bg-navy-950/40 space-y-2.5">
                {detailedOrder?.events && detailedOrder.events.length > 0 ? (
                  detailedOrder.events.map((ev, i) => (
                    <div key={ev.id || i} className="flex items-start gap-2.5 text-xs">
                      <div className="w-2 h-2 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                      <div className="flex-1">
                        <span className="font-semibold text-white">{ev.status}</span>
                        {ev.notes && <span className="text-slate-400 ml-1.5">— {ev.notes}</span>}
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {formatDate(ev.created_at)} {ev.actor_id ? `by ${ev.actor_id}` : ''}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-slate-500 text-xs py-2">
                    {isDetailLoading ? 'Loading event timeline...' : 'Order created.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* Cancel Reason Dialog */}
      {selectedOrder && (
        <Dialog
          isOpen={isCancelOpen}
          onClose={() => setIsCancelOpen(false)}
          title="Cancel Order"
          description={`Confirm cancellation of order ${selectedOrder.id}`}
          id="dialog-cancel-order"
          footer={
            <>
              <Button size="sm" variant="outline" onClick={() => setIsCancelOpen(false)}>
                Back
              </Button>
              <Button
                size="sm"
                variant="danger"
                isLoading={cancelMutation.isPending}
                onClick={() =>
                  cancelMutation.mutate({ orderId: selectedOrder.id, reason: cancelReason })
                }
                id="btn-confirm-cancel-order"
              >
                Confirm Cancellation
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-300 block">Cancellation Reason:</label>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full bg-navy-950 border border-navy-750 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-rose-400"
            />
          </div>
        </Dialog>
      )}
    </div>
  );
};
