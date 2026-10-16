import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Boxes,
  Search,
  RefreshCw,
  AlertTriangle,
  History,
} from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { queryKeys } from '../../lib/query-client';
import { InventoryPosition } from '../../types/domain';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatNumber, formatDate } from '../../lib/formatters';

interface InventoryPageProps {
  selectedStoreId?: string;
}

export const InventoryPage: React.FC<InventoryPageProps> = ({ selectedStoreId }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<InventoryPosition | null>(null);

  // Fetch Inventory Positions
  const {
    data: inventoryData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: queryKeys.inventory({
      store_id: selectedStoreId || undefined,
      low_stock_only: lowStockFilter || undefined,
      page,
      limit: 25,
    }),
    queryFn: () =>
      apiClient.listInventory({
        store_id: selectedStoreId || undefined,
        low_stock_only: lowStockFilter,
        page,
        limit: 25,
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
    return positions.filter(
      (p) =>
        (p.sku_code || p.sku_id).toLowerCase().includes(term) ||
        (p.product_name || '').toLowerCase().includes(term)
    );
  }, [positions, searchTerm]);

  const columns: Column<InventoryPosition>[] = [
    {
      key: 'sku_code',
      header: 'SKU / Product',
      render: (item) => (
        <div>
          <div className="font-mono font-semibold text-white text-xs">{item.sku_code || item.sku_id}</div>
          <div className="text-[11px] text-slate-400 truncate max-w-xs">{item.product_name || 'Standard SKU'}</div>
        </div>
      ),
    },
    {
      key: 'store_id',
      header: 'Store Hub',
      render: (item) => (
        <span className="text-xs text-slate-300 font-mono">
          {item.store_name || item.store_id}
        </span>
      ),
    },
    {
      key: 'on_hand',
      header: 'Physical On-Hand',
      align: 'right',
      render: (item) => (
        <span className="font-mono font-medium text-slate-200">
          {formatNumber(item.physical_on_hand ?? item.on_hand ?? 0)} <span className="text-[10px] text-slate-400">{item.unit_of_measure || 'units'}</span>
        </span>
      ),
    },
    {
      key: 'reserved',
      header: 'Reserved',
      align: 'right',
      render: (item) => (
        <span className="font-mono text-amber-400">
          {formatNumber(item.reserved_stock ?? item.reserved ?? 0)}
        </span>
      ),
    },
    {
      key: 'available',
      header: 'Available to Promise',
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
          {formatNumber(item.safety_stock ?? item.min_threshold ?? 0)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Risk Classification',
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
      render: (item) => <span className="text-slate-400 text-[11px]">{formatDate(item.updated_at)}</span>,
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
                onClick={() => navigate('/replenishment')}
                className="text-xs h-7 px-2.5 bg-amber-600 hover:bg-amber-500 border-amber-500/30 text-white font-semibold"
                id={`btn-refuel-${item.sku_id}`}
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
    },
  ];

  return (
    <div className="space-y-6">
      {/* Title & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Boxes className="w-5 h-5 text-cyan-400" />
            Inventory & Stock Ledger
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Authoritative physical positions, allocation reserves, and append-only stock movement reconciliation.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="input-inventory-search"
              placeholder="Search SKU or Product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-navy-900 border border-navy-750 text-xs rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 w-52"
            />
          </div>

          {/* Low Stock Toggle */}
          <Button
            size="sm"
            variant={lowStockFilter ? 'danger' : 'outline'}
            onClick={() => setLowStockFilter(!lowStockFilter)}
            leftIcon={<AlertTriangle className="w-3.5 h-3.5" />}
            id="btn-filter-low-stock"
          >
            {lowStockFilter ? 'Showing Low Stock' : 'Filter Low Stock'}
          </Button>

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

      {/* Main Inventory DataTable */}
      <DataTable
        columns={columns}
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

      {/* SKU Detail & Movement Ledger Modal Dialog */}
      {selectedItem && (
        <Dialog
          isOpen={Boolean(selectedItem)}
          onClose={() => setSelectedItem(null)}
          maxWidth="lg"
          title={
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-cyan-400" />
              <span>Stock Movement Ledger — {selectedItem.sku_code || selectedItem.sku_id}</span>
            </div>
          }
          description={`${selectedItem.product_name || 'Standard Item'} at ${selectedItem.store_name || selectedItem.store_id}`}
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
