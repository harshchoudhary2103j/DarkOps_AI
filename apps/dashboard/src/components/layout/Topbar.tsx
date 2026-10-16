import React from 'react';
import { Menu, RefreshCw, Store as StoreIcon, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { queryKeys } from '../../lib/query-client';

interface TopbarProps {
  onToggleSidebar: () => void;
  selectedStoreId: string;
  onSelectStore: (storeId: string) => void;
  title: string;
}

export const Topbar: React.FC<TopbarProps> = ({
  onToggleSidebar,
  selectedStoreId,
  onSelectStore,
  title,
}) => {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [lastRefreshed, setLastRefreshed] = React.useState<Date>(new Date());

  // Fetch real active stores
  const { data: storesData } = useQuery({
    queryKey: queryKeys.stores,
    queryFn: () => apiClient.listStores(),
  });

  // Real API health probe
  const { data: healthData, isError: isHealthError } = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => apiClient.checkHealth(),
    refetchInterval: 30000, // Poll every 30s
  });

  const stores = storesData?.data || [];

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setLastRefreshed(new Date());
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  const isApiOnline = !isHealthError && healthData?.status === 'ok';

  return (
    <header
      id="app-topbar"
      className="h-16 px-4 md:px-8 bg-navy-900/90 border-b border-navy-750/80 backdrop-blur-md flex items-center justify-between gap-4 sticky top-8 z-30"
    >
      {/* Left: Mobile hamburger + Page Title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Open mobile navigation menu"
          id="btn-sidebar-toggle"
          className="lg:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-navy-800 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base md:text-lg font-bold text-white tracking-tight truncate flex items-center gap-2">
            {title}
          </h1>
        </div>
      </div>

      {/* Right: Store Selector + Health Badge + Refresh Button */}
      <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
        {/* Global Store Selector */}
        <div className="flex items-center gap-1.5 bg-navy-950/60 border border-navy-750/80 px-2.5 py-1.5 rounded-xl">
          <StoreIcon className="w-3.5 h-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
          <select
            id="global-store-selector"
            aria-label="Filter by Dark Store"
            value={selectedStoreId}
            onChange={(e) => onSelectStore(e.target.value)}
            className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer pr-1"
          >
            <option value="" className="bg-navy-900 text-slate-200">
              All Dark Stores ({stores.length})
            </option>
            {stores.map((s) => (
              <option key={s.id} value={s.id} className="bg-navy-900 text-slate-200">
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </div>

        {/* API Health Connection Indicator */}
        <div
          id="api-health-badge"
          className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
            isApiOnline
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
          }`}
          title={isApiOnline ? 'Operational API is connected and healthy' : 'Operational API unreachable'}
        >
          {isApiOnline ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Operational API Online</span>
            </>
          ) : (
            <>
              <ShieldAlert className="w-3.5 h-3.5 animate-pulse" aria-hidden="true" />
              <span>API Offline</span>
            </>
          )}
        </div>

        {/* Manual Refresh Control */}
        <button
          type="button"
          id="btn-manual-refresh"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          aria-label="Refresh operational data"
          title={`Last updated: ${lastRefreshed.toLocaleTimeString()}`}
          className="p-2 rounded-xl bg-navy-800 hover:bg-navy-750 text-slate-300 hover:text-white border border-navy-700/80 transition-all flex items-center justify-center disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
        </button>
      </div>
    </header>
  );
};
