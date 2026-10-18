import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Zap,
  Play,
  Pause,
  RotateCcw,
  Store,
  Clock,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  Flame,
  Gauge,
  Activity,
  Layers,
  Sparkles,
  Database,
  Trash2,
  Grid,
  MapPin,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { apiClient } from '../../../lib/api-client';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';

interface SurgeItem {
  sku_id: string;
  sku_name: string;
  quantity: number;
}

interface SurgeOrder {
  id: string;
  customer_name: string;
  customer_latitude: number;
  customer_longitude: number;
  items: SurgeItem[];
  virtual_timestamp_seconds: number;
}

interface EvaluatedSurgeOrder {
  order: SurgeOrder;
  persisted_order_id?: string;
  naive: {
    store_id: string;
    store_name: string;
    travel_distance_km: number;
    travel_minutes: number;
    queue_wait_minutes: number;
    stockout_penalty_minutes: number;
    total_turnaround_minutes: number;
    has_stockout: boolean;
    missing_items: string[];
    rationale: string;
  };
  smart: {
    store_id: string;
    store_name: string;
    travel_distance_km: number;
    travel_minutes: number;
    queue_wait_minutes: number;
    stockout_penalty_minutes: number;
    total_turnaround_minutes: number;
    has_stockout: boolean;
    missing_items: string[];
    rationale: string;
  };
  time_saved_minutes: number;
  distance_saved_km: number;
  stockout_averted: boolean;
}

interface SimulatedStore {
  store_id: string;
  store_name: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  active_queue: number;
  picker_count: number;
  inventory: Record<string, number>;
  initial_stock: number;
  total_units_consumed: number;
  burn_rate: number;
  stock_runway_minutes: number;
  is_critical: boolean;
  emergency_restock_count: number;
}

const INITIAL_STORES: SimulatedStore[] = [
  {
    store_id: 'store-manhattan-demo-02',
    store_name: 'DarkOps Manhattan #02',
    neighborhood: 'Midtown East / Central',
    latitude: 40.770393,
    longitude: -73.988094,
    active_queue: 0,
    picker_count: 3,
    inventory: {
      'sku-manhattan-demo-001': 100,
      'sku-manhattan-demo-002': 100,
      'sku-manhattan-demo-003': 100,
      'sku-manhattan-demo-004': 100,
      'sku-manhattan-demo-005': 100,
      'sku-manhattan-demo-006': 100,
      'sku-manhattan-demo-007': 100,
    },
    initial_stock: 700,
    total_units_consumed: 0,
    burn_rate: 0,
    stock_runway_minutes: 999,
    is_critical: false,
    emergency_restock_count: 0,
  },
  {
    store_id: 'store-ord-1792148625903',
    store_name: 'DarkOps SoHo #03',
    neighborhood: 'SoHo / Tribeca',
    latitude: 40.7223,
    longitude: -73.998,
    active_queue: 0,
    picker_count: 2,
    inventory: {
      'sku-manhattan-demo-001': 100,
      'sku-manhattan-demo-002': 100,
      'sku-manhattan-demo-003': 100,
      'sku-manhattan-demo-004': 100,
      'sku-manhattan-demo-005': 100,
      'sku-manhattan-demo-006': 100,
      'sku-manhattan-demo-007': 100,
    },
    initial_stock: 700,
    total_units_consumed: 0,
    burn_rate: 0,
    stock_runway_minutes: 999,
    is_critical: false,
    emergency_restock_count: 0,
  },
  {
    store_id: 'store-ord-1792148473745',
    store_name: 'DarkOps East Village #04',
    neighborhood: 'East Village / Lower East',
    latitude: 40.7295,
    longitude: -73.982,
    active_queue: 0,
    picker_count: 2,
    inventory: {
      'sku-manhattan-demo-001': 100,
      'sku-manhattan-demo-002': 100,
      'sku-manhattan-demo-003': 100,
      'sku-manhattan-demo-004': 100,
      'sku-manhattan-demo-005': 100,
      'sku-manhattan-demo-006': 100,
      'sku-manhattan-demo-007': 100,
    },
    initial_stock: 700,
    total_units_consumed: 0,
    burn_rate: 0,
    stock_runway_minutes: 999,
    is_critical: false,
    emergency_restock_count: 0,
  },
];

const CUSTOMER_NAMES = [
  'Sarah Miller',
  'David Kim',
  'Elena Rostova',
  'Alex Chen',
  'Marcus Vance',
  'Chloe Bennett',
  'Liam Gallagher',
  'Sofia Rodriguez',
  'James Wilson',
  'Aria Montgomery',
];

const SAMPLE_CATALOG = [
  { sku_id: 'sku-manhattan-demo-001', sku_name: 'Organic Whole Milk 1L', default_qty: 2 },
  { sku_id: 'sku-manhattan-demo-002', sku_name: 'Organic Bananas 1kg', default_qty: 1 },
  { sku_id: 'sku-manhattan-demo-003', sku_name: 'Cold Brew Coffee 330ml', default_qty: 2 },
  { sku_id: 'sku-manhattan-demo-004', sku_name: 'Artisan Sourdough Loaf', default_qty: 1 },
  { sku_id: 'sku-manhattan-demo-005', sku_name: 'Hass Avocados 4-pack', default_qty: 1 },
  { sku_id: 'sku-manhattan-demo-006', sku_name: 'Sparkling Water 500ml', default_qty: 2 },
  { sku_id: 'sku-manhattan-demo-007', sku_name: 'Greek Yogurt 500g', default_qty: 1 },
];

export const InteractiveSurgeArena: React.FC = () => {
  // Configurable Parameters
  const [totalOrders, setTotalOrders] = useState<number>(15);
  const [durationMinutes, setDurationMinutes] = useState<number>(3);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(5); // 1x, 5x, 10x, 25x
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [isResettingDb, setIsResettingDb] = useState<boolean>(false);

  // Simulation State
  const [elapsedVirtualSeconds, setElapsedVirtualSeconds] = useState<number>(0);
  const [ordersProcessed, setOrdersProcessed] = useState<number>(0);
  const [stores, setStores] = useState<SimulatedStore[]>(INITIAL_STORES);
  const [evaluatedOrders, setEvaluatedOrders] = useState<EvaluatedSurgeOrder[]>([]);
  const [restockToast, setRestockToast] = useState<string | null>(null);

  const simulationIntervalRef = useRef<any>(null);

  // Cumulative Totals
  const totalTimeSaved = evaluatedOrders.reduce((acc, o) => acc + o.time_saved_minutes, 0);
  const totalDistanceSaved = evaluatedOrders.reduce((acc, o) => acc + o.distance_saved_km, 0);
  const stockoutsAvertedCount = evaluatedOrders.filter((o) => o.stockout_averted).length;

  const avgNaiveTurnaround =
    evaluatedOrders.length > 0
      ? evaluatedOrders.reduce((acc, o) => acc + o.naive.total_turnaround_minutes, 0) /
        evaluatedOrders.length
      : 0;

  const avgSmartTurnaround =
    evaluatedOrders.length > 0
      ? evaluatedOrders.reduce((acc, o) => acc + o.smart.total_turnaround_minutes, 0) /
        evaluatedOrders.length
      : 0;

  // Preset Configurations
  const applyPreset = (orders: number, minutes: number, speed: number) => {
    handleReset();
    setTotalOrders(orders);
    setDurationMinutes(minutes);
    setPlaybackSpeed(speed);
  };

  // Reset Simulation
  const handleReset = () => {
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }
    setIsRunning(false);
    setIsFinished(false);
    setElapsedVirtualSeconds(0);
    setOrdersProcessed(0);
    setStores(JSON.parse(JSON.stringify(INITIAL_STORES)));
    setEvaluatedOrders([]);
  };

  // Wipe PostgreSQL Database and Start Fresh
  const handleResetDatabase = async () => {
    try {
      setIsResettingDb(true);
      handleReset();
      const resp = await apiClient.resetSurgeDatabase();
      setRestockToast(
        `✨ PostgreSQL Wiped Clean: ${resp.data?.deletedOrdersCount ?? 0} orders cleared. 100 units on-hand replenished across all 3 stores. Starting fresh!`
      );
      setTimeout(() => setRestockToast(null), 5000);
    } catch (err: any) {
      setRestockToast(`⚠️ Failed to reset database: ${err.message || 'Unknown error'}`);
      setTimeout(() => setRestockToast(null), 5000);
    } finally {
      setIsResettingDb(false);
    }
  };

  // Toggle Start / Pause
  const handleTogglePlay = () => {
    if (isFinished) {
      handleReset();
    }
    setIsRunning((prev) => !prev);
  };

  // Generate a realistic synthetic surge order
  const generateOrder = (index: number): SurgeOrder => {
    const customer = CUSTOMER_NAMES[index % CUSTOMER_NAMES.length];
    // Sample coordinates centered around Manhattan NYC catchment
    const latOffset = (Math.random() - 0.45) * 0.04;
    const lonOffset = (Math.random() - 0.5) * 0.03;
    const customerLat = 40.745 + latOffset;
    const customerLon = -73.988 + lonOffset;

    // Pick 1 to 3 items
    const itemCount = 1 + (index % 3);
    const shuffled = [...SAMPLE_CATALOG].sort(() => 0.5 - Math.random());
    const items: SurgeItem[] = shuffled.slice(0, itemCount).map((item) => ({
      sku_id: item.sku_id,
      sku_name: item.sku_name,
      quantity: 1 + Math.floor(Math.random() * 2),
    }));

    return {
      id: `ord-surge-${String(index + 1).padStart(3, '0')}`,
      customer_name: customer,
      customer_latitude: Number(customerLat.toFixed(4)),
      customer_longitude: Number(customerLon.toFixed(4)),
      items,
      virtual_timestamp_seconds: elapsedVirtualSeconds,
    };
  };

  // Process a single surge step
  const processNextOrder = async (currentProcessed: number, currentElapsedSec: number) => {
    if (currentProcessed >= totalOrders) {
      setIsRunning(false);
      setIsFinished(true);
      return;
    }

    const nextOrder = generateOrder(currentProcessed);
    const elapsedMinutes = Math.max(0.5, currentElapsedSec / 60);

    // Call backend surge evaluation endpoint with persistence enabled
    try {
      const payload = {
        order: nextOrder,
        stores: stores.map((s) => ({
          store_id: s.store_id,
          store_name: s.store_name,
          latitude: s.latitude,
          longitude: s.longitude,
          active_queue: s.active_queue,
          picker_count: s.picker_count,
          inventory: s.inventory,
          total_units_consumed: s.total_units_consumed,
        })),
        elapsed_virtual_minutes: elapsedMinutes,
        persist_to_db: true,
      };

      const res = await apiClient.evaluateSurgeOrder(payload);
      const data = res.data;

      const evaluated: EvaluatedSurgeOrder = {
        order: nextOrder,
        persisted_order_id: data.persisted_order_id || nextOrder.id,
        naive: data.naive_allocation,
        smart: data.smart_allocation,
        time_saved_minutes: data.time_saved_minutes,
        distance_saved_km: data.distance_saved_km,
        stockout_averted: data.stockout_averted,
      };

      setEvaluatedOrders((prev) => [evaluated, ...prev]);
      setOrdersProcessed(currentProcessed + 1);

      // Update store state based on smart allocation
      setStores((prevStores) => {
        return prevStores.map((st) => {
          const advisory = data.replenishment_advisories?.find(
            (a: any) => a.store_id === st.store_id
          );

          if (st.store_id === evaluated.smart.store_id) {
            // Deduct inventory for items in order
            const updatedInv = { ...st.inventory };
            let totalDeducted = 0;
            for (const item of nextOrder.items) {
              const currentQty = updatedInv[item.sku_id] || 0;
              const consumed = Math.min(currentQty, item.quantity);
              updatedInv[item.sku_id] = Math.max(0, currentQty - consumed);
              totalDeducted += consumed;
            }

            const updatedConsumed = st.total_units_consumed + totalDeducted;
            const updatedQueue = st.active_queue + 1;

            return {
              ...st,
              inventory: updatedInv,
              total_units_consumed: updatedConsumed,
              active_queue: updatedQueue,
              burn_rate: advisory?.burn_rate_units_per_min ?? st.burn_rate,
              stock_runway_minutes: advisory?.stock_runway_minutes ?? st.stock_runway_minutes,
              is_critical: advisory?.is_critical_runway ?? false,
            };
          } else {
            // Non-allocated stores: slightly relieve queue if active
            const relievedQueue = Math.max(0, st.active_queue - (Math.random() > 0.6 ? 1 : 0));
            return {
              ...st,
              active_queue: relievedQueue,
              burn_rate: advisory?.burn_rate_units_per_min ?? st.burn_rate,
              stock_runway_minutes: advisory?.stock_runway_minutes ?? st.stock_runway_minutes,
              is_critical: advisory?.is_critical_runway ?? false,
            };
          }
        });
      });
    } catch {
      // Fallback local update if network hiccups
      setOrdersProcessed(currentProcessed + 1);
    }
  };

  // Main simulation timer loop
  useEffect(() => {
    if (!isRunning) {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
      return;
    }

    const totalDurationSeconds = durationMinutes * 60;
    const intervalSecondsPerOrder = Math.max(1, totalDurationSeconds / totalOrders);

    // Real-world interval in milliseconds based on playbackSpeed
    const tickIntervalMs = Math.max(200, Math.round((intervalSecondsPerOrder * 1000) / playbackSpeed));

    simulationIntervalRef.current = setInterval(() => {
      setElapsedVirtualSeconds((prevSec) => {
        const nextSec = prevSec + intervalSecondsPerOrder;
        if (ordersProcessed < totalOrders) {
          processNextOrder(ordersProcessed, nextSec);
        } else {
          setIsRunning(false);
          setIsFinished(true);
        }
        return nextSec;
      });
    }, tickIntervalMs);

    return () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
    };
  }, [isRunning, ordersProcessed, totalOrders, durationMinutes, playbackSpeed]);

  // Emergency Inbound Restock Action
  const handleEmergencyRestock = async (storeId: string) => {
    try {
      await apiClient.emergencySurgeRestock({ store_id: storeId, quantity: 50 });
      setStores((prev) =>
        prev.map((s) => {
          if (s.store_id === storeId) {
            const restoredInv = { ...s.inventory };
            for (const sku in restoredInv) {
              restoredInv[sku] += 25;
            }
            return {
              ...s,
              inventory: restoredInv,
              is_critical: false,
              stock_runway_minutes: 999,
              emergency_restock_count: s.emergency_restock_count + 1,
            };
          }
          return s;
        })
      );
      const storeName = stores.find((s) => s.store_id === storeId)?.store_name || storeId;
      setRestockToast(`⚡ Emergency Restock Inbounded: +50 units added to ${storeName}!`);
      setTimeout(() => setRestockToast(null), 4000);
    } catch {
      // Handled
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6" id="interactive-surge-arena">
      {/* Toast Notification */}
      {restockToast && (
        <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between shadow-lg shadow-emerald-500/10 animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>{restockToast}</span>
          </div>
          <button onClick={() => setRestockToast(null)} className="text-slate-400 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Control Console Card */}
      <div className="bg-navy-900 border border-navy-750 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-navy-800">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center font-bold text-white shadow-lg shadow-rose-500/20">
                <Flame className="w-5 h-5 text-amber-200" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Live Traffic Surge & Dynamic Allocation Arena
              </h2>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl">
              Control order volume and surge duration. Watch live allocation stream in real time, compare Naive vs
              OR-Tools Workload-Aware routing, and trigger dynamic surge replenishment when inventory burns out!
            </p>
          </div>

          {/* Quick Preset Buttons & Database Wipe Button */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-1 rounded-md text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold uppercase tracking-wider flex items-center gap-1 mr-2">
              <Database className="w-3 h-3 text-emerald-400" /> PostgreSQL Live Sync
            </span>
            <span className="text-[11px] text-slate-400 font-semibold uppercase mr-1">Presets:</span>
            <button
              onClick={() => applyPreset(15, 3, 5)}
              className="text-xs px-3 py-1.5 rounded-lg bg-navy-800 hover:bg-navy-750 border border-navy-700 text-cyan-300 transition-colors flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5 text-cyan-400" /> 15 in 3m
            </button>
            <button
              onClick={() => applyPreset(50, 10, 10)}
              className="text-xs px-3 py-1.5 rounded-lg bg-navy-800 hover:bg-navy-750 border border-navy-700 text-amber-300 transition-colors flex items-center gap-1.5"
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" /> 50 Lunch Rush
            </button>
            <button
              onClick={() => applyPreset(100, 15, 25)}
              className="text-xs px-3 py-1.5 rounded-lg bg-navy-800 hover:bg-navy-750 border border-navy-700 text-rose-300 transition-colors flex items-center gap-1.5"
            >
              <Activity className="w-3.5 h-3.5 text-rose-400" /> 100 Flash Surge
            </button>

            {/* Wipe & Start Fresh (0 Orders) */}
            <Button
              variant="outline"
              onClick={handleResetDatabase}
              isLoading={isResettingDb}
              id="btn-wipe-database"
              className="ml-2 text-xs px-3 py-1.5 rounded-lg border-rose-500/40 text-rose-300 hover:bg-rose-950/40 hover:text-white transition-colors flex items-center gap-1.5 font-semibold"
              title="Wipes all orders in PostgreSQL and restores 100 on-hand units across all SKUs"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Wipe & Start Fresh (0 Orders)</span>
            </Button>
          </div>
        </div>

        {/* Sliders and Playback Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-5">
          {/* Slider 1: Total Orders */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-semibold text-slate-300">Order Volume</label>
              <span className="text-xs font-mono font-bold text-brand-400">{totalOrders} orders</span>
            </div>
            <input
              type="range"
              min={5}
              max={150}
              step={5}
              disabled={isRunning}
              value={totalOrders}
              onChange={(e) => {
                setTotalOrders(Number(e.target.value));
                handleReset();
              }}
              className="w-full accent-brand-500 cursor-pointer"
            />
            <span className="text-[10px] text-slate-400">Total synthetic customers</span>
          </div>

          {/* Slider 2: Duration */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-semibold text-slate-300">Surge Duration</label>
              <span className="text-xs font-mono font-bold text-amber-400">{durationMinutes} minutes</span>
            </div>
            <input
              type="range"
              min={1}
              max={30}
              step={1}
              disabled={isRunning}
              value={durationMinutes}
              onChange={(e) => {
                setDurationMinutes(Number(e.target.value));
                handleReset();
              }}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <span className="text-[10px] text-slate-400">Virtual time window</span>
          </div>

          {/* Speed Multiplier */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">Playback Speed</label>
            <div className="grid grid-cols-4 gap-1.5">
              {[1, 5, 10, 25].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`py-1.5 text-xs font-mono rounded-lg border font-semibold transition-colors ${
                    playbackSpeed === spd
                      ? 'bg-brand-500/20 border-brand-500 text-brand-300'
                      : 'bg-navy-850 border-navy-750 text-slate-400 hover:text-white'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
            <span className="text-[10px] text-slate-400 block mt-1">Real-time accelerator</span>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex items-center gap-2.5 pt-3 md:pt-0">
            <Button
              id="btn-toggle-surge"
              onClick={handleTogglePlay}
              className={`flex-1 font-semibold flex items-center justify-center gap-2 ${
                isRunning
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/25'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25'
              }`}
            >
              {isRunning ? (
                <>
                  <Pause className="w-4 h-4 fill-white" /> Pause
                </>
              ) : isFinished ? (
                <>
                  <RotateCcw className="w-4 h-4" /> Restart
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" /> Start Surge
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleReset}
              className="border-navy-700 text-slate-300 hover:bg-navy-800"
              title="Reset Surge Arena"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Real-Time Scorecard HUD */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Metric 1: Orders Ingested */}
        <Card className="border-navy-750 bg-navy-900/90">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Progress</span>
              <Activity className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-white">
              {ordersProcessed} <span className="text-xs text-slate-400 font-normal">/ {totalOrders}</span>
            </div>
            <div className="w-full bg-navy-800 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-brand-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${(ordersProcessed / Math.max(1, totalOrders)) * 100}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Metric 2: Virtual Clock */}
        <Card className="border-navy-750 bg-navy-900/90">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Virtual Clock</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-amber-300">
              {formatTime(elapsedVirtualSeconds)}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              of {formatTime(durationMinutes * 60)} ({playbackSpeed}x speed)
            </div>
          </CardContent>
        </Card>

        {/* Metric 3: Total Time Saved */}
        <Card className="border-navy-750 bg-navy-900/90">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Time Saved</span>
              <TrendingDown className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              +{totalTimeSaved.toFixed(1)} <span className="text-xs">min</span>
            </div>
            <div className="text-[10px] text-emerald-400/80 mt-1">Delivery delay averted</div>
          </CardContent>
        </Card>

        {/* Metric 4: Courier Distance Saved */}
        <Card className="border-navy-750 bg-navy-900/90">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Distance Saved</span>
              <Layers className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-cyan-300">
              {totalDistanceSaved.toFixed(1)} <span className="text-xs">km</span>
            </div>
            <div className="text-[10px] text-cyan-400/80 mt-1">Courier mileage reduced</div>
          </CardContent>
        </Card>

        {/* Metric 5: Stockouts Averted */}
        <Card className="border-navy-750 bg-navy-900/90">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Stockouts Saved</span>
              <ShieldCheck className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-purple-300">
              {stockoutsAvertedCount} <span className="text-xs">orders</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">Rerouted from empty shelves</div>
          </CardContent>
        </Card>

        {/* Metric 6: Turnaround Time Comparison */}
        <Card className="border-navy-750 bg-navy-900/90">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Avg Turnaround</span>
              <Gauge className="w-4 h-4 text-rose-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold font-mono text-emerald-400">
                {avgSmartTurnaround > 0 ? avgSmartTurnaround.toFixed(1) : '--'}m
              </span>
              <span className="text-xs line-through text-slate-500 font-mono">
                {avgNaiveTurnaround > 0 ? avgNaiveTurnaround.toFixed(1) : '--'}m
              </span>
            </div>
            <div className="text-[10px] text-emerald-400 font-semibold mt-1">
              {avgNaiveTurnaround > 0
                ? `-${Math.round(((avgNaiveTurnaround - avgSmartTurnaround) / avgNaiveTurnaround) * 100)}% faster`
                : 'Awaiting orders'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dark Stores Live Operations Fleet Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white tracking-wide uppercase flex items-center gap-2">
            <Store className="w-4 h-4 text-cyan-400" />
            Network Dark Stores — Real-Time Telemetry & Surge Burn Rate
          </h3>
          <span className="text-xs text-slate-400">3 Active Urban Fulfillment Hubs (PostgreSQL Connected)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stores.map((store) => {
            const currentTotalStock = Object.values(store.inventory).reduce((a, b) => a + b, 0);
            const stockPct = Math.round((currentTotalStock / store.initial_stock) * 100);

            return (
              <Card
                key={store.store_id}
                className={`border transition-all ${
                  store.is_critical
                    ? 'border-rose-500/60 bg-rose-950/20 shadow-lg shadow-rose-950/30'
                    : 'border-navy-750 bg-navy-900/90'
                }`}
              >
                <CardContent className="p-5 space-y-4">
                  {/* Store Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{store.store_name}</span>
                      </div>
                      <span className="text-[11px] text-slate-400 block mt-0.5">{store.neighborhood}</span>
                    </div>
                    {store.is_critical ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                        <AlertTriangle className="w-3 h-3 text-rose-400" /> CRITICAL
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        HEALTHY
                      </span>
                    )}
                  </div>

                  {/* Stock Level Bar */}
                  <div>
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="text-slate-400">Shelf Inventory Level</span>
                      <span
                        className={`font-mono font-bold ${
                          stockPct < 25 ? 'text-rose-400' : stockPct < 50 ? 'text-amber-400' : 'text-emerald-400'
                        }`}
                      >
                        {currentTotalStock} units ({stockPct}%)
                      </span>
                    </div>
                    <div className="w-full bg-navy-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          stockPct < 25
                            ? 'bg-rose-500 animate-pulse'
                            : stockPct < 50
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, stockPct))}%` }}
                      />
                    </div>
                  </div>

                  {/* Picking Queue & Burn Rate Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-navy-850 p-2.5 rounded-lg border border-navy-750">
                      <span className="text-[10px] text-slate-400 block mb-0.5">Picking Queue</span>
                      <span className="text-sm font-bold font-mono text-cyan-300">
                        {store.active_queue} orders
                      </span>
                      <span className="text-[9px] text-slate-400 block mt-0.5">
                        {store.picker_count} active pickers
                      </span>
                    </div>

                    <div className="bg-navy-850 p-2.5 rounded-lg border border-navy-750">
                      <span className="text-[10px] text-slate-400 block mb-0.5">Burn Velocity</span>
                      <span
                        className={`text-sm font-bold font-mono ${
                          store.burn_rate > 10 ? 'text-rose-400' : 'text-amber-300'
                        }`}
                      >
                        {store.burn_rate.toFixed(1)} u/min
                      </span>
                      <span className="text-[9px] text-slate-400 block mt-0.5">
                        Runway: {store.stock_runway_minutes < 90 ? `${store.stock_runway_minutes}m` : '>1h'}
                      </span>
                    </div>
                  </div>

                  {/* Emergency Restock Button */}
                  <Button
                    size="sm"
                    onClick={() => handleEmergencyRestock(store.store_id)}
                    className={`w-full text-xs font-semibold flex items-center justify-center gap-1.5 py-2 ${
                      store.is_critical
                        ? 'bg-rose-600 hover:bg-rose-500 text-white animate-bounce'
                        : 'bg-navy-800 hover:bg-navy-750 border border-navy-700 text-cyan-300'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Inbound & Restock (+50 Units)
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Dual Real-Time Allocation Stream */}
      <div className="bg-navy-900 border border-navy-750 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide uppercase flex items-center gap-2">
              <Layers className="w-4 h-4 text-brand-400" />
              Live Order Stream & Dual Allocation Verdict (Naive vs Smart)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Every incoming order is persisted to PostgreSQL and evaluated in real time: comparing blind nearest assignment against workload-balanced
              optimization.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400 font-semibold">
            {evaluatedOrders.length} decisions recorded
          </span>
        </div>

        {evaluatedOrders.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-navy-800 rounded-xl">
            <Flame className="w-8 h-8 text-slate-500 mx-auto mb-2 opacity-50" />
            <p className="text-sm text-slate-400">Click &ldquo;Start Surge&rdquo; to launch customer order arrivals.</p>
            <span className="text-xs text-slate-500 mt-1 block">
              Watch allocation decisions, inventory consumption, and real PostgreSQL order creations.
            </span>
          </div>
        ) : (
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
            {evaluatedOrders.map((item) => (
              <div
                key={item.order.id}
                className="bg-navy-850 border border-navy-750 hover:border-navy-700 rounded-xl p-4 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 pb-2 border-b border-navy-800">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono font-bold text-xs text-brand-400">#{item.order.id}</span>
                    <span className="text-xs font-semibold text-white">{item.order.customer_name}</span>
                    <span className="text-[11px] text-slate-400">
                      ({item.order.customer_latitude}, {item.order.customer_longitude})
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono border border-emerald-500/20">
                      PG: {item.persisted_order_id ? `#${item.persisted_order_id.slice(0, 8)}` : 'Persisted'}
                    </span>
                  </div>

                  {item.time_saved_minutes > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      <Zap className="w-3 h-3 text-emerald-400" /> +{item.time_saved_minutes} min saved!
                    </span>
                  )}
                </div>

                {/* Basket Items */}
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold mr-1">Basket:</span>
                  {item.order.items.map((i, iIdx) => (
                    <span
                      key={iIdx}
                      className="px-2 py-0.5 rounded text-[11px] bg-navy-800 text-slate-300 border border-navy-700"
                    >
                      {i.quantity}x {i.sku_name}
                    </span>
                  ))}
                </div>

                {/* Side-by-Side Dual Comparison Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mb-3">
                  {/* Branch A: Naive */}
                  <div className="bg-navy-900/80 p-3 rounded-lg border border-navy-750">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-slate-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-slate-500" />
                        Naive Nearest Assignment
                      </span>
                      <span className="font-mono font-bold text-slate-300">
                        {item.naive.total_turnaround_minutes}m turnaround
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300 font-medium">{item.naive.store_name}</div>
                    <div className="text-[10px] text-slate-400 mt-1 flex flex-wrap gap-2">
                      <span>Travel: {item.naive.travel_minutes}m ({item.naive.travel_distance_km}km)</span>
                      <span>Queue Wait: +{item.naive.queue_wait_minutes}m</span>
                      {item.naive.has_stockout && (
                        <span className="text-rose-400 font-semibold">Stockout Penalty: +25m</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1.5 italic bg-navy-850/60 p-1.5 rounded">
                      {item.naive.rationale}
                    </div>
                  </div>

                  {/* Branch B: Smart */}
                  <div className="bg-navy-900/80 p-3 rounded-lg border border-emerald-500/30 shadow-sm">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        OR-Tools Smart Allocation
                      </span>
                      <span className="font-mono font-bold text-emerald-300">
                        {item.smart.total_turnaround_minutes}m turnaround
                      </span>
                    </div>
                    <div className="text-[11px] text-white font-medium">{item.smart.store_name}</div>
                    <div className="text-[10px] text-slate-300 mt-1 flex flex-wrap gap-2">
                      <span>Travel: {item.smart.travel_minutes}m ({item.smart.travel_distance_km}km)</span>
                      <span>Queue Wait: +{item.smart.queue_wait_minutes}m</span>
                      <span className="text-emerald-400 font-semibold">Full Stock Available</span>
                    </div>
                    <div className="text-[10px] text-emerald-300/90 mt-1.5 bg-emerald-500/10 p-1.5 rounded border border-emerald-500/20">
                      {item.smart.rationale}
                    </div>
                  </div>
                </div>

                {/* Direct Action Link to Warehouse 2D Layout & Store Map */}
                <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-navy-800">
                  <Link
                    to={`/warehouse?orderId=${item.persisted_order_id || item.order.id}&storeId=${item.smart.store_id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/30 transition-colors shadow-sm"
                  >
                    <Grid className="w-3.5 h-3.5 text-cyan-400" />
                    <span>View in Warehouse 2D Layout</span>
                    <ArrowRight className="w-3 h-3 text-cyan-400" />
                  </Link>

                  <Link
                    to="/network"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30 transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    <span>View on Store Map</span>
                  </Link>

                  <div className="ml-auto flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Assigned Hub: {item.smart.store_name}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
