import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Layers } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { queryKeys } from '../../lib/query-client';
import { StoreGeoMap } from '../../components/visualizers/StoreGeoMap';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge, getStatusBadgeVariant } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { formatDate } from '../../lib/formatters';

interface StoresPageProps {
  selectedStoreId?: string;
  onSelectStore?: (id: string) => void;
}

export const StoresPage: React.FC<StoresPageProps> = ({ selectedStoreId, onSelectStore }) => {
  const [activeStoreId, setActiveStoreId] = useState<string | null>(selectedStoreId || null);

  // 1. Fetch Stores
  const { data: storesData, isLoading: isStoresLoading, error: storesError } = useQuery({
    queryKey: queryKeys.stores,
    queryFn: () => apiClient.listStores(),
    refetchInterval: 3000,
  });

  // 2. Fetch Service Zones
  const { data: zonesData, isLoading: isZonesLoading } = useQuery({
    queryKey: queryKeys.serviceZones(),
    queryFn: () => apiClient.listServiceZones(),
  });

  const stores = storesData?.data || [];
  const serviceZones = zonesData?.data || [];

  const currentStore = stores.find((s) => s.id === (activeStoreId || selectedStoreId)) || stores[0];

  const handleSelect = (sId: string) => {
    setActiveStoreId(sId);
    if (onSelectStore) onSelectStore(sId);
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-cyan-400" />
            Store Network & Geospatial Service Polygons
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Authoritative dark store coordinates, delivery radiuses, and GeoJSON polygon catchment zones.
          </p>
        </div>
      </div>

      {storesError && (
        <ErrorState
          title="Failed to Load Store Network"
          message={(storesError as any)?.message}
          code={(storesError as any)?.code}
        />
      )}

      {/* Main Map + Store Details Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left 2 cols: Geospatial SVG Map */}
        <div className="xl:col-span-2 space-y-4">
          {isStoresLoading ? (
            <div className="bg-navy-950 border border-navy-750 rounded-2xl p-8 flex items-center justify-center min-h-[460px]">
              <Skeleton className="h-10 w-48 mx-auto" />
            </div>
          ) : (
            <>
              <StoreGeoMap
                stores={stores}
                serviceZones={serviceZones}
                selectedStoreId={activeStoreId || currentStore?.id}
                onSelectStore={handleSelect}
              />

              {/* Store Hub Quick Selector Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {stores.map((s) => {
                  const isSelected = s.id === (activeStoreId || currentStore?.id);
                  const queueDepth = s.current_queue_depth ?? 0;
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleSelect(s.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-navy-900 border-cyan-500/80 shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-500/40'
                          : 'bg-navy-950/80 border-navy-750/70 hover:border-navy-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-white text-xs truncate max-w-[150px]">
                          {s.name.replace(/DarkStore\s*/i, '').replace(/Manhattan Urban Network\s*/i, 'Manhattan ')}
                        </span>
                        {queueDepth > 0 ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono font-bold shrink-0">
                            {queueDepth} active
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono shrink-0">
                            Idle
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 font-mono">
                        <span className="truncate max-w-[130px]">{s.id}</span>
                        <span className="text-emerald-400 text-[10px] font-bold">{s.status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Right 1 col: Store Details & Service Zones */}
        <div className="space-y-5">
          {/* Store Details Card */}
          <Card>
            <CardHeader
              title={currentStore ? currentStore.name : 'Select a Dark Store'}
              description={currentStore ? `Store Code: ${currentStore.code}` : 'Click any store marker on the map'}
              badge={
                currentStore ? (
                  <Badge variant={getStatusBadgeVariant(currentStore.status)} size="sm">
                    {currentStore.status}
                  </Badge>
                ) : null
              }
              icon={<MapPin className="w-4 h-4 text-cyan-400" />}
            />
            <CardContent className="space-y-4">
              {currentStore ? (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2 p-3 bg-navy-950/60 border border-navy-750 rounded-xl font-mono text-[11px]">
                    <div>
                      <span className="text-[10px] text-slate-400 font-sans block">Latitude</span>
                      {currentStore.latitude?.toFixed(4)}
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-sans block">Longitude</span>
                      {currentStore.longitude?.toFixed(4)}
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-sans block">Service Radius</span>
                      {currentStore.service_radius_km ?? 15} km
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-sans block">Queue Backlog</span>
                      {currentStore.current_queue_depth ?? 0} orders
                    </div>
                  </div>

                  {currentStore.address && (
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase">Address:</span>
                      <p className="text-slate-200 mt-0.5">{currentStore.address}</p>
                    </div>
                  )}

                  <div className="text-[10px] text-slate-400 pt-2 border-t border-navy-800">
                    Registered: {formatDate(currentStore.created_at)}
                  </div>
                </div>
              ) : (
                <div className="text-center text-xs text-slate-500 py-6">Select a store from the map</div>
              )}
            </CardContent>
          </Card>

          {/* Service Zones List */}
          <Card>
            <CardHeader
              title="Assigned Service Zones"
              description="GeoJSON polygon delivery coverage"
              icon={<Layers className="w-4 h-4 text-brand-400" />}
            />
            <CardContent className="p-0">
              <div className="divide-y divide-navy-750/50 max-h-64 overflow-y-auto">
                {isZonesLoading ? (
                  <div className="p-4">
                    <Skeleton className="h-8 w-full" count={3} />
                  </div>
                ) : serviceZones.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No explicit service zone polygons configured.
                  </div>
                ) : (
                  serviceZones
                    .filter((z) => !currentStore || z.store_id === currentStore.id)
                    .map((zone) => (
                      <div key={zone.id} className="p-3 text-xs flex items-center justify-between hover:bg-navy-800/30">
                        <div>
                          <div className="font-semibold text-white">{zone.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Code: {zone.code} &bull; SLA: {zone.sla_target_minutes || 20}m
                          </div>
                        </div>
                        <Badge variant="cyan" size="sm">
                          {zone.status}
                        </Badge>
                      </div>
                    ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
