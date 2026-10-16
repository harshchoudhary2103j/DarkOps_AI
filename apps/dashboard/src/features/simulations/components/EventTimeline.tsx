import React, { useState } from 'react';
import {
  Activity,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Info,
} from 'lucide-react';
import { SimulationEvent, SimulationRunStatus } from '../../../types/domain';
import { useSimulationEvents } from '../hooks/useSimulationEvents';

interface EventTimelineProps {
  runId: string;
  runStatus: SimulationRunStatus;
}

const COMMON_EVENT_TYPES = [
  'ALL',
  'CUSTOMER_ORDER_ARRIVED',
  'ORDER_ALLOCATED',
  'STOCK_RESERVED',
  'PICKING_STARTED',
  'ITEM_PICKED',
  'PICKING_COMPLETED',
  'SUPPLIER_DELIVERY_DUE',
  'STOCK_RECEIVED',
  'ORDER_CANCELLED',
];

export const EventTimeline: React.FC<EventTimelineProps> = ({ runId, runStatus }) => {
  const [selectedType, setSelectedType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});
  const limit = 25;

  const { data, isLoading } = useSimulationEvents({
    runId,
    runStatus,
    eventType: selectedType !== 'ALL' ? selectedType : undefined,
    search: searchQuery ? searchQuery.trim() : undefined,
    limit,
    offset,
  });

  const events = data?.data || [];
  const total = data?.pagination?.total || 0;
  const hasMore = data?.pagination?.has_more || false;

  const toggleExpand = (id: string) => {
    setExpandedEvents((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const formatEventTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toISOString().replace('T', ' ').replace('Z', ' UTC');
    } catch {
      return ts;
    }
  };

  const getEventBadgeClass = (type: string) => {
    if (type.includes('ARRIVED')) return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    if (type.includes('ALLOCATED')) return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
    if (type.includes('RESERVED') || type.includes('RECEIVED')) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    if (type.includes('PICKING') || type.includes('PICKED')) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    if (type.includes('DELIVERY')) return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    if (type.includes('CANCELLED') || type.includes('FAILED')) return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    return 'bg-navy-750 text-slate-300 border-navy-700';
  };

  return (
    <div className="bg-navy-900 border border-navy-750 rounded-xl p-5 shadow-sm space-y-4" id="event-timeline-container">
      {/* Timeline Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-navy-750 pb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white tracking-wide uppercase">
            Simulation Event Stream
          </h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-navy-800 text-slate-300 font-mono">
            {total} events
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              id="input-timeline-search"
              type="text"
              placeholder="Search order/payload..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setOffset(0);
              }}
              className="bg-navy-850 border border-navy-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 w-44"
            />
          </div>

          {/* Type Filter */}
          <div className="relative">
            <select
              id="select-event-type-filter"
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setOffset(0);
              }}
              className="bg-navy-850 border border-navy-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500 pr-8"
            >
              {COMMON_EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === 'ALL' ? 'All Event Types' : t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Transport Notice */}
      <div className="bg-navy-850/60 border border-navy-750/70 rounded-lg px-3.5 py-2 text-[11px] text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>
            Persisted event feed queried from PostgreSQL. Polling is active while simulation is{' '}
            <strong className="text-cyan-300">RUNNING</strong> and paused when terminal.
          </span>
        </div>
        {runStatus === 'RUNNING' && (
          <span className="flex items-center gap-1.5 text-cyan-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            Live Polling (2s)
          </span>
        )}
      </div>

      {/* Events List */}
      {isLoading ? (
        <div className="py-12 text-center text-xs text-slate-400">Loading simulation events...</div>
      ) : events.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400">
          No simulation events found matching the selected filter criteria.
        </div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1" id="timeline-events-list">
          {events.map((ev: SimulationEvent) => {
            const isExpanded = Boolean(expandedEvents[ev.id]);
            return (
              <div
                key={ev.id}
                className="bg-navy-850/80 hover:bg-navy-850 border border-navy-750/80 rounded-lg p-3 transition-colors text-xs"
                id={`event-row-${ev.sequence_number}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="font-mono text-[10px] text-slate-500 mt-0.5 shrink-0">
                      #{ev.sequence_number}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono border ${getEventBadgeClass(
                            ev.event_type
                          )}`}
                        >
                          {ev.event_type}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          {formatEventTimestamp(ev.virtual_timestamp)}
                        </span>
                      </div>
                      <div className="text-slate-300 font-mono text-[11px] truncate max-w-xl">
                        {JSON.stringify(ev.payload || {})}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleExpand(ev.id)}
                    className="text-slate-400 hover:text-white p-1 shrink-0"
                    title="Toggle JSON details"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Expanded JSON Inspector */}
                {isExpanded && (
                  <div className="mt-3 pt-2.5 border-t border-navy-750/60 font-mono text-[11px] text-slate-300 space-y-1.5">
                    <div className="flex items-center justify-between text-slate-400 text-[10px]">
                      <span>Event ID: {ev.id}</span>
                      <span>Priority: {ev.priority}</span>
                      <span>Status: {ev.status}</span>
                    </div>
                    {ev.error_message && (
                      <div className="text-rose-400 bg-rose-500/10 p-2 rounded border border-rose-500/20">
                        Error: {ev.error_message}
                      </div>
                    )}
                    <pre className="bg-navy-950 p-2.5 rounded border border-navy-750 text-cyan-300 overflow-x-auto">
                      {JSON.stringify(ev.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      <div className="flex items-center justify-between pt-3 border-t border-navy-750 text-xs text-slate-400">
        <div>
          Showing {events.length > 0 ? offset + 1 : 0} to {Math.min(total, offset + limit)} of{' '}
          <strong className="text-white">{total}</strong> events
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-2.5 py-1 rounded bg-navy-800 border border-navy-750 hover:bg-navy-750 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Previous
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={!hasMore}
            className="px-2.5 py-1 rounded bg-navy-800 border border-navy-750 hover:bg-navy-750 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
