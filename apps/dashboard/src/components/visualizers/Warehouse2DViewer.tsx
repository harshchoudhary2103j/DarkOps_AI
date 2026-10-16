import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Play,
  Pause,
  RotateCcw,
  CheckCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { WarehouseLayout, WarehouseNode, WarehouseEdge, PickerRouteResponse } from '../../types/domain';
import { formatDistance, formatDuration, formatPercent } from '../../lib/formatters';
import { Badge } from '../ui/Badge';

export interface ShelfProductInfo {
  productName: string;
  quantity: number;
  skuId?: string;
  orderId?: string;
}

interface Warehouse2DViewerProps {
  layout: WarehouseLayout;
  routeResponse?: PickerRouteResponse | null;
  selectedShelfId?: string | null;
  onSelectShelf?: (shelfId: string) => void;
  className?: string;
  id?: string;
  activeOrder?: any;
  shelfProductsMap?: Map<string, ShelfProductInfo>;
}

export const Warehouse2DViewer: React.FC<Warehouse2DViewerProps> = ({
  layout,
  routeResponse,
  selectedShelfId,
  onSelectShelf,
  className = '',
  id = 'warehouse-2d-viewer',
  activeOrder,
  shelfProductsMap,
}) => {
  const nodes: WarehouseNode[] = (layout.nodes || layout.layout_data?.nodes || []) as WarehouseNode[];
  const edges: WarehouseEdge[] = (layout.edges || layout.layout_data?.edges || []) as WarehouseEdge[];

  // Viewport / Zoom / Pan State
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Layer Toggles
  const [routeLayer, setRouteLayer] = useState<'both' | 'optimized' | 'baseline'>('both');
  const [showAisleGraph, setShowAisleGraph] = useState(false); // Clean floor by default!
  const [showShelfCodes, setShowShelfCodes] = useState(true);

  // Animation Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [animStep, setAnimStep] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);

  // Compute Layout Bounds
  const { minX, minY, width, height } = useMemo(() => {
    if (nodes.length === 0) {
      return { minX: 0, minY: 0, width: 24, height: 16 };
    }
    let mX = Infinity;
    let maX = -Infinity;
    let mY = Infinity;
    let maY = -Infinity;

    nodes.forEach((n) => {
      mX = Math.min(mX, n.x);
      maX = Math.max(maX, n.x);
      mY = Math.min(mY, n.y);
      maY = Math.max(maY, n.y);
    });

    const padX = 3.5;
    const padY = 3.0;
    const computedMinX = mX - padX;
    const computedMaxX = maX + padX;
    const computedMinY = mY - padY;
    const computedMaxY = maY + padY;

    return {
      minX: computedMinX,
      maxX: computedMaxX,
      minY: computedMinY,
      maxY: computedMaxY,
      width: Math.max(16, computedMaxX - computedMinX),
      height: Math.max(12, computedMaxY - computedMinY),
    };
  }, [nodes]);

  // Node Map for Fast Lookup
  const nodeMap = useMemo(() => {
    const map = new Map<string, WarehouseNode>();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  // Group nodes by type
  const shelfNodes = useMemo(() => nodes.filter((n) => n.type === 'SHELF'), [nodes]);
  const dispatchNode = useMemo(() => nodes.find((n) => n.type === 'DISPATCH_STATION'), [nodes]);
  const waypointNodes = useMemo(() => nodes.filter((n) => n.type !== 'SHELF' && n.type !== 'DISPATCH_STATION'), [nodes]);

  // Extract unique aisles
  const aisles = useMemo(() => {
    const aisleMap = new Map<string, { minX: number; maxX: number; minY: number; maxY: number; centerX: number }>();
    shelfNodes.forEach((n) => {
      const aId = n.aisle_id || 'MAIN';
      if (!aisleMap.has(aId)) {
        aisleMap.set(aId, { minX: n.x, maxX: n.x, minY: n.y, maxY: n.y, centerX: n.x });
      } else {
        const item = aisleMap.get(aId)!;
        item.minX = Math.min(item.minX, n.x);
        item.maxX = Math.max(item.maxX, n.x);
        item.minY = Math.min(item.minY, n.y);
        item.maxY = Math.max(item.maxY, n.y);
        item.centerX = (item.minX + item.maxX) / 2;
      }
    });
    return Array.from(aisleMap.entries()).map(([id, bounds]) => ({ id, ...bounds }));
  }, [shelfNodes]);

  // Reset / Fit to layout
  const handleFitToLayout = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  // Route Paths
  const optimizedNodes = routeResponse?.decisions?.route_nodes || [];
  const baselineNodes = routeResponse?.decisions?.baseline_comparison?.baseline_route_nodes || [];
  const orderedStops = routeResponse?.decisions?.ordered_stops || [];

  // Generate SVG path strings
  const optimizedPathD = useMemo(() => {
    if (optimizedNodes.length < 2) return '';
    return optimizedNodes
      .map((nid, i) => {
        const n = nodeMap.get(nid);
        if (!n) return '';
        return `${i === 0 ? 'M' : 'L'} ${n.x} ${n.y}`;
      })
      .filter(Boolean)
      .join(' ');
  }, [optimizedNodes, nodeMap]);

  const baselinePathD = useMemo(() => {
    if (baselineNodes.length < 2) return '';
    return baselineNodes
      .map((nid, i) => {
        const n = nodeMap.get(nid);
        if (!n) return '';
        return `${i === 0 ? 'M' : 'L'} ${n.x} ${n.y}`;
      })
      .filter(Boolean)
      .join(' ');
  }, [baselineNodes, nodeMap]);

  // Animated Picker Position along optimized route
  useEffect(() => {
    let interval: any = null;
    if (isPlaying && optimizedNodes.length > 1) {
      interval = setInterval(() => {
        setAnimStep((prev) => {
          if (prev >= optimizedNodes.length - 1) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 350);
    }
    return () => clearInterval(interval);
  }, [isPlaying, optimizedNodes.length]);

  const currentPickerNode = nodeMap.get(optimizedNodes[animStep]);

  // Pan interaction
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Wheel zoom interaction
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setScale((s) => Math.min(Math.max(s * factor, 0.6), 5));
  };

  return (
    <div
      id={id}
      className={`relative bg-[#070B14] border border-navy-750/90 rounded-2xl overflow-hidden flex flex-col select-none shadow-2xl ${className}`}
      style={{ minHeight: '540px' }}
    >
      {/* Visualizer Top Toolbar */}
      <div className="p-3 bg-navy-900/90 border-b border-navy-750/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-2">
          <Badge variant="cyan" size="sm">
            Layout v{layout.version || 1}
          </Badge>
          <span className="text-xs text-slate-300 font-mono">
            {shelfNodes.length} Shelves &bull; {aisles.length} Aisles
          </span>
        </div>

        {/* Route Controls & Baseline Comparison */}
        <div className="flex items-center gap-2 flex-wrap">
          {routeResponse && (
            <div className="flex items-center bg-navy-950/80 p-0.5 rounded-lg border border-navy-750 text-xs">
              <button
                type="button"
                onClick={() => setRouteLayer('both')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  routeLayer === 'both' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                Both Paths
              </button>
              <button
                type="button"
                onClick={() => setRouteLayer('optimized')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  routeLayer === 'optimized' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                Optimized Only
              </button>
              <button
                type="button"
                onClick={() => setRouteLayer('baseline')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  routeLayer === 'baseline' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                Baseline Only
              </button>
            </div>
          )}

          {/* Toggle Underlying Graph Lines */}
          <button
            type="button"
            onClick={() => setShowAisleGraph(!showAisleGraph)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors ${
              showAisleGraph ? 'bg-cyan-950/60 text-cyan-400 border-cyan-500/40' : 'bg-navy-950/60 text-slate-400 border-navy-750 hover:text-slate-200'
            }`}
            title="Toggle walkway graph edges"
          >
            {showAisleGraph ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Aisle Graph</span>
          </button>

          {/* Toggle Shelf Codes */}
          <button
            type="button"
            onClick={() => setShowShelfCodes(!showShelfCodes)}
            className={`px-2.5 py-1 rounded-lg border text-xs transition-colors ${
              showShelfCodes ? 'bg-cyan-950/60 text-cyan-400 border-cyan-500/40' : 'bg-navy-950/60 text-slate-400 border-navy-750 hover:text-slate-200'
            }`}
          >
            Labels
          </button>

          {/* Animation Play / Pause */}
          {optimizedNodes.length > 1 && (
            <div className="flex items-center gap-1 bg-navy-950/80 p-1 rounded-lg border border-navy-750">
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-1 rounded text-cyan-400 hover:text-white hover:bg-navy-800 transition-colors"
                aria-label={isPlaying ? 'Pause route animation' : 'Play route animation'}
                title={isPlaying ? 'Pause animation' : 'Simulate picker traversal'}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setAnimStep(0);
                }}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-navy-800 transition-colors"
                aria-label="Restart route simulation"
                title="Restart"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-navy-950/80 p-1 rounded-lg border border-navy-750">
            <button
              type="button"
              onClick={() => setScale((s) => Math.min(s * 1.25, 5))}
              className="p-1 text-slate-400 hover:text-white transition-colors"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setScale((s) => Math.max(s / 1.25, 0.6))}
              className="p-1 text-slate-400 hover:text-white transition-colors"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleFitToLayout}
              className="p-1 text-slate-400 hover:text-white transition-colors"
              aria-label="Fit to layout"
              title="Reset View"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* SVG Canvas Workspace */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className="flex-1 w-full h-full min-h-[480px] overflow-hidden cursor-grab active:cursor-grabbing bg-[#080C16] relative"
      >
        <svg
          className="w-full h-full pointer-events-auto"
          viewBox={`${minX} ${minY} ${width} ${height}`}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.12s ease-out',
          }}
        >
          <defs>
            {/* Subtle Industrial Grid */}
            <pattern id="clean-grid" width="2" height="2" patternUnits="userSpaceOnUse">
              <path d="M 2 0 L 0 0 0 2" fill="none" stroke="#101827" strokeWidth="0.08" />
            </pattern>

            {/* Glowing filter for active picker route */}
            <filter id="route-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="0.4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            {/* Shelf active item glow */}
            <filter id="shelf-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="0.3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background Floor */}
          <rect x={minX} y={minY} width={width} height={height} fill="#080C16" />
          <rect x={minX} y={minY} width={width} height={height} fill="url(#clean-grid)" />

          {/* 1. Aisle Walkway Corridors & Zone Labels */}
          <g id="warehouse-aisle-corridors">
            {aisles.map((aisle) => (
              <g key={`corridor-${aisle.id}`}>
                {/* Aisle Walking Lane Guide */}
                <line
                  x1={aisle.centerX}
                  y1={aisle.minY - 1.2}
                  x2={aisle.centerX}
                  y2={aisle.maxY + 1.2}
                  stroke="#162238"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
                <line
                  x1={aisle.centerX}
                  y1={aisle.minY - 1.2}
                  x2={aisle.centerX}
                  y2={aisle.maxY + 1.2}
                  stroke="#1E2E4A"
                  strokeWidth="0.08"
                  strokeDasharray="0.4, 0.4"
                />
                {/* Aisle Header Badge */}
                <g transform={`translate(${aisle.centerX}, ${aisle.minY - 1.8})`}>
                  <rect
                    x="-1.6"
                    y="-0.5"
                    width="3.2"
                    height="1.0"
                    rx="0.3"
                    fill="#0F172A"
                    stroke="#334155"
                    strokeWidth="0.08"
                  />
                  <text
                    y="0.2"
                    textAnchor="middle"
                    fill="#94A3B8"
                    fontSize="0.45"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {aisle.id}
                  </text>
                </g>
              </g>
            ))}
          </g>

          {/* 2. Walkway Graph Edges (Optional layer, subtle) */}
          {showAisleGraph && (
            <g id="warehouse-graph-edges" stroke="#1E293B" strokeWidth="0.12" strokeLinecap="round" opacity="0.6">
              {edges.map((edge, idx) => {
                const u = nodeMap.get(edge.from_node || edge.source || '');
                const v = nodeMap.get(edge.to_node || edge.target || '');
                if (!u || !v) return null;
                return (
                  <line
                    key={`edge-${idx}`}
                    x1={u.x}
                    y1={u.y}
                    x2={v.x}
                    y2={v.y}
                  />
                );
              })}
              {/* Waypoint dots */}
              {waypointNodes.map((w) => (
                <circle key={w.id} cx={w.x} cy={w.y} r="0.15" fill="#334155" />
              ))}
            </g>
          )}

          {/* 3. Baseline Route (Phase 06 S-Shape Serpentine) */}
          {(routeLayer === 'both' || routeLayer === 'baseline') && baselinePathD && (
            <path
              d={baselinePathD}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="0.28"
              strokeDasharray="0.6, 0.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.85"
            />
          )}

          {/* 4. Optimized Route (Phase 08 OR-Tools TSP) */}
          {(routeLayer === 'both' || routeLayer === 'optimized') && optimizedPathD && (
            <g>
              {/* Outer soft neon halo */}
              <path
                d={optimizedPathD}
                fill="none"
                stroke="#06B6D4"
                strokeWidth="0.65"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.35"
                filter="url(#route-glow)"
              />
              {/* Crisp core path */}
              <path
                d={optimizedPathD}
                fill="none"
                stroke="#22D3EE"
                strokeWidth="0.28"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )}

          {/* 5. Dispatch / Packing Dock Station */}
          {dispatchNode && (
            <g transform={`translate(${dispatchNode.x}, ${dispatchNode.y})`}>
              <rect
                x="-1.6"
                y="-1.2"
                width="3.2"
                height="2.4"
                rx="0.4"
                fill="#1E3A8A"
                stroke="#60A5FA"
                strokeWidth="0.18"
                filter="url(#shelf-glow)"
              />
              <rect
                x="-1.4"
                y="-1.0"
                width="2.8"
                height="0.3"
                fill="#3B82F6"
                rx="0.1"
              />
              <text
                y="0.3"
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize="0.55"
                fontWeight="bold"
                fontFamily="sans-serif"
              >
                DEPOT
              </text>
              <text
                y="0.85"
                textAnchor="middle"
                fill="#93C5FD"
                fontSize="0.32"
                fontFamily="monospace"
              >
                PACK & DISPATCH
              </text>
            </g>
          )}

          {/* 6. Warehouse Storage Shelves */}
          <g id="warehouse-shelves">
            {shelfNodes.map((node) => {
              const rawId = node.shelf_id || node.id;
              const shelfCode = rawId.replace(/^.*SHELF-/, '');
              const isSelected = selectedShelfId === node.id || selectedShelfId === node.shelf_id;
              const stopIndex = orderedStops.indexOf(node.id);
              const isStop = stopIndex !== -1;

              // Check if order contains a product on this shelf
              const productInfo =
                shelfProductsMap?.get(rawId) ||
                shelfProductsMap?.get(node.shelf_id || '') ||
                shelfProductsMap?.get(shelfCode) ||
                shelfProductsMap?.get(node.id);
              const hasOrderProduct = Boolean(productInfo);

              // Proportions
              const shelfW = 1.9;
              const shelfH = 1.25;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() => onSelectShelf && onSelectShelf(node.shelf_id || node.id)}
                  className="cursor-pointer group"
                >
                  <title>
                    {`Shelf ${shelfCode}${productInfo ? ` • ${productInfo.productName} (Qty: ${productInfo.quantity})` : ''}`}
                  </title>

                  {/* Active pick highlight aura */}
                  {(isStop || hasOrderProduct) && (
                    <rect
                      x={-shelfW / 2 - 0.15}
                      y={-shelfH / 2 - 0.15}
                      width={shelfW + 0.3}
                      height={shelfH + 0.3}
                      rx="0.35"
                      fill={isStop ? '#06B6D4' : '#38BDF8'}
                      opacity={isStop ? 0.3 : 0.18}
                      filter="url(#shelf-glow)"
                    />
                  )}

                  {/* Main Shelf Body Box */}
                  <rect
                    x={-shelfW / 2}
                    y={-shelfH / 2}
                    width={shelfW}
                    height={shelfH}
                    rx="0.25"
                    fill={
                      isStop
                        ? '#083344'
                        : isSelected
                        ? '#1E3A8A'
                        : hasOrderProduct
                        ? '#0C2D48'
                        : '#0F172A'
                    }
                    stroke={
                      isStop
                        ? '#22D3EE'
                        : isSelected
                        ? '#60A5FA'
                        : hasOrderProduct
                        ? '#38BDF8'
                        : '#26334D'
                    }
                    strokeWidth={isStop || isSelected ? 0.2 : hasOrderProduct ? 0.16 : 0.09}
                    className="transition-colors duration-150"
                  />

                  {/* Shelf Status / Item Indicator Dot */}
                  {hasOrderProduct && !isStop && (
                    <circle cx={-shelfW / 2 + 0.35} cy={-shelfH / 2 + 0.35} r="0.18" fill="#38BDF8" />
                  )}

                  {/* Numerical Pick Stop Sequence Badge */}
                  {isStop && (
                    <g transform={`translate(${shelfW / 2 - 0.3}, ${-shelfH / 2 + 0.3})`}>
                      <circle r="0.38" fill="#10B981" stroke="#083344" strokeWidth="0.08" />
                      <text
                        y="0.12"
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize="0.4"
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {stopIndex + 1}
                      </text>
                    </g>
                  )}

                  {/* Shelf Location Label */}
                  {showShelfCodes && (
                    <text
                      y={isStop || hasOrderProduct ? '0.1' : '0.15'}
                      textAnchor="middle"
                      fill={isStop ? '#E0F2FE' : hasOrderProduct ? '#BAE6FD' : '#64748B'}
                      fontSize="0.36"
                      fontFamily="monospace"
                      fontWeight={isStop || hasOrderProduct ? 'bold' : 'normal'}
                    >
                      {shelfCode}
                    </text>
                  )}

                  {/* Product Tag for Active Order Item */}
                  {productInfo && (
                    <g transform={`translate(0, ${-shelfH / 2 - 0.65})`} className="pointer-events-none">
                      <rect
                        x="-2.5"
                        y="-0.55"
                        width="5.0"
                        height="0.65"
                        rx="0.15"
                        fill="#020617"
                        stroke="#22D3EE"
                        strokeWidth="0.07"
                        opacity="0.95"
                      />
                      <text
                        y="-0.15"
                        textAnchor="middle"
                        fill="#38BDF8"
                        fontSize="0.28"
                        fontWeight="bold"
                      >
                        {productInfo.productName.length > 16
                          ? productInfo.productName.slice(0, 15) + '…'
                          : productInfo.productName}{' '}
                        ({productInfo.quantity}x)
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {/* 7. Animated Simulated Picker Puck */}
          {currentPickerNode && (
            <g transform={`translate(${currentPickerNode.x}, ${currentPickerNode.y})`}>
              <circle r="0.8" fill="#22D3EE" opacity="0.3" className="animate-ping" />
              <circle r="0.45" fill="#06B6D4" stroke="#FFFFFF" strokeWidth="0.1" filter="url(#route-glow)" />
              <circle r="0.18" fill="#FFFFFF" />
            </g>
          )}
        </svg>

        {/* Floating Metrics Overlay (When Route is Optimized) */}
        {routeResponse && routeResponse.decisions && (
          <div className="absolute bottom-4 left-4 right-4 md:right-auto md:w-92 bg-navy-900/95 border border-navy-700/80 rounded-xl p-3.5 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between pb-2 border-b border-navy-750 text-xs">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-cyan-400" />
                {activeOrder ? `Order #${activeOrder.id.slice(0, 14)} Path` : 'Picker Route Analysis'}
              </span>
              <Badge variant="emerald" size="sm">
                {routeResponse.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mt-2.5 text-xs">
              <div>
                <div className="text-[10px] text-slate-400">Optimized Distance</div>
                <div className="font-bold text-cyan-300 font-mono text-sm">
                  {formatDistance(routeResponse.decisions.total_distance_meters)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">Baseline Distance</div>
                <div className="font-bold text-amber-400 font-mono text-sm">
                  {formatDistance(
                    routeResponse.decisions.baseline_comparison?.baseline_distance_meters
                  )}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">Walking Savings</div>
                <div className="font-bold text-emerald-400 font-mono text-xs">
                  {formatPercent(routeResponse.decisions.baseline_comparison?.distance_reduction_percent)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">Estimated Pick Time</div>
                <div className="font-bold text-slate-200 font-mono text-xs">
                  {formatDuration(routeResponse.decisions.total_duration_seconds || routeResponse.decisions.pick_duration_seconds)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Canvas Instructions Watermark */}
        <div className="absolute bottom-3 right-4 pointer-events-none text-[10px] text-slate-500 font-mono">
          Scroll to Zoom &bull; Drag to Pan &bull; Click Shelf to Inspect
        </div>
      </div>
    </div>
  );
};
