import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Store as StoreIcon,
  ShoppingBag,
  Clock,
  Truck,
  AlertTriangle,
  ArrowRight,
  Layers,
  Activity,
} from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { queryKeys } from '../../lib/query-client';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge, getStatusBadgeVariant } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { formatNumber, formatDate } from '../../lib/formatters';
import {
  getRealisticProductName,
  getOrderDisplayName,
  getCleanStoreName,
  getStoreSubdivision,
} from '../../lib/catalog-helper';

interface OverviewPageProps {
  selectedStoreId?: string;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({ selectedStoreId }) => {
  // 1. Fetch Stores
  const {
    data: storesData,
    isLoading: isStoresLoading,
    error: storesError,
  } = useQuery({
    queryKey: queryKeys.stores,
    queryFn: () => apiClient.listStores(),
  });

  // 2. Fetch Orders
  const {
    data: ordersData,
    isLoading: isOrdersLoading,
    error: ordersError,
  } = useQuery({
    queryKey: queryKeys.orders({ store_id: selectedStoreId || undefined }),
    queryFn: () => apiClient.listOrders({ store_id: selectedStoreId || undefined, limit: 100 }),
  });

  // 3. Fetch Inventory Positions (low stock only)
  const {
    data: lowStockData,
    isLoading: isLowStockLoading,
    error: lowStockError,
  } = useQuery({
    queryKey: queryKeys.inventory({ store_id: selectedStoreId || undefined, low_stock_only: true }),
    queryFn: () => apiClient.listInventory({ store_id: selectedStoreId || undefined, low_stock_only: true, limit: 20 }),
  });

  // 4. Fetch Pending Recommendations
  const {
    data: recsData,
    isLoading: isRecsLoading,
    error: recsError,
  } = useQuery({
    queryKey: queryKeys.recommendations({ store_id: selectedStoreId || undefined, status: 'PENDING' }),
    queryFn: () => apiClient.listRecommendations({ store_id: selectedStoreId || undefined, status: 'PENDING', limit: 20 }),
  });

  // 5. Fetch Recent Movements (Operational Feed)
  const { data: movementsData } = useQuery({
    queryKey: queryKeys.movements(selectedStoreId || undefined),
    queryFn: () => apiClient.listMovements(selectedStoreId || undefined),
  });

  const rawStores = storesData?.data || [];
  const stores = useMemo(() => {
    return rawStores.filter((s) => !s.id.includes('concur') && !s.name.includes('Race Test'));
  }, [rawStores]);

  const orders = ordersData?.data || [];
  const lowStockItems = lowStockData?.data || [];
  const pendingRecs = recsData?.data || [];
  const recentMovements = movementsData?.data || [];

  const storeMap = useMemo(() => {
    const map = new Map<string, any>();
    stores.forEach((s) => map.set(s.id, s));
    return map;
  }, [stores]);

  // Authoritative Derived Aggregates
  const activeStoresCount = stores.filter((s) => s.status === 'ACTIVE').length;
  const pendingOrdersCount = orders.filter((o) => o.status === 'PENDING').length;
  const pickingOrdersCount = orders.filter((o) => o.status === 'PICKING' || o.status === 'ALLOCATED').length;
  const totalOrdersCount = orders.length;

  const anyError = storesError || ordersError || lowStockError || recsError;

  return (
    <div className="space-y-6">
      {/* Page Title & Operational Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            Operations Control Tower
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time multi-store monitoring, picking workload telemetry, and inventory risk supervision.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/replenishment"
            className="text-xs bg-navy-800 hover:bg-navy-750 text-cyan-300 border border-navy-700/80 px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5"
          >
            Review Recommendations ({pendingRecs.length})
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {anyError && (
        <ErrorState
          title="Backend Operational Error"
          message={(anyError as any)?.message || 'Failed to fetch some operational datasets.'}
          code={(anyError as any)?.code}
        />
      )}

      {/* Summary KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* 1. Active Dark Stores */}
        <Card className="border-navy-750 bg-navy-900/90">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Active Stores</span>
              <StoreIcon className="w-4 h-4 text-emerald-400" />
            </div>
            {isStoresLoading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <div className="text-2xl font-bold text-white font-mono">{activeStoresCount}</div>
            )}
            <div className="text-[10px] text-slate-400 mt-1">of {stores.length} total stores</div>
          </CardContent>
        </Card>

        {/* 2. Total Orders */}
        <Card className="border-navy-750 bg-navy-900/90">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Active Orders</span>
              <ShoppingBag className="w-4 h-4 text-blue-400" />
            </div>
            {isOrdersLoading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <div className="text-2xl font-bold text-white font-mono">{totalOrdersCount}</div>
            )}
            <div className="text-[10px] text-slate-400 mt-1">Current batch volume</div>
          </CardContent>
        </Card>

        {/* 3. Awaiting Allocation */}
        <Card className="border-navy-750 bg-navy-900/90">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Unallocated</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            {isOrdersLoading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <div className="text-2xl font-bold text-amber-400 font-mono">{pendingOrdersCount}</div>
            )}
            <div className="text-[10px] text-slate-400 mt-1">Pending store assignment</div>
          </CardContent>
        </Card>

        {/* 4. Active Picking */}
        <Card className="border-navy-750 bg-navy-900/90">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">In Picking</span>
              <Activity className="w-4 h-4 text-cyan-400" />
            </div>
            {isOrdersLoading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <div className="text-2xl font-bold text-cyan-300 font-mono">{pickingOrdersCount}</div>
            )}
            <div className="text-[10px] text-slate-400 mt-1">On warehouse floor</div>
          </CardContent>
        </Card>

        {/* 5. Stockout Alerts */}
        <Card className="border-navy-750 bg-navy-900/90">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Stockout Risks</span>
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            </div>
            {isLowStockLoading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <div className="text-2xl font-bold text-rose-400 font-mono">{lowStockItems.length}</div>
            )}
            <div className="text-[10px] text-slate-400 mt-1">Below safety stock threshold</div>
          </CardContent>
        </Card>

        {/* 6. Pending Replenishments */}
        <Card className="border-navy-750 bg-navy-900/90">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Pending POs</span>
              <Truck className="w-4 h-4 text-purple-400" />
            </div>
            {isRecsLoading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <div className="text-2xl font-bold text-purple-300 font-mono">{pendingRecs.length}</div>
            )}
            <div className="text-[10px] text-slate-400 mt-1">Awaiting manager approval</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Backlog Table + Stores Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 cols: Active Order Backlog */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader
              title="Active Order & Picking Backlog"
              description="Authoritative order lifecycle states from Operational API"
              icon={<ShoppingBag className="w-4 h-4" />}
              action={
                <Link
                  to="/orders"
                  className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 font-medium"
                >
                  View All Orders <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              }
            />
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-navy-950/60 border-b border-navy-750 text-slate-400">
                      <th className="px-4 py-3 font-semibold">Order & Basket Details</th>
                      <th className="px-4 py-3 font-semibold">Assigned Dark Store</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Placed At</th>
                      <th className="px-4 py-3 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-750/50">
                    {isOrdersLoading ? (
                      <tr>
                        <td colSpan={5} className="p-4">
                          <Skeleton className="h-8 w-full" count={4} />
                        </td>
                      </tr>
                    ) : orders.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500">
                          No active orders in system
                        </td>
                      </tr>
                    ) : (
                      orders.slice(0, 6).map((order) => {
                        const orderInfo = getOrderDisplayName(order);
                        const store = storeMap.get(order.store_id);
                        const storeFullName = order.store_name || store?.name || 'Awaiting Allocation';
                        const cleanStore = getCleanStoreName(storeFullName, order.store_id);
                        const subdivision = getStoreSubdivision(order.store_id, storeFullName);

                        return (
                          <tr key={order.id} className="hover:bg-navy-800/40 transition-colors">
                            {/* 1. Order Name & ID Breakdown */}
                            <td className="px-4 py-3">
                              <div className="font-semibold text-white text-xs flex items-center gap-1.5">
                                <ShoppingBag className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                <span>{orderInfo.name}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
                                <span className="text-cyan-300 font-bold">{orderInfo.orderCode}</span>
                                <span>&bull;</span>
                                <span>{orderInfo.customerName}</span>
                                <span>&bull;</span>
                                <span className="text-slate-300">{orderInfo.itemSummary}</span>
                              </div>
                            </td>

                            {/* 2. Store Name & ID Breakdown */}
                            <td className="px-4 py-3">
                              <div className="text-xs text-slate-200 font-medium flex items-center gap-1.5">
                                <StoreIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span className="font-semibold">{cleanStore}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
                                <span className="text-cyan-300/90">{subdivision}</span>
                                {order.store_id && (
                                  <>
                                    <span>&bull;</span>
                                    <span className="text-slate-500">{order.store_id}</span>
                                  </>
                                )}
                              </div>
                            </td>

                            {/* 3. Lifecycle Status */}
                            <td className="px-4 py-3">
                              <Badge variant={getStatusBadgeVariant(order.status)} size="sm" dot>
                                {order.status}
                              </Badge>
                            </td>

                            {/* 4. Timestamp */}
                            <td className="px-4 py-3 text-slate-400">{formatDate(order.created_at)}</td>

                            {/* 5. Action */}
                            <td className="px-4 py-3 text-right">
                              <Link
                                to={`/orders?search=${order.id}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-navy-800 hover:bg-navy-750 text-cyan-300 border border-navy-700/80 transition-colors"
                              >
                                Inspect
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Low Stock Exception Panel */}
          <Card>
            <CardHeader
              title="Inventory Risk & Stockout Warnings"
              description="SKUs where on-hand quantity is below designated safety-stock threshold"
              icon={<AlertTriangle className="w-4 h-4 text-rose-400" />}
              action={
                <Link
                  to={selectedStoreId ? `/inventory?storeId=${selectedStoreId}` : '/inventory'}
                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium"
                >
                  Manage Inventory <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              }
            />
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-navy-950/60 border-b border-navy-750 text-slate-400">
                      <th className="px-4 py-3 font-semibold">SKU Code</th>
                      <th className="px-4 py-3 font-semibold">Product</th>
                      <th className="px-4 py-3 font-semibold text-right">Available</th>
                      <th className="px-4 py-3 font-semibold text-right">Min Buffer</th>
                      <th className="px-4 py-3 font-semibold text-center">Deficit</th>
                      <th className="px-4 py-3 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-750/50">
                    {isLowStockLoading ? (
                      <tr>
                        <td colSpan={6} className="p-4">
                          <Skeleton className="h-8 w-full" count={3} />
                        </td>
                      </tr>
                    ) : lowStockItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-emerald-400 font-medium">
                          All store inventories are operating within safe stock buffers.
                        </td>
                      </tr>
                    ) : (
                      lowStockItems.slice(0, 5).map((item, idx) => {
                        const avail = item.available_stock ?? item.available ?? item.physical_on_hand ?? 0;
                        const minBuffer = item.safety_stock ?? item.min_threshold ?? 10;
                        const deficit = Math.max(0, minBuffer - avail);
                        const productName = getRealisticProductName(item.sku_code || item.sku_id, item.product_name);
                        return (
                          <tr key={`${item.store_id}-${item.sku_id}-${idx}`} className="hover:bg-navy-800/40">
                            <td className="px-4 py-3 font-mono text-slate-200">
                              <Link
                                to={`/inventory?storeId=${item.store_id}&search=${item.sku_code || item.sku_id}`}
                                className="hover:text-cyan-400 underline underline-offset-2"
                                title="View in Inventory Ledger"
                              >
                                {item.sku_code || item.sku_id}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-slate-300 font-medium">{productName}</td>
                            <td className="px-4 py-3 text-right font-mono text-rose-400 font-bold">
                              {formatNumber(avail)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-slate-400">
                              {formatNumber(minBuffer)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge variant="rose" size="sm">
                                -{formatNumber(deficit)} units
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link
                                to={`/replenishment?targetSkuId=${item.sku_id}&targetStoreId=${item.store_id}&targetSkuCode=${item.sku_code || ''}&targetName=${encodeURIComponent(productName)}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-colors shadow-sm"
                                id={`btn-overview-refuel-${item.sku_id}`}
                              >
                                Refuel <ArrowRight className="w-3 h-3" />
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right 1 col: Store Operations & Activity Stream */}
        <div className="space-y-6">
          {/* Store Network Workload */}
          <Card>
            <CardHeader
              title="Dark Store Workloads"
              description="Current store picker queues & statuses"
              icon={<StoreIcon className="w-4 h-4 text-cyan-400" />}
              action={
                <Link
                  to="/network"
                  className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 font-medium"
                >
                  View Map <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              }
            />
            <CardContent className="p-0">
              <div className="divide-y divide-navy-750/50">
                {isStoresLoading ? (
                  <div className="p-4">
                    <Skeleton className="h-10 w-full" count={3} />
                  </div>
                ) : stores.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs">No stores registered</div>
                ) : (
                  stores.map((s) => {
                    const storeQueueCount = orders.filter(
                      (o) => o.store_id === s.id && (o.status === 'ALLOCATED' || o.status === 'PICKING' || o.status === 'PENDING')
                    ).length;
                    const subdivision = getStoreSubdivision(s.id, s.name);
                    const cleanName = getCleanStoreName(s.name, s.id);

                    return (
                      <div key={s.id} className="p-3.5 flex items-center justify-between hover:bg-navy-800/30 transition-colors">
                        <div>
                          <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                            <StoreIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>{cleanName}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
                            <span className="text-cyan-300/80">{subdivision}</span>
                            <span>&bull;</span>
                            <span className="text-slate-500">{s.id}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={getStatusBadgeVariant(s.status)} size="sm">
                            {s.status}
                          </Badge>
                          <Link
                            to={`/orders?storeId=${s.id}`}
                            className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-colors ${
                              storeQueueCount > 0
                                ? 'text-rose-300 bg-rose-950/40 border-rose-700/60 font-bold hover:bg-rose-900/50'
                                : 'text-slate-400 bg-navy-950 border-navy-750 hover:text-slate-200'
                            }`}
                            title="Inspect store orders"
                          >
                            {storeQueueCount} queue
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Operational Movements Ledger */}
          <Card>
            <CardHeader
              title="Recent Stock Ledger Activity"
              description="Authoritative inventory movements with store allocation"
              icon={<Layers className="w-4 h-4 text-cyan-400" />}
            />
            <CardContent className="p-3.5 space-y-3">
              {recentMovements.length === 0 ? (
                <div className="text-center text-slate-500 text-xs py-4">No recent movements recorded</div>
              ) : (
                recentMovements.slice(0, 5).map((m) => {
                  const store = storeMap.get(m.store_id);
                  const storeFullName = store?.name || m.store_id;
                  const cleanStore = getCleanStoreName(storeFullName, m.store_id);
                  const productName = getRealisticProductName(m.sku_code || m.sku_id, m.product_name);
                  const orderRef = m.reference_id ? getOrderDisplayName({ id: m.reference_id }) : null;

                  return (
                    <div key={m.id} className="text-xs flex items-start justify-between border-b border-navy-800/50 pb-2.5">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200">
                            {m.movement_type === 'RECEIPT' ? (
                              <span className="text-emerald-400">+ Inbound Receipt</span>
                            ) : m.movement_type === 'ALLOCATION' ? (
                              <span className="text-cyan-400">Stock Reserved</span>
                            ) : (
                              <span>{m.movement_type}</span>
                            )}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-navy-800 text-cyan-300/90 border border-navy-700 font-mono">
                            {cleanStore}
                          </span>
                        </div>
                        <div className="text-slate-300 font-medium text-[11px]">
                          {productName}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5">
                          <span>{m.sku_code || m.sku_id}</span>
                          {orderRef && (
                            <>
                              <span>&bull;</span>
                              <span className="text-cyan-400 font-medium">{orderRef.name} ({orderRef.orderCode})</span>
                            </>
                          )}
                          <span>&bull;</span>
                          <span>{formatDate(m.created_at)}</span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-slate-100 bg-navy-950 px-2 py-0.5 rounded border border-navy-750 text-[11px] shrink-0 ml-2">
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </span>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
