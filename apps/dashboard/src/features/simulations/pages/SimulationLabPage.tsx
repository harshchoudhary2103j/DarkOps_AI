import React from 'react';
import { Link } from 'react-router-dom';
import { Flame, Grid, MapPin, Database } from 'lucide-react';
import { InteractiveSurgeArena } from '../components/InteractiveSurgeArena';

export const SimulationLabPage: React.FC = () => {
  return (
    <div className="space-y-6" id="simulation-lab-page">
      {/* Top Page Header */}
      <div className="bg-navy-900 border border-navy-750 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center font-bold text-white shadow-lg shadow-rose-500/25">
              <Flame className="w-5 h-5 text-amber-200" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Interactive Surge Arena & Traffic Optimization
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold uppercase tracking-wider flex items-center gap-1">
              <Database className="w-3 h-3" /> Live Postgres Connected
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">
            Stream live quick-commerce surge traffic directly into PostgreSQL. Every arriving order executes real domain
            allocations, generates picking tasks mapped to warehouse shelf coordinates, and updates store network map telemetry in real-time.
          </p>
        </div>

        {/* Quick Links to Connected Operations */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/warehouse"
            className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-navy-800 hover:bg-navy-750 text-cyan-300 border border-navy-700 hover:border-cyan-500/50 flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Grid className="w-4 h-4 text-cyan-400" />
            <span>Warehouse 2D Layout</span>
          </Link>

          <Link
            to="/network"
            className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-navy-800 hover:bg-navy-750 text-amber-300 border border-navy-700 hover:border-amber-500/50 flex items-center gap-1.5 transition-all shadow-sm"
          >
            <MapPin className="w-4 h-4 text-amber-400" />
            <span>Store Network Map</span>
          </Link>
        </div>
      </div>

      {/* Flagship Interactive Surge Arena */}
      <InteractiveSurgeArena />
    </div>
  );
};
