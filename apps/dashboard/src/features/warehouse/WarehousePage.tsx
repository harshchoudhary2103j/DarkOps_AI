import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Grid,
  Play,
  CheckCircle,
  HelpCircle,
  ShoppingBag,
} from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api-client';
import { queryKeys } from '../../lib/query-client';
import { Warehouse2DViewer, ShelfProductInfo } from '../../components/visualizers/Warehouse2DViewer';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { useToast } from '../../components/feedback/ToastProvider';
import { PickerRouteResponse, Order } from '../../types/domain';
import { getRealisticProductName, getRealisticUnitPrice } from '../../lib/catalog-helper';

interface ManifestItem {
  id: string;
  sku: string;
  name: string;
  shelf: string;
  qty: number;
  price: number;
}

interface WarehousePageProps {
  selectedStoreId?: string;
}

export const WarehousePage: React.FC<WarehousePageProps> = ({ selectedStoreId }) => {
  const { showSuccess, showError } = useToast();

  // 1. Fetch stores list
  const { data: storesData } = useQuery({
    queryKey: queryKeys.stores,
    queryFn: () => apiClient.listStores(),
  });
  const stores = storesData?.data || [];

  // 2. Fetch Active Orders across the system
  const { data: ordersData } = useQuery({
    queryKey: ['warehouse-orders-list'],
    queryFn: () => apiClient.listOrders({ limit: 50 }),
    refetchInterval: 12000,
  });
  const allOrders: Order[] = ordersData?.data || [];
  const activeOrders = useMemo(() => {
    return allOrders.filter((o) =>
      ['ALLOCATED', 'PICKING', 'READY', 'PENDING', 'CREATED'].includes(o.status as string)
    );
  }, [allOrders]);

  // Order selection state: default to 'ord-manhattan-8921' or first active order
  const [selectedOrderId, setSelectedOrderId] = useState<string>('ord-manhattan-8921');

  // Fetch full details of the selected order
  const { data: orderDetailData, isLoading: isOrderDetailLoading } = useQuery({
    queryKey: ['warehouse-order-detail', selectedOrderId],
    queryFn: () => apiClient.getOrder(selectedOrderId),
    enabled: Boolean(selectedOrderId && selectedOrderId !== 'custom'),
  });
  const activeOrder = orderDetailData?.data;

  // Resolve active store ID: if an order is selected, align with that order's dark store
  const storeIdToUse = useMemo(() => {
    if (selectedOrderId !== 'custom' && activeOrder?.store_id) {
      return activeOrder.store_id;
    }
    return selectedStoreId || stores[0]?.id || 'store-manhattan-demo-02';
  }, [selectedOrderId, activeOrder?.store_id, selectedStoreId, stores]);

  const [selectedShelf, setSelectedShelf] = useState<string | null>(null);
  const [pickBasketsInput, setPickBasketsInput] = useState<string>('');
  const [routeResult, setRouteResult] = useState<PickerRouteResponse | null>(null);

  // 3. Fetch Active Layout for target store
  const {
    data: layoutData,
    isLoading: isLayoutLoading,
    error: layoutError,
    refetch: refetchLayout,
  } = useQuery({
    queryKey: queryKeys.layout(storeIdToUse),
    queryFn: () => apiClient.getActiveLayout(storeIdToUse),
    enabled: Boolean(storeIdToUse),
  });

  const layout = layoutData?.data;
  const layoutNodes: any[] = (layout?.nodes || layout?.layout_data?.nodes || []) as any[];
  const layoutEdges: any[] = (layout?.edges || layout?.layout_data?.edges || []) as any[];
  const shelfNodes = useMemo(() => layoutNodes.filter((n: any) => n.type === 'SHELF'), [layoutNodes]);

  // Build product-to-shelf mapping for the active order
  const shelfProductsMap = useMemo(() => {
    const map = new Map<string, ShelfProductInfo>();
    if (!activeOrder || selectedOrderId === 'custom') return map;

    // Check picking task items first
    const pickingItems = (activeOrder as any).picking_task?.items || [];
    if (pickingItems.length > 0) {
      pickingItems.forEach((item: any) => {
        const shelf = item.shelf_location || '01L-01';
        const cleanShelf = shelf.replace(/^.*SHELF-/, '');
        const name = getRealisticProductName(item.sku_id, item.product_name);
        const qty = item.requested_quantity || 1;
        map.set(shelf, { productName: name, quantity: qty, skuId: item.sku_id, orderId: activeOrder.id });
        map.set(cleanShelf, { productName: name, quantity: qty, skuId: item.sku_id, orderId: activeOrder.id });
      });
      return map;
    }

    // Fallback: map order lines to available shelves in store
    const lines = activeOrder.lines || [];
    lines.forEach((line: any, idx: number) => {
      const assignedShelf = shelfNodes[idx % (shelfNodes.length || 1)];
      const shelfId = assignedShelf?.shelf_id || assignedShelf?.id || `SHELF-01L-0${(idx % 4) + 1}`;
      const cleanShelf = shelfId.replace(/^.*SHELF-/, '');
      const name = getRealisticProductName(line.sku_code || line.sku_id, line.product_name);
      const qty = line.requested_quantity ?? line.quantity ?? line.reserved_quantity ?? 1;
      map.set(shelfId, { productName: name, quantity: qty, skuId: line.sku_id, orderId: activeOrder.id });
      map.set(cleanShelf, { productName: name, quantity: qty, skuId: line.sku_id, orderId: activeOrder.id });
    });

    return map;
  }, [activeOrder, selectedOrderId, shelfNodes]);

  // Sync pickBasketsInput when active order or layout changes
  useEffect(() => {
    if (selectedOrderId !== 'custom' && activeOrder) {
      const orderShelves: string[] = [];
      const pickingItems = (activeOrder as any).picking_task?.items || [];

      if (pickingItems.length > 0) {
        pickingItems.forEach((pi: any) => {
          const s = pi.shelf_location;
          if (s && !orderShelves.includes(s)) orderShelves.push(s);
        });
      } else if (activeOrder.lines && activeOrder.lines.length > 0 && shelfNodes.length > 0) {
        activeOrder.lines.forEach((_: any, idx: number) => {
          const s = shelfNodes[idx % shelfNodes.length];
          const shelfId = s.shelf_id || s.id;
          if (shelfId && !orderShelves.includes(shelfId)) orderShelves.push(shelfId);
        });
      }

      if (orderShelves.length > 0) {
        setPickBasketsInput(orderShelves.join(', '));
      }
    } else if (selectedOrderId === 'custom' && shelfNodes.length > 0 && !pickBasketsInput) {
      const sample = shelfNodes.slice(0, 4).map((n: any) => n.shelf_id || n.id).join(', ');
      setPickBasketsInput(sample);
    }
  }, [selectedOrderId, activeOrder, shelfNodes]);

  // 4. Route Optimization Mutation
  const optimizeMutation = useMutation({
    mutationFn: (payload: {
      layout: any;
      pick_items: any[];
      task_id?: string;
      store_id?: string;
      time_limit_seconds?: number;
      enable_fallback?: boolean;
    }) => apiClient.optimizePickerRoute(payload),
    onSuccess: (resp) => {
      setRouteResult(resp);
      const dist = resp.decisions?.total_distance_meters;
      const baseDist = resp.decisions?.baseline_comparison?.baseline_distance_meters;
      const reduction = resp.decisions?.baseline_comparison?.distance_reduction_percent;

      showSuccess(
        'Picker Route Optimized',
        `Planned ${dist}m path for ${selectedOrderId !== 'custom' ? `Order #${selectedOrderId.slice(0, 8)}` : 'workload'} (vs ${baseDist}m baseline, ${reduction}% saved).`
      );
    },
    onError: (err: ApiError) => {
      showError('Route Optimization Failed', err.message || 'Optimization solver failed.');
    },
  });

  // Handle Run Optimization
  const handleRunOptimizer = () => {
    if (!layout || layoutNodes.length === 0) {
      showError('No Layout', 'Warehouse layout is not yet loaded for this store.');
      return;
    }

    const shelfList = pickBasketsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (shelfList.length === 0) {
      showError('Invalid Stops', 'Specify at least one shelf location to visit.');
      return;
    }

    const pickItems = shelfList.map((sId, i) => {
      const matching = layoutNodes.find((n: any) => n.shelf_id === sId || n.id === sId);
      const prodInfo = shelfProductsMap.get(sId);
      return {
        item_id: `item-${i + 1}`,
        shelf_id: sId,
        shelf_node_id: matching?.id || sId,
        sku_id: prodInfo?.skuId || `SKU-${sId}`,
        quantity: prodInfo?.quantity || 1,
      };
    });

    optimizeMutation.mutate({
      task_id: `task-pick-${selectedOrderId !== 'custom' ? selectedOrderId : Date.now()}`,
      store_id: storeIdToUse,
      layout: {
        nodes: layoutNodes,
        edges: layoutEdges,
      },
      pick_items: pickItems,
      time_limit_seconds: 0.5,
      enable_fallback: true,
    });
  };

  const handleShelfClick = (shelfId: string) => {
    setSelectedShelf(shelfId);
    if (selectedOrderId === 'custom') {
      setPickBasketsInput((prev) => {
        const parts = prev.split(',').map((s) => s.trim()).filter(Boolean);
        if (parts.includes(shelfId)) {
          return prev;
        }
        return parts.length > 0 ? `${prev}, ${shelfId}` : shelfId;
      });
    }
  };

  // Extract order manifest lines for display
  const manifestItems = useMemo<ManifestItem[]>(() => {
    if (!activeOrder || selectedOrderId === 'custom') return [];
    const pickingItems = (activeOrder as any).picking_task?.items || [];
    if (pickingItems.length > 0) {
      return pickingItems.map((pi: any) => ({
        id: pi.id,
        sku: pi.sku_id,
        name: getRealisticProductName(pi.sku_id, pi.product_name),
        shelf: pi.shelf_location || '01L-01',
        qty: pi.requested_quantity || 1,
        price: getRealisticUnitPrice(pi.sku_id),
      }));
    }
    return (activeOrder.lines || []).map((l: any, idx: number) => {
      const s = shelfNodes[idx % (shelfNodes.length || 1)];
      const shelf = s?.shelf_id || s?.id || `01L-0${(idx % 4) + 1}`;
      return {
        id: l.id,
        sku: l.sku_code || l.sku_id,
        name: getRealisticProductName(l.sku_code || l.sku_id, l.product_name),
        shelf,
        qty: l.requested_quantity ?? l.quantity ?? l.reserved_quantity ?? 1,
        price: getRealisticUnitPrice(l.sku_code || l.sku_id, l.unit_price ?? l.price),
      };
    });
  }, [activeOrder, selectedOrderId, shelfNodes]);

  return (
    <div className="space-y-6">
      {/* Title & Hub Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Grid className="w-5 h-5 text-cyan-400" />
            Warehouse 2D Layout & Order Picker Dispatcher
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Authoritative dark store walkable floor plan, shelf product placements, and OR-Tools optimal picking route traversal.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="cyan" size="sm">
            Store: {storeIdToUse}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => refetchLayout()}>
            Reload Layout
          </Button>
        </div>
      </div>

      {layoutError && (
        <ErrorState
          title="Warehouse Layout Unavailable"
          message={`No active warehouse layout is configured for store '${storeIdToUse}'. Run database seeders or select another active store.`}
          code={(layoutError as any)?.code}
        />
      )}

      {/* Main Visualizer and Control Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Left 3 cols: Flagship 2D SVG Viewer */}
        <div className="xl:col-span-3 space-y-4">
          {isLayoutLoading ? (
            <div className="bg-navy-950 border border-navy-750 rounded-2xl p-8 flex items-center justify-center min-h-[520px]">
              <div className="text-center space-y-3">
                <Skeleton className="h-10 w-48 mx-auto" />
                <Skeleton className="h-6 w-32 mx-auto" />
                <p className="text-xs text-slate-500">Loading authoritative warehouse walkable graph...</p>
              </div>
            </div>
          ) : layout ? (
            <Warehouse2DViewer
              layout={layout}
              routeResponse={routeResult}
              selectedShelfId={selectedShelf}
              onSelectShelf={handleShelfClick}
              activeOrder={activeOrder}
              shelfProductsMap={shelfProductsMap}
            />
          ) : (
            <div className="bg-navy-950 border border-dashed border-navy-750 rounded-2xl p-12 text-center text-slate-400 min-h-[520px] flex flex-col items-center justify-center">
              <Grid className="w-10 h-10 text-slate-600 mb-3" />
              <h4 className="text-sm font-semibold text-slate-300">No Active Layout Found</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Ensure layout geometry has been generated for this dark store.
              </p>
            </div>
          )}
        </div>

        {/* Right 1 col: Order Selection & Pick Manifest Panel */}
        <div className="space-y-5">
          {/* Active Order Dispatcher Card */}
          <Card>
            <CardHeader
              title="Order Picker Dispatcher"
              description="Select allocated order to pick"
              icon={<ShoppingBag className="w-4 h-4 text-cyan-400" />}
            />
            <CardContent className="space-y-3.5">
              {/* Order Select Dropdown */}
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1.5 uppercase tracking-wider">
                  Target Customer Order:
                </label>
                <select
                  value={selectedOrderId}
                  onChange={(e) => setSelectedOrderId(e.target.value)}
                  className="w-full bg-navy-950 border border-navy-750 rounded-xl px-3 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-400"
                >
                  {activeOrders.map((ord) => (
                    <option key={ord.id} value={ord.id}>
                      Order #{ord.id.slice(0, 14)} ({ord.status} • {ord.line_count || ord.lines?.length || 1} items)
                    </option>
                  ))}
                  <option value="custom">— Manual / Custom Shelf Selection —</option>
                </select>
              </div>

              {/* Order Manifest & Items Summary */}
              {selectedOrderId !== 'custom' && activeOrder ? (
                <div className="space-y-3">
                  <div className="p-2.5 bg-navy-950/60 border border-navy-750 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] block">Order Status</span>
                      <Badge variant={activeOrder.status === 'ALLOCATED' ? 'cyan' : 'emerald'} size="sm">
                        {activeOrder.status}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 text-[10px] block">Basket Size</span>
                      <span className="text-white font-bold font-mono">
                        {manifestItems.length} products ({manifestItems.reduce((acc, it) => acc + it.qty, 0)} units)
                      </span>
                    </div>
                  </div>

                  {/* Basket Items Shelf List */}
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1.5">
                      Items & Shelf Racks:
                    </span>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {manifestItems.map((item, idx) => {
                        const cleanShelf = item.shelf.replace(/^.*SHELF-/, '');
                        const isCurrentShelf = selectedShelf === item.shelf || selectedShelf === cleanShelf;
                        return (
                          <div
                            key={item.id || idx}
                            onClick={() => setSelectedShelf(cleanShelf)}
                            className={`p-2 rounded-lg border text-xs cursor-pointer transition-colors flex items-center justify-between ${
                              isCurrentShelf
                                ? 'bg-cyan-950/40 border-cyan-500/80 text-white'
                                : 'bg-navy-950/40 border-navy-800 hover:border-navy-700 text-slate-300'
                            }`}
                          >
                            <div className="truncate mr-2">
                              <div className="font-medium text-white truncate text-[11px]">{item.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Qty: <strong className="text-cyan-300">{item.qty}</strong> • ${item.price.toFixed(2)}
                              </div>
                            </div>
                            <Badge variant="cyan" size="sm" className="font-mono shrink-0">
                              Rack {cleanShelf}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : selectedOrderId === 'custom' ? (
                /* Manual Mode Controls */
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Required Pick Shelves:
                    </label>
                    <textarea
                      value={pickBasketsInput}
                      onChange={(e) => setPickBasketsInput(e.target.value)}
                      rows={2}
                      className="w-full bg-navy-950 border border-navy-750 rounded-xl p-2.5 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-400"
                      placeholder="01L-01, 01R-02, 02L-01..."
                    />
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1.5">
                      Preset Baskets:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const sample = shelfNodes.slice(0, 3).map((n: any) => n.shelf_id || n.id).join(', ');
                          setPickBasketsInput(sample || 'SHELF-01L-01, SHELF-01R-02, SHELF-02L-01');
                        }}
                        className="text-[10px] bg-navy-800 hover:bg-navy-750 px-2 py-1 rounded text-slate-300 border border-navy-700"
                      >
                        Short (3)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const sample = shelfNodes.slice(0, 5).map((n: any) => n.shelf_id || n.id).join(', ');
                          setPickBasketsInput(sample || 'SHELF-01L-01, SHELF-01R-02, SHELF-02L-02, SHELF-02R-03, SHELF-03L-01');
                        }}
                        className="text-[10px] bg-navy-800 hover:bg-navy-750 px-2 py-1 rounded text-slate-300 border border-navy-700"
                      >
                        Medium (5)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const sample = shelfNodes.slice(0, 7).map((n: any) => n.shelf_id || n.id).join(', ');
                          setPickBasketsInput(sample || 'SHELF-01L-01, SHELF-01R-02, SHELF-02L-02, SHELF-02R-03, SHELF-03L-01, SHELF-03R-02, SHELF-03L-04');
                        }}
                        className="text-[10px] bg-navy-800 hover:bg-navy-750 px-2 py-1 rounded text-slate-300 border border-navy-700"
                      >
                        Large (7)
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-xs text-slate-500">
                  {isOrderDetailLoading ? 'Loading order manifest...' : 'Select an order to view manifest'}
                </div>
              )}

              {/* Action Button */}
              <Button
                variant="primary"
                onClick={handleRunOptimizer}
                isLoading={optimizeMutation.isPending}
                className="w-full mt-2"
                id="btn-run-picker-optimizer"
                leftIcon={<Play className="w-3.5 h-3.5" />}
              >
                {selectedOrderId !== 'custom'
                  ? `Compute Optimal Picker Route for #${selectedOrderId.slice(0, 10)}`
                  : 'Compute Optimal Picker Route'}
              </Button>
            </CardContent>
          </Card>

          {/* Mathematical Invariants Card */}
          <Card>
            <CardHeader
              title="Mathematical Invariants"
              description="Phase 08 Solver Specifications"
              icon={<HelpCircle className="w-4 h-4 text-purple-400" />}
            />
            <CardContent className="text-xs text-slate-300 space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <span>Zero straight-line wall jumps; continuous walkable aisle paths only.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <span>All routes strictly start and return to Depot Dispatch Station.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <span>OR-Tools TSP sequence minimization with sub-5ms solver speed.</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
