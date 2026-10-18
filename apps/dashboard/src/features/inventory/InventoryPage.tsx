import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Boxes,
  Search,
  RefreshCw,
  AlertTriangle,
  History,
  Store as StoreIcon,
  Filter,
  Truck,
} from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { queryKeys } from '../../lib/query-client';
import { InventoryPosition, Store } from '../../types/domain';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatNumber, formatDate } from '../../lib/formatters';
import { getRealisticProductName } from '../../lib/catalog-helper';

interface InventoryPageProps {
  selectedStoreId?: string;
}

export const InventoryPage: React.FC<InventoryPageProps> = ({ selectedStoreId: propStoreId }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL search params take precedence, then prop, then empty (All Stores)
  const urlStoreId = searchParams.get('storeId') || '';
  const initialSearch = searchParams.get('search') || '';

  const [activeStoreId, setActiveStoreId] = useState<string>(urlStoreId || propStoreId || '');
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [groupByStore, setGroupByStore] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<InventoryPosition | null>(null);

  // Sync state if prop changes and no local URL param is set
  useEffect(() => {
    if (propStoreId && !urlStoreId) {
      setActiveStoreId(propStoreId);
    }
  }, [propStoreId, urlStoreId]);

  // Fetch all registered stores for tabs and headers
  const { data: storesData } = useQuery({
    queryKey: queryKeys.stores,
    queryFn: () => apiClient.listStores(),
  });
  const stores: Store[] = storesData?.data || [];

  // Helper map for store metadata
  const storeMap = useMemo(() => {
    const map = new Map<string, Store>();
    for (const s of stores) {
      map.set(s.id, s);
    }
    return map;
  }, [stores]);

  // Fetch Inventory Positions (fetching up to 100 to show complete catalog without fragmentation)
  const {
    data: inventoryData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: queryKeys.inventory({
      store_id: activeStoreId || undefined,
      low_stock_only: lowStockFilter || undefined,
      page,
      limit: 100,
    }),
    queryFn: () =>
      apiClient.listInventory({
        store_id: activeStoreId || undefined,
        low_stock_only: lowStockFilter,
        page,
        limit: 100,
      }),
  });

  // Fetch SKU detail movements when modal opened
  const { data: movementsData, isLoading: isMovementsLoading } = useQuery({
    queryKey: queryKeys.movements(selectedItem?.store_id, selectedItem?.sku_id),
    queryFn: () => apiClient.listMovements(selectedItem?.store_id, selectedItem?.sku_id),
    enabled: Boolean(selectedItem),
  });

  const positions = inventoryData?.data || [];
  const pagination = inventoryData?.pagination;
  const movements = movementsData?.data || [];

  // Filter client-side by search term
  const filteredPositions = useMemo(() => {
    if (!searchTerm.trim()) return positions;
    const term = searchTerm.toLowerCase();
    return positions.filter((p) => {
      const codeMatch = (p.sku_code || p.sku_id).toLowerCase().includes(term);
      const nameMatch = getRealisticProductName(p.sku_code || p.sku_id, p.product_name)
        .toLowerCase()
        .includes(term);
      const storeMatch = (p.store_name || p.store_id || '').toLowerCase().includes(term);
      return codeMatch || nameMatch || storeMatch;
    });
  }, [positions, searchTerm]);

  // Group positions by store_id
  const positionsByStore = useMemo(() => {
    const grouped = new Map<string, InventoryPosition[]>();
    for (const item of filteredPositions) {
      const sId = item.store_id;
      if (!grouped.has(sId)) {
        grouped.set(sId, []);
      }
      grouped.get(sId)!.push(item);
    }
    return grouped;
  }, [filteredPositions]);

  // Select a store tab
  const handleSelectStore = (storeId: string) => {
    setActiveStoreId(storeId);
    setPage(1);
    const newParams = new URLSearchParams(searchParams);
    if (storeId) {
      newParams.set('storeId', storeId);
    } else {
      newParams.delete('storeId');
    }
    setSearchParams(newParams);
  };

  // Navigate to replenishment with exact target metadata
  const handleRefuel = (item: InventoryPosition) => {
    const productName = getRealisticProductName(item.sku_code || item.sku_id, item.product_name);
    const params = new URLSearchParams();
    params.set('targetSkuId', item.sku_id);
    params.set('targetStoreId', item.store_id);
    if (item.sku_code) params.set('targetSkuCode', item.sku_code);
    params.set('targetName', productName);
    navigate(`/replenishment?${params.toString()}`);
  };

  // Base columns definition
  const getColumns = (showStoreColumn = true): Column<InventoryPosition>[] => {
    const cols: Column<InventoryPosition>[] = [
      {
        key: 'sku_code',
        header: 'SKU / Product',
        render: (item) => {
          const productName = getRealisticProductName(item.sku_code || item.sku_id, item.product_name);
          return (
            <div>
              <div className="text-xs font-semibold text-white tracking-tight">{productName}</div>
              <div className="font-mono text-[11px] text-slate-400 mt-0.5">{item.sku_code || item.sku_id}</div>
            </div>
          );
        },
      },
    ];

    if (showStoreColumn) {
      cols.push({
        key: 'store_id',
        header: 'Dark Store Hub',
        render: (item) => {
          const storeInfo = storeMap.get(item.store_id);
          return (
            <div>
              <span className="text-xs text-slate-200 font-medium">
                {storeInfo?.name || item.store_name || item.store_id}
              </span>
              <div className="text-[10px] text-slate-400 font-mono">{item.store_id}</div>
            </div>
          );
        },
      });
    }

    cols.push(
      {
        key: 'on_hand',
        header: 'Physical On-Hand',
        align: 'right',
        render: (item) => (
          <span className="font-mono font-medium text-slate-200">
            {formatNumber(item.physical_on_hand ?? item.on_hand ?? 0)}{' '}
            <span className="text-[10px] text-slate-400">{item.unit_of_measure || 'units'}</span>
          </span>
        ),
      },
      {
        key: 'reserved',
        header: 'Reserved',
        align: 'right',
        render: (item) => (
          <span className="font-mono text-amber-400 font-medium">
            {formatNumber(item.reserved_stock ?? item.reserved ?? 0)}
          </span>
        ),
      },
      {
        key: 'available',
        header: 'Available to Promise (ATP)',
        align: 'right',
        render: (item) => {
          const avail = item.available_stock ?? item.available ?? 0;
          const minThresh = item.safety_stock ?? item.min_threshold ?? 10;
          const isLow = avail < minThresh;
          return (
            <span className={`font-mono font-bold ${isLow ? 'text-rose-400' : 'text-emerald-400'}`}>
              {formatNumber(avail)}
            </span>
          );
        },
      },
      {
        key: 'min_threshold',
        header: 'Safety Target',
        align: 'right',
        render: (item) => (
          <span className="font-mono text-slate-400 text-xs">
            {formatNumber(item.safety_stock ?? item.min_threshold ?? 10)}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Stock Status',
        align: 'center',
        render: (item) => {
          const avail = item.available_stock ?? item.available ?? 0;
          const minThresh = item.safety_stock ?? item.min_threshold ?? 10;
          if (avail <= 0) {
            return (
              <Badge variant="rose" size="sm" dot>
                Stockout
              </Badge>
            );
          }
          if (avail < minThresh) {
            return (
              <Badge variant="amber" size="sm" dot>
                Low Buffer
              </Badge>
            );
          }
          return (
            <Badge variant="emerald" size="sm" dot>
              Healthy
            </Badge>
          );
        },
      },
      {
        key: 'updated_at',
        header: 'Last Reconciled',
        render: (item) => <span className="text-slate-400 text-[11px] font-mono">{formatDate(item.updated_at)}</span>,
      },
      {
        key: 'actions',
        header: 'Action',
        align: 'right',
        render: (item) => {
          const avail = item.available_stock ?? item.available ?? 0;
          const minThresh = item.safety_stock ?? item.min_threshold ?? 10;
          const isLow = avail < minThresh;

          return (
            <div className="flex items-center justify-end gap-1.5">
              {isLow && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => handleRefuel(item)}
                  className="text-xs h-7 px-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 border border-amber-400/40 text-white font-semibold shadow-sm"
                  id={`btn-refuel-${item.sku_id}`}
                  leftIcon={<Truck className="w-3 h-3" />}
                >
                  Refuel
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedItem(item)}
                className="text-xs h-7 px-2.5"
                id={`btn-inspect-${item.sku_id}`}
              >
                Ledger
              </Button>
            </div>
          );
        },
      }
    );

    return cols;
  };

  const activeStoreObj = storeMap.get(activeStoreId);

  return (
    <div className="space-y-6" id="inventory-management-page">
      {/* 1. Page Header */}
      <div className="bg-navy-900 border border-navy-750 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
              <Boxes className="w-4 h-4 text-cyan-400" />
            </div>
            Inventory & Stock Ledger
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Authoritative physical positions, allocation reserves, and append-only stock movement reconciliation grouped
            by individual dark store fulfillment hubs.
          </p>
        </div>

        {/* Global Summary Badge */}
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-xl bg-navy-800 border border-navy-700 text-xs text-slate-300 flex items-center gap-2">
            <StoreIcon className="w-4 h-4 text-cyan-400" />
            <span>
              <strong className="text-white font-mono">{stores.length}</strong> Dark Stores Active
            </span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-navy-800 border border-navy-700 text-xs text-slate-300 flex items-center gap-2">
            <Boxes className="w-4 h-4 text-emerald-400" />
            <span>
              <strong className="text-white font-mono">{positions.length}</strong> Stock Positions
            </span>
          </div>
        </div>
      </div>

      {/* 2. Interactive Store Filter Selector Bar */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
            <StoreIcon className="w-3.5 h-3.5 text-cyan-400" />
            Filter Products by Dark Store:
          </label>
          {activeStoreId && (
            <button
              onClick={() => handleSelectStore('')}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-medium underline"
            >
              Reset to All Stores
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {/* All Stores Tab */}
          <button
            onClick={() => handleSelectStore('')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-2 ${
              !activeStoreId
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-md shadow-cyan-500/10'
                : 'bg-navy-900 border-navy-750 text-slate-300 hover:bg-navy-800 hover:text-white'
            }`}
            id="tab-store-all"
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>All Dark Stores</span>
            <span className="px-1.5 py-0.2 rounded-full bg-navy-950 text-[10px] font-mono font-bold text-slate-400">
              {stores.length}
            </span>
          </button>

          {/* Individual Store Tabs */}
          {stores.map((s) => {
            const isSelected = activeStoreId === s.id;
            // Count positions and low-stock for this store
            const storePositions = positions.filter((p) => p.store_id === s.id);
            const lowCount = storePositions.filter(
              (p) => (p.available_stock ?? p.available ?? 0) < (p.safety_stock ?? p.min_threshold ?? 10)
            ).length;

            return (
              <button
                key={s.id}
                onClick={() => handleSelectStore(s.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-2 ${
                  isSelected
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-md shadow-cyan-500/10'
                    : 'bg-navy-900 border-navy-750 text-slate-300 hover:bg-navy-800 hover:text-white'
                }`}
                id={`tab-store-${s.id}`}
              >
                <StoreIcon className={`w-3.5 h-3.5 ${isSelected ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span>{s.name}</span>
                {storePositions.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-navy-950 text-[10px] font-mono font-bold text-slate-400">
                    {storePositions.length}
                  </span>
                )}
                {lowCount > 0 && (
                  <span
                    className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"
                    title={`${lowCount} items need replenishment`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Filter Controls & Search */}
      <div className="bg-navy-900 border border-navy-750 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search Box */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            id="input-inventory-search"
            placeholder="Search by Product (e.g., Bananas, Milk) or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-navy-950 border border-navy-750 text-xs rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        {/* Action Toggles */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Low Stock Filter */}
          <Button
            size="sm"
            variant={lowStockFilter ? 'danger' : 'outline'}
            onClick={() => setLowStockFilter(!lowStockFilter)}
            leftIcon={<AlertTriangle className="w-3.5 h-3.5" />}
            id="btn-filter-low-stock"
          >
            {lowStockFilter ? 'Showing Low Stock' : 'Filter Low Stock'}
          </Button>

          {/* Group by Store Toggle (shown when viewing All Stores) */}
          {!activeStoreId && (
            <Button
              size="sm"
              variant={groupByStore ? 'primary' : 'outline'}
              onClick={() => setGroupByStore(!groupByStore)}
              leftIcon={<Filter className="w-3.5 h-3.5" />}
              id="btn-toggle-group-store"
            >
              {groupByStore ? 'Grouped by Store' : 'Unified Table'}
            </Button>
          )}

          {/* Refresh Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            aria-label="Refresh inventory table"
            id="btn-refresh-inventory"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* 4. Active Single Store Spotlight Banner (When a specific store is chosen) */}
      {activeStoreId && activeStoreObj && (
        <div className="bg-gradient-to-r from-navy-900 via-navy-850 to-navy-900 border border-cyan-500/30 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center font-bold text-cyan-300">
              <StoreIcon className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">{activeStoreObj.name}</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold uppercase">
                  {activeStoreObj.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                ID: {activeStoreObj.id} &bull; Showing all registered inventory positions for this dark store
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-3 py-1 bg-navy-950 border border-navy-750 rounded-lg text-xs font-mono text-slate-300">
              Products: <strong className="text-white">{filteredPositions.length}</strong>
            </div>
            <div className="px-3 py-1 bg-navy-950 border border-navy-750 rounded-lg text-xs font-mono text-emerald-400">
              Healthy:{' '}
              <strong className="text-emerald-300">
                {
                  filteredPositions.filter(
                    (p) => (p.available_stock ?? p.available ?? 0) >= (p.safety_stock ?? p.min_threshold ?? 10)
                  ).length
                }
              </strong>
            </div>
            <div className="px-3 py-1 bg-navy-950 border border-navy-750 rounded-lg text-xs font-mono text-rose-400">
              Low Stock:{' '}
              <strong className="text-rose-300">
                {
                  filteredPositions.filter(
                    (p) => (p.available_stock ?? p.available ?? 0) < (p.safety_stock ?? p.min_threshold ?? 10)
                  ).length
                }
              </strong>
            </div>
            <Button size="sm" variant="outline" onClick={() => handleSelectStore('')} className="text-xs">
              View All Stores
            </Button>
          </div>
        </div>
      )}

      {/* 5. Main Content: Grouped by Store OR Single Table */}
      {isLoading ? (
        <div className="border border-navy-750 rounded-xl p-6 bg-navy-900 space-y-3">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-10 w-full" count={5} />
        </div>
      ) : filteredPositions.length === 0 ? (
        <div className="border border-navy-750 rounded-xl p-8 bg-navy-900 text-center">
          <Boxes className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-white">No Inventory Positions Found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            No stock positions matched the active store selection or search query.
          </p>
          {(activeStoreId || searchTerm || lowStockFilter) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setActiveStoreId('');
                setSearchTerm('');
                setLowStockFilter(false);
              }}
              className="mt-4 text-xs"
            >
              Reset Filters
            </Button>
          )}
        </div>
      ) : !activeStoreId && groupByStore ? (
        /* Store-Grouped Layout (All Stores) */
        <div className="space-y-6">
          {Array.from(positionsByStore.entries()).map(([storeId, storePositions]) => {
            const storeInfo = storeMap.get(storeId);
            const storeName = storeInfo?.name || storePositions[0]?.store_name || storeId;
            const lowCount = storePositions.filter(
              (p) => (p.available_stock ?? p.available ?? 0) < (p.safety_stock ?? p.min_threshold ?? 10)
            ).length;
            const healthyCount = storePositions.length - lowCount;
            const totalAtp = storePositions.reduce((acc, p) => acc + (p.available_stock ?? p.available ?? 0), 0);

            return (
              <div
                key={storeId}
                className="bg-navy-900 border border-navy-750 rounded-2xl overflow-hidden shadow-sm space-y-0"
              >
                {/* Store Header Card */}
                <div className="p-4 bg-navy-850/80 border-b border-navy-750 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center font-bold text-cyan-300">
                      <StoreIcon className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white tracking-tight">{storeName}</h3>
                        <span className="font-mono text-[10px] text-slate-400">({storeId})</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3">
                        <span>
                          Catalog:{' '}
                          <strong className="text-slate-200 font-mono">{storePositions.length} Products</strong> ({healthyCount} healthy)
                        </span>
                        <span>&bull;</span>
                        <span>
                          Total ATP:{' '}
                          <strong className="text-cyan-300 font-mono">{formatNumber(totalAtp)} units</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Store Status Badges & Quick Action */}
                  <div className="flex items-center gap-2">
                    {lowCount > 0 ? (
                      <Badge variant="amber" size="sm" dot>
                        {lowCount} Refuel Needed
                      </Badge>
                    ) : (
                      <Badge variant="emerald" size="sm" dot>
                        All Healthy
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSelectStore(storeId)}
                      className="text-xs h-7 px-2.5 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/10"
                    >
                      Focus Store
                    </Button>
                  </div>
                </div>

                {/* Store Products Table */}
                <DataTable
                  columns={getColumns(false)}
                  data={storePositions}
                  keyExtractor={(item) => `${item.store_id}-${item.sku_id}`}
                  id={`table-inventory-${storeId}`}
                  className="border-none rounded-none"
                />
              </div>
            );
          })}
        </div>
      ) : (
        /* Single Unified Table (Single Store Selected OR Group by Store Toggled Off) */
        <DataTable
          columns={getColumns(!activeStoreId)}
          data={filteredPositions}
          keyExtractor={(item) => `${item.store_id}-${item.sku_id}`}
          isLoading={isLoading}
          page={page}
          totalPages={pagination?.total_pages || 1}
          onPageChange={setPage}
          emptyTitle="No inventory positions found"
          emptyDescription="No stock positions matched the active store or search filters."
          id="table-inventory"
        />
      )}

      {/* 6. SKU Detail & Movement Ledger Modal Dialog */}
      {selectedItem && (
        <Dialog
          isOpen={Boolean(selectedItem)}
          onClose={() => setSelectedItem(null)}
          maxWidth="lg"
          title={
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-cyan-400" />
              <span>
                Stock Movement Ledger —{' '}
                {getRealisticProductName(selectedItem.sku_code || selectedItem.sku_id, selectedItem.product_name)}
              </span>
            </div>
          }
          description={`SKU: ${selectedItem.sku_code || selectedItem.sku_id} at ${
            storeMap.get(selectedItem.store_id)?.name || selectedItem.store_name || selectedItem.store_id
          }`}
          id="dialog-sku-ledger"
          footer={
            <Button size="sm" variant="secondary" onClick={() => setSelectedItem(null)}>
              Close Ledger
            </Button>
          }
        >
          <div className="space-y-4">
            {/* Position Summary Cards */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-navy-950/60 border border-navy-750 rounded-xl text-center">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Physical On-Hand</div>
                <div className="text-lg font-bold text-white font-mono mt-0.5">
                  {formatNumber(selectedItem.physical_on_hand ?? selectedItem.on_hand ?? 0)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Reserved Units</div>
                <div className="text-lg font-bold text-amber-400 font-mono mt-0.5">
                  {formatNumber(selectedItem.reserved_stock ?? selectedItem.reserved ?? 0)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Available to Promise</div>
                <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
                  {formatNumber(selectedItem.available_stock ?? selectedItem.available ?? 0)}
                </div>
              </div>
            </div>

            {/* Historical Movements List */}
            <div>
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Audit Movement Ledger Entries
              </h4>
              <div className="border border-navy-750 rounded-xl overflow-hidden bg-navy-950/40">
                {isMovementsLoading ? (
                  <div className="p-4">
                    <Skeleton className="h-8 w-full" count={4} />
                  </div>
                ) : movements.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No recorded movement ledger records for this SKU.
                  </div>
                ) : (
                  <div className="divide-y divide-navy-800/60 max-h-64 overflow-y-auto">
                    {movements.map((m) => (
                      <div key={m.id} className="p-3 text-xs flex items-center justify-between hover:bg-navy-900/50">
                        <div>
                          <div className="font-semibold text-slate-200">{m.movement_type}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                            Ref: {m.reference_id || 'manual'} &bull; {formatDate(m.created_at)}
                          </div>
                        </div>
                        <span
                          className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                            m.quantity > 0
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
