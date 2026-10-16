import React, { useMemo, useState } from 'react';
import { Store, ServiceZone } from '../../types/domain';
import { MapPin, Navigation, Info } from 'lucide-react';
import { Badge, getStatusBadgeVariant } from '../ui/Badge';

interface StoreGeoMapProps {
  stores: Store[];
  serviceZones?: ServiceZone[];
  selectedStoreId?: string | null;
  onSelectStore?: (storeId: string) => void;
  className?: string;
  id?: string;
}

export const StoreGeoMap: React.FC<StoreGeoMapProps> = ({
  stores,
  serviceZones = [],
  selectedStoreId,
  onSelectStore,
  className = '',
  id = 'store-geo-map',
}) => {
  const [hoveredStore, setHoveredStore] = useState<Store | null>(null);

  // Compute Geographic Bounding Box with NYC Metropolitan Cluster Focus
  const { minLat, maxLat, minLon, maxLon, validStores } = useMemo(() => {
    // Focus on valid stores in regional metropolitan cluster (ignoring distant test dummy seeds)
    let valid = stores.filter(
      (s) =>
        typeof s.latitude === 'number' &&
        typeof s.longitude === 'number' &&
        !isNaN(s.latitude) &&
        !isNaN(s.longitude) &&
        s.latitude > 40.5 &&
        s.latitude < 41.2 &&
        s.longitude > -74.3 &&
        s.longitude < -73.6
    );

    if (valid.length === 0) {
      valid = stores.filter(
        (s) =>
          typeof s.latitude === 'number' &&
          typeof s.longitude === 'number' &&
          !isNaN(s.latitude) &&
          !isNaN(s.longitude)
      );
    }

    if (valid.length === 0) {
      return { minLat: 40.7, maxLat: 40.8, minLon: -74.05, maxLon: -73.95, validStores: [] };
    }

    let mLat = Infinity;
    let maLat = -Infinity;
    let mLon = Infinity;
    let maLon = -Infinity;

    valid.forEach((s) => {
      mLat = Math.min(mLat, s.latitude);
      maLat = Math.max(maLat, s.latitude);
      mLon = Math.min(mLon, s.longitude);
      maLon = Math.max(maLon, s.longitude);
    });

    // Also include service zone polygon vertices
    serviceZones.forEach((z) => {
      const boundary = (z as any).boundary || (z as any).polygon_geojson;
      if (boundary && boundary.coordinates) {
        boundary.coordinates.forEach((ring: [number, number][]) => {
          ring.forEach(([lon, lat]) => {
            if (
              typeof lat === 'number' &&
              typeof lon === 'number' &&
              lat > 40.5 &&
              lat < 41.2 &&
              lon > -74.3 &&
              lon < -73.6
            ) {
              mLat = Math.min(mLat, lat);
              maLat = Math.max(maLat, lat);
              mLon = Math.min(mLon, lon);
              maLon = Math.max(maLon, lon);
            }
          });
        });
      }
    });

    const latPad = Math.max(0.015, (maLat - mLat) * 0.18);
    const lonPad = Math.max(0.02, (maLon - mLon) * 0.18);

    return {
      minLat: mLat - latPad,
      maxLat: maLat + latPad,
      minLon: mLon - lonPad,
      maxLon: maLon + lonPad,
      validStores: valid,
    };
  }, [stores, serviceZones]);

  // Coordinate projection from (lat, lon) to SVG (x, y) in range [0, 800] x [0, 520]
  const svgWidth = 800;
  const svgHeight = 520;

  const project = useMemo(() => {
    return (lat: number, lon: number): [number, number] => {
      const latRange = maxLat - minLat || 0.01;
      const lonRange = maxLon - minLon || 0.01;

      // Note: SVG y is inverted (higher lat -> lower y)
      const x = ((lon - minLon) / lonRange) * (svgWidth - 90) + 45;
      const y = svgHeight - (((lat - minLat) / latRange) * (svgHeight - 90) + 45);

      return [x, y];
    };
  }, [minLat, maxLat, minLon, maxLon]);

  // Total active orders tally
  const totalActiveOrders = useMemo(() => {
    return validStores.reduce((acc, s) => acc + (s.current_queue_depth || 0), 0);
  }, [validStores]);

  return (
    <div
      id={id}
      className={`relative bg-[#070B14] border border-navy-750/90 rounded-2xl overflow-hidden flex flex-col shadow-2xl ${className}`}
    >
      {/* Map Header */}
      <div className="p-3.5 bg-navy-900/90 border-b border-navy-750/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-white">NYC Metropolitan Dark Store Network</span>
          <span className="text-slate-400 font-mono text-[11px]">
            ({validStores.length} Active Hubs &bull; {totalActiveOrders} Live Orders in Fulfillment)
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
            Active Store
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
            Order Queue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400/30 border border-cyan-400 inline-block" />
            Delivery Catchment
          </span>
        </div>
      </div>

      {/* SVG Canvas Map */}
      <div className="flex-1 w-full min-h-[480px] bg-gradient-to-b from-[#060911] to-[#0A101D] relative overflow-hidden">
        {validStores.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <Info className="w-8 h-8 text-slate-500 mb-2" />
            <p className="text-sm font-medium text-slate-300">No geographic store coordinates found</p>
            <p className="text-xs text-slate-500 mt-1">Stores will appear once catalog coordinates are seeded.</p>
          </div>
        ) : (
          <svg className="w-full h-full" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
            <defs>
              <pattern id="geo-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#111B30" strokeWidth="0.7" />
              </pattern>
              {/* Pulse glow filter */}
              <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            <rect width={svgWidth} height={svgHeight} fill="url(#geo-grid)" />

            {/* 1. Render GeoJSON Service Area Polygons */}
            {serviceZones.map((zone) => {
              const boundary = (zone as any).boundary || (zone as any).polygon_geojson;
              if (!boundary || !boundary.coordinates) return null;

              const pathData = boundary.coordinates
                .map((ring: [number, number][]) =>
                  ring
                    .map(([lon, lat], i) => {
                      const [x, y] = project(lat, lon);
                      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                    })
                    .join(' ') + ' Z'
                )
                .join(' ');

              const isStoreSelected = selectedStoreId === zone.store_id;

              return (
                <path
                  key={zone.id}
                  d={pathData}
                  fill={isStoreSelected ? 'rgba(6, 182, 212, 0.18)' : 'rgba(59, 130, 246, 0.08)'}
                  stroke={isStoreSelected ? '#06B6D4' : '#3B82F6'}
                  strokeWidth={isStoreSelected ? 2.0 : 1.1}
                  strokeDasharray="4 2"
                  className="transition-all duration-200"
                />
              );
            })}

            {/* 2. Store Radius Approximate Circles if no polygon */}
            {validStores.map((store) => {
              const [x, y] = project(store.latitude, store.longitude);
              const isSelected = selectedStoreId === store.id;
              const hasZone = serviceZones.some((z) => z.store_id === store.id);

              return (
                <g key={`radius-${store.id}`}>
                  {!hasZone && (
                    <circle
                      cx={x}
                      cy={y}
                      r={Math.min(90, Math.max(35, (store.service_radius_km || 10) * 5))}
                      fill={isSelected ? 'rgba(6, 182, 212, 0.09)' : 'rgba(59, 130, 246, 0.05)'}
                      stroke={isSelected ? '#06B6D4' : '#233256'}
                      strokeWidth="1.2"
                      strokeDasharray="3 3"
                    />
                  )}
                </g>
              );
            })}

            {/* 3. Render Store Nodes / Pins */}
            {validStores.map((store) => {
              const [x, y] = project(store.latitude, store.longitude);
              const isSelected = selectedStoreId === store.id;
              const isActive = store.status === 'ACTIVE';
              const queueDepth = store.current_queue_depth ?? 0;
              const hasOrders = queueDepth > 0;

              return (
                <g
                  key={store.id}
                  transform={`translate(${x}, ${y})`}
                  onClick={() => onSelectStore && onSelectStore(store.id)}
                  onMouseEnter={() => setHoveredStore(store)}
                  onMouseLeave={() => setHoveredStore(null)}
                  className="cursor-pointer group"
                >
                  {/* Ping Ring on Active Stores */}
                  {isActive && (
                    <circle
                      r="16"
                      fill={hasOrders ? '#EF4444' : isSelected ? '#06B6D4' : '#10B981'}
                      opacity={hasOrders ? 0.35 : 0.2}
                      className="animate-ping"
                    />
                  )}

                  {/* Active Orders Queue Pill Badge Above Store */}
                  {hasOrders && (
                    <g transform="translate(0, -22)" className="pointer-events-none">
                      <rect
                        x="-24"
                        y="-10"
                        width="48"
                        height="18"
                        rx="9"
                        fill="#DC2626"
                        stroke="#FEF2F2"
                        strokeWidth="1.2"
                        filter="url(#glow)"
                      />
                      <text
                        y="2.5"
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize="9.5"
                        fontWeight="bold"
                        fontFamily="sans-serif"
                      >
                        {queueDepth} orders
                      </text>
                    </g>
                  )}

                  {/* Pin Base Circle */}
                  <circle
                    r={isSelected ? 11 : 9}
                    fill={isSelected ? '#06B6D4' : hasOrders ? '#EF4444' : isActive ? '#10B981' : '#F43F5E'}
                    stroke="#070B14"
                    strokeWidth="2.8"
                    filter="url(#glow)"
                    className="transition-all duration-200 group-hover:scale-125"
                  />

                  {/* Pin Center Dot */}
                  <circle r="3.2" fill="#FFFFFF" />

                  {/* Store Name Label */}
                  <text
                    y={hasOrders ? '18' : '20'}
                    textAnchor="middle"
                    fill={isSelected ? '#67E8F9' : '#F1F5F9'}
                    fontSize="11"
                    fontWeight="bold"
                    className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] pointer-events-none"
                  >
                    {store.name.replace(/DarkStore\s*/i, '').replace(/Manhattan Urban Network\s*/i, 'Manhattan ')}
                  </text>
                  <text
                    y={hasOrders ? '29' : '31'}
                    textAnchor="middle"
                    fill="#94A3B8"
                    fontSize="9"
                    fontFamily="monospace"
                    className="pointer-events-none"
                  >
                    {store.id}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* Hover / Selected Detail Card Popup */}
        {(hoveredStore || selectedStoreId) && (
          <div className="absolute top-4 left-4 bg-navy-900/95 border border-navy-700/80 rounded-xl p-3.5 shadow-2xl backdrop-blur-md w-76 pointer-events-none animate-in fade-in zoom-in-95">
            {(() => {
              const s = hoveredStore || validStores.find((st) => st.id === selectedStoreId);
              if (!s) return null;
              return (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white text-xs flex items-center gap-1.5 truncate max-w-[170px]">
                      <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      {s.name}
                    </span>
                    <Badge variant={getStatusBadgeVariant(s.status)} size="sm">
                      {s.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 font-mono bg-navy-950/70 p-2 rounded-lg border border-navy-800">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Active Orders:</span>
                      <span className="text-rose-400 font-bold">{s.current_queue_depth ?? 0} active</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Store ID:</span>
                      <span className="truncate block">{s.id.slice(0, 15)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Latitude:</span>
                      {s.latitude.toFixed(4)}
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Longitude:</span>
                      {s.longitude.toFixed(4)}
                    </div>
                  </div>
                  {s.service_radius_km && (
                    <div className="text-[11px] text-slate-400 border-t border-navy-800 pt-1.5 flex justify-between">
                      <span>Catchment Radius:</span>
                      <span className="text-cyan-300 font-semibold">{s.service_radius_km} km</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};
