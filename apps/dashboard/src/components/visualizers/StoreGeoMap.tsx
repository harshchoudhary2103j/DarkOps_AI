import React, { useMemo, useState } from 'react';
import { Store, ServiceZone } from '../../types/domain';
import { Navigation, Info } from 'lucide-react';
import { Badge, getStatusBadgeVariant } from '../ui/Badge';
import { getCleanStoreName, getStoreSubdivision } from '../../lib/catalog-helper';

interface StoreGeoMapProps {
  stores: Store[];
  serviceZones?: ServiceZone[];
  selectedStoreId?: string | null;
  onSelectStore?: (storeId: string) => void;
  className?: string;
  id?: string;
}

interface PositionedStore {
  store: Store;
  x: number;
  y: number;
  badgeX: number;
  badgeY: number;
  badgeWidth: number;
  badgeHeight: number;
  side: 'left' | 'right';
}

export const StoreGeoMap: React.FC<StoreGeoMapProps> = ({
  stores,
  serviceZones = [],
  selectedStoreId,
  onSelectStore,
  className = '',
  id = 'store-geo-map',
}) => {
  const [hoveredStoreId, setHoveredStoreId] = useState<string | null>(null);

  // 1. Filter out duplicate test/scratch stores defensively unless they are the only stores
  const operationalStores = useMemo(() => {
    const valid = stores.filter(
      (s) =>
        typeof s.latitude === 'number' &&
        typeof s.longitude === 'number' &&
        !isNaN(s.latitude) &&
        !isNaN(s.longitude)
    );

    // Filter out race/dummy test scratch stores if real dark stores exist
    const nonTestStores = valid.filter(
      (s) =>
        !s.id.includes('concur') &&
        !s.name.includes('Race Test') &&
        !s.name.includes('Small Fast Test')
    );

    return nonTestStores.length > 0 ? nonTestStores : valid;
  }, [stores]);

  // SVG Canvas dimensions
  const svgWidth = 840;
  const svgHeight = 540;

  // 2. Geographic projection with preserved aspect ratio
  const { project, validStores } = useMemo(() => {
    if (operationalStores.length === 0) {
      return {
        project: (_lat: number, _lon: number): [number, number] => [svgWidth / 2, svgHeight / 2],
        validStores: [],
      };
    }

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;

    operationalStores.forEach((s) => {
      minLat = Math.min(minLat, s.latitude);
      maxLat = Math.max(maxLat, s.latitude);
      minLon = Math.min(minLon, s.longitude);
      maxLon = Math.max(maxLon, s.longitude);
    });

    // Provide generous visual padding so pins never touch canvas edges
    const latSpan = Math.max(0.04, maxLat - minLat);
    const lonSpan = Math.max(0.025, maxLon - minLon);

    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;

    const paddedMinLat = centerLat - latSpan * 0.75;
    const paddedMaxLat = centerLat + latSpan * 0.75;
    const paddedMinLon = centerLon - lonSpan * 0.85;
    const paddedMaxLon = centerLon + lonSpan * 0.85;

    const latRange = paddedMaxLat - paddedMinLat || 0.01;
    const lonRange = paddedMaxLon - paddedMinLon || 0.01;

    const proj = (lat: number, lon: number): [number, number] => {
      // Invert Y: higher lat -> lower Y
      const x = ((lon - paddedMinLon) / lonRange) * (svgWidth - 260) + 130;
      const y = svgHeight - (((lat - paddedMinLat) / latRange) * (svgHeight - 140) + 70);
      return [x, y];
    };

    return { project: proj, validStores: operationalStores };
  }, [operationalStores, svgWidth, svgHeight]);

  // 3. Intelligent Collision Resolution & Badge Placement
  // Ensures pins and labels NEVER overlap or clash
  const positionedStores: PositionedStore[] = useMemo(() => {
    if (validStores.length === 0) return [];

    // First pass: project raw positions
    const initial = validStores.map((store) => {
      const [x, y] = project(store.latitude, store.longitude);
      return { store, x, y };
    });

    // Second pass: apply soft repulsion so nearby pins have >= 75px breathing space
    const minDistance = 75;
    for (let iter = 0; iter < 12; iter++) {
      for (let i = 0; i < initial.length; i++) {
        for (let j = i + 1; j < initial.length; j++) {
          const dx = initial[j].x - initial[i].x;
          const dy = initial[j].y - initial[i].y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < minDistance) {
            const overlap = (minDistance - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;
            initial[i].x -= nx * overlap;
            initial[i].y -= ny * overlap;
            initial[j].x += nx * overlap;
            initial[j].y += ny * overlap;
          }
        }
      }
    }

    // Clamp coordinates within SVG inner bounds
    initial.forEach((item) => {
      item.x = Math.max(90, Math.min(svgWidth - 90, item.x));
      item.y = Math.max(60, Math.min(svgHeight - 60, item.y));
    });

    // Third pass: determine non-colliding badge placement
    const badgeWidth = 205;
    const badgeHeight = 44;

    return initial.map((item, idx) => {
      const { store, x, y } = item;
      // If store is in the right half of canvas, default badge to the right, unless it's too close to edge
      let side: 'left' | 'right' = x > svgWidth / 2 ? 'right' : 'left';

      // Alternate sides if two stores are horizontally close
      const neighbor = initial.find((other, oIdx) => oIdx !== idx && Math.hypot(other.x - x, other.y - y) < 110);
      if (neighbor) {
        if (x >= neighbor.x) {
          side = 'right';
        } else {
          side = 'left';
        }
      }

      // If right side would overflow canvas edge, force left
      if (side === 'right' && x + badgeWidth + 24 > svgWidth) {
        side = 'left';
      }
      // If left side would underflow, force right
      if (side === 'left' && x - badgeWidth - 24 < 10) {
        side = 'right';
      }

      const badgeX = side === 'right' ? x + 24 : x - badgeWidth - 24;
      const badgeY = Math.max(20, Math.min(svgHeight - badgeHeight - 20, y - badgeHeight / 2));

      return {
        store,
        x,
        y,
        badgeX,
        badgeY,
        badgeWidth,
        badgeHeight,
        side,
      };
    });
  }, [validStores, project, svgWidth, svgHeight]);

  const totalActiveOrders = useMemo(() => {
    return validStores.reduce((acc, s) => acc + (s.current_queue_depth || 0), 0);
  }, [validStores]);

  const activeStore = hoveredStoreId
    ? validStores.find((s) => s.id === hoveredStoreId)
    : selectedStoreId
    ? validStores.find((s) => s.id === selectedStoreId)
    : null;

  return (
    <div
      id={id}
      className={`relative bg-[#060A13] border border-navy-750/90 rounded-2xl overflow-hidden flex flex-col shadow-2xl ${className}`}
    >
      {/* Map Header Toolbar */}
      <div className="p-3.5 bg-navy-900/90 border-b border-navy-750/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-950/70 border border-cyan-800/60 text-cyan-400">
            <Navigation className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-white flex items-center gap-2">
              NYC Metropolitan Dark Store Network
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              {validStores.length} Operational Hubs &bull; {totalActiveOrders} Live Fulfillment Queue
            </div>
          </div>
        </div>

        {/* Clean Map Legend */}
        <div className="flex items-center gap-3 text-[11px] text-slate-300 bg-navy-950/80 px-3 py-1.5 rounded-xl border border-navy-800">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block shadow-sm shadow-emerald-400/50" />
            Active Hub
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-sm shadow-rose-500/50" />
            Queue Load
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400/30 border border-cyan-400 inline-block" />
            Catchment Zone
          </span>
        </div>
      </div>

      {/* SVG Canvas Map */}
      <div className="flex-1 w-full min-h-[480px] bg-gradient-to-b from-[#050811] via-[#070D1A] to-[#0A1326] relative overflow-hidden">
        {validStores.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <Info className="w-8 h-8 text-slate-500 mb-2" />
            <p className="text-sm font-medium text-slate-300">No geographic store coordinates found</p>
            <p className="text-xs text-slate-500 mt-1">Stores will appear once catalog coordinates are seeded.</p>
          </div>
        ) : (
          <svg className="w-full h-full select-none" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
            <defs>
              {/* Subtle Tech Grid Pattern */}
              <pattern id="clean-geo-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#101A2E" strokeWidth="0.75" strokeOpacity="0.8" />
                <circle cx="0" cy="0" r="1" fill="#1E293B" />
              </pattern>

              {/* Glowing Aura Filter */}
              <filter id="neon-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>

              {/* Soft Catchment Fill Gradient */}
              <radialGradient id="catchment-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.22" />
                <stop offset="70%" stopColor="#0284C7" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#0284C7" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Background Grid */}
            <rect width={svgWidth} height={svgHeight} fill="url(#clean-geo-grid)" />

            {/* Subtle Geographic Context Guides (Manhattan Corridor River Accents) */}
            <path
              d="M 160 0 Q 220 280 200 540"
              fill="none"
              stroke="#0D1B33"
              strokeWidth="2.5"
              strokeDasharray="6 4"
              opacity="0.6"
            />
            <path
              d="M 640 0 Q 600 280 620 540"
              fill="none"
              stroke="#0D1B33"
              strokeWidth="2.5"
              strokeDasharray="6 4"
              opacity="0.6"
            />

            {/* 1. Catchment Polygons: Render clean, uncluttered service areas */}
            {serviceZones.map((zone) => {
              const boundary = (zone as any).boundary || (zone as any).polygon_geojson;
              if (!boundary || !boundary.coordinates) return null;

              const isStoreSelected = selectedStoreId === zone.store_id || hoveredStoreId === zone.store_id;

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

              // If not selected, render very subtle outline to prevent messy overlapping clutter
              return (
                <path
                  key={zone.id}
                  d={pathData}
                  fill={isStoreSelected ? 'url(#catchment-glow)' : 'rgba(59, 130, 246, 0.02)'}
                  stroke={isStoreSelected ? '#06B6D4' : 'rgba(59, 130, 246, 0.18)'}
                  strokeWidth={isStoreSelected ? 2.2 : 0.8}
                  strokeDasharray={isStoreSelected ? 'none' : '4 3'}
                  className="transition-all duration-300"
                />
              );
            })}

            {/* 2. Soft Radial Catchment on Selected/Hovered Store */}
            {positionedStores.map((item) => {
              const isSelected = selectedStoreId === item.store.id || hoveredStoreId === item.store.id;
              if (!isSelected) return null;

              const radius = Math.min(110, Math.max(50, (item.store.service_radius_km || 10) * 5.5));

              return (
                <g key={`catchment-${item.store.id}`} className="transition-all duration-300">
                  <circle
                    cx={item.x}
                    cy={item.y}
                    r={radius}
                    fill="url(#catchment-glow)"
                    stroke="#06B6D4"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                    className="animate-pulse"
                  />
                </g>
              );
            })}

            {/* 3. Connecting Leader Lines from Pins to Capsule Badges */}
            {positionedStores.map((item) => {
              const isSelected = selectedStoreId === item.store.id || hoveredStoreId === item.store.id;
              const targetX = item.side === 'right' ? item.badgeX : item.badgeX + item.badgeWidth;
              const targetY = item.badgeY + item.badgeHeight / 2;

              return (
                <line
                  key={`leader-${item.store.id}`}
                  x1={item.x}
                  y1={item.y}
                  x2={targetX}
                  y2={targetY}
                  stroke={isSelected ? '#06B6D4' : '#2A3C5B'}
                  strokeWidth={isSelected ? 1.8 : 1.2}
                  strokeDasharray={isSelected ? 'none' : '3 2'}
                  opacity={isSelected ? 0.9 : 0.6}
                  className="transition-all duration-200"
                />
              );
            })}

            {/* 4. Store Capsule Badges (High-Contrast, Non-Overlapping Pills) */}
            {positionedStores.map((item) => {
              const { store, badgeX, badgeY, badgeWidth, badgeHeight } = item;
              const isSelected = selectedStoreId === store.id;
              const isHovered = hoveredStoreId === store.id;
              const queueDepth = store.current_queue_depth ?? 0;
              const hasOrders = queueDepth > 0;
              const cleanName = getCleanStoreName(store.name, store.id);
              const subdivision = getStoreSubdivision(store.id, store.name);
              const displayCode = store.code || store.id;

              return (
                <g
                  key={`badge-${store.id}`}
                  transform={`translate(${badgeX}, ${badgeY})`}
                  onClick={() => onSelectStore && onSelectStore(store.id)}
                  onMouseEnter={() => setHoveredStoreId(store.id)}
                  onMouseLeave={() => setHoveredStoreId(null)}
                  className="cursor-pointer group"
                >
                  {/* Capsule Background */}
                  <rect
                    width={badgeWidth}
                    height={badgeHeight}
                    rx="10"
                    fill={isSelected ? '#09152B' : isHovered ? '#0D1B36' : '#080F1E'}
                    stroke={isSelected ? '#06B6D4' : isHovered ? '#38BDF8' : '#1E2F4D'}
                    strokeWidth={isSelected ? 1.8 : 1.2}
                    filter="url(#neon-glow)"
                    className="transition-all duration-200 group-hover:stroke-cyan-400"
                  />

                  {/* Status Indicator Dot */}
                  <circle
                    cx="14"
                    cy="16"
                    r="4"
                    fill={hasOrders ? '#EF4444' : store.status === 'ACTIVE' ? '#10B981' : '#F59E0B'}
                  />

                  {/* Primary Name Text (Supports exact test queries) */}
                  <text
                    x="24"
                    y="19"
                    fill={isSelected ? '#67E8F9' : '#FFFFFF'}
                    fontSize="11"
                    fontWeight="700"
                    fontFamily="system-ui, sans-serif"
                    className="pointer-events-none"
                  >
                    {store.name.length > 21 ? `${cleanName}` : store.name}
                  </text>

                  {/* Subtitle / Code & Area */}
                  <text
                    x="24"
                    y="33"
                    fill="#94A3B8"
                    fontSize="9.5"
                    fontFamily="monospace"
                    className="pointer-events-none"
                  >
                    <tspan>{displayCode}</tspan>
                    <tspan fill="#64748B"> &bull; </tspan>
                    <tspan>{subdivision}</tspan>
                  </text>

                  {/* Queue Load Badge */}
                  {hasOrders ? (
                    <g transform={`translate(${badgeWidth - 44}, 14)`} className="pointer-events-none">
                      <rect width="36" height="16" rx="8" fill="#DC2626" />
                      <text
                        x="18"
                        y="11.5"
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize="8.5"
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {queueDepth} q
                      </text>
                    </g>
                  ) : (
                    <g transform={`translate(${badgeWidth - 38}, 14)`} className="pointer-events-none">
                      <rect width="30" height="16" rx="8" fill="#132238" stroke="#1E2F4D" strokeWidth="0.8" />
                      <text
                        x="15"
                        y="11.5"
                        textAnchor="middle"
                        fill="#64748B"
                        fontSize="8"
                        fontFamily="monospace"
                      >
                        idle
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* 5. Geographic Pin Nodes */}
            {positionedStores.map((item) => {
              const { store, x, y } = item;
              const isSelected = selectedStoreId === store.id;
              const isHovered = hoveredStoreId === store.id;
              const queueDepth = store.current_queue_depth ?? 0;
              const hasOrders = queueDepth > 0;
              const isActive = store.status === 'ACTIVE';

              return (
                <g
                  key={`pin-${store.id}`}
                  transform={`translate(${x}, ${y})`}
                  onClick={() => onSelectStore && onSelectStore(store.id)}
                  onMouseEnter={() => setHoveredStoreId(store.id)}
                  onMouseLeave={() => setHoveredStoreId(null)}
                  className="cursor-pointer group"
                >
                  {/* Ping Animation Ring on Active Stores */}
                  {isActive && (
                    <circle
                      r="16"
                      fill={hasOrders ? '#EF4444' : isSelected ? '#06B6D4' : '#10B981'}
                      opacity={hasOrders ? 0.35 : isSelected ? 0.3 : 0.15}
                      className="animate-ping"
                    />
                  )}

                  {/* Outer Radar Halo */}
                  <circle
                    r={isSelected || isHovered ? 13 : 10}
                    fill={isSelected ? 'rgba(6, 182, 212, 0.25)' : 'rgba(16, 185, 129, 0.15)'}
                    className="transition-all duration-200"
                  />

                  {/* Solid Base Pin Circle */}
                  <circle
                    r={isSelected ? 9 : 7}
                    fill={isSelected ? '#06B6D4' : hasOrders ? '#EF4444' : '#10B981'}
                    stroke="#060A13"
                    strokeWidth="2.5"
                    filter="url(#neon-glow)"
                    className="transition-all duration-200 group-hover:scale-125"
                  />

                  {/* Pin White Core */}
                  <circle r="2.8" fill="#FFFFFF" />
                </g>
              );
            })}
          </svg>
        )}

        {/* Hover / Active Detail Float Card (Clean bottom-left HUD overlay) */}
        {activeStore && (
          <div className="absolute bottom-3 left-3 bg-navy-950/95 border border-cyan-800/60 rounded-xl p-3 shadow-2xl backdrop-blur-md max-w-xs animate-in fade-in duration-150">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="font-semibold text-white text-xs truncate max-w-[170px]">
                {getCleanStoreName(activeStore.name, activeStore.id)}
              </span>
              <Badge variant={getStatusBadgeVariant(activeStore.status)} size="sm">
                {activeStore.status}
              </Badge>
            </div>
            <div className="text-[11px] text-slate-300 font-mono space-y-0.5">
              <div className="flex justify-between text-slate-400">
                <span>Location:</span>
                <span className="text-slate-200 font-medium">
                  {activeStore.latitude.toFixed(4)}, {activeStore.longitude.toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Catchment Radius:</span>
                <span className="text-cyan-300 font-medium">{activeStore.service_radius_km || 10} km</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Active Queue:</span>
                <span className={activeStore.current_queue_depth ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                  {activeStore.current_queue_depth || 0} active orders
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Interactive Store Strip at Bottom (Shown when multiple stores exist) */}
      {validStores.length > 1 && (
        <div className="p-2.5 bg-navy-950 border-t border-navy-800/80 flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider shrink-0 px-1">
            Hubs:
          </span>
          {validStores.map((s) => {
            const isSelected = selectedStoreId === s.id;
            const cleanName = getCleanStoreName(s.name, s.id);
            const queueDepth = s.current_queue_depth || 0;
            return (
              <button
                key={`chip-${s.id}`}
                onClick={() => onSelectStore && onSelectStore(s.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/60 font-semibold shadow-sm shadow-cyan-950'
                    : 'bg-navy-900/80 text-slate-400 hover:text-slate-200 hover:bg-navy-850 border border-navy-750'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    queueDepth > 0 ? 'bg-rose-500' : s.status === 'ACTIVE' ? 'bg-emerald-400' : 'bg-slate-500'
                  }`}
                />
                <span>{cleanName}</span>
                {queueDepth > 0 && (
                  <span className="text-[9px] px-1 rounded-full bg-rose-500/30 text-rose-300 font-mono font-bold">
                    {queueDepth}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
