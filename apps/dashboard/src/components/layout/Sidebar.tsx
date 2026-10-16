import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Boxes,
  Truck,
  ShoppingBag,
  Grid,
  MapPin,
  BarChart3,
  X,
  Layers,
  FlaskConical,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  id: string;
}

const navItems: NavItem[] = [
  {
    to: '/overview',
    label: 'Operations Overview',
    icon: <LayoutDashboard className="w-4 h-4" />,
    id: 'nav-overview',
  },
  {
    to: '/inventory',
    label: 'Inventory Manager',
    icon: <Boxes className="w-4 h-4" />,
    id: 'nav-inventory',
  },
  {
    to: '/replenishment',
    label: 'Replenishment',
    icon: <Truck className="w-4 h-4" />,
    id: 'nav-replenishment',
  },
  {
    to: '/orders',
    label: 'Order Operations',
    icon: <ShoppingBag className="w-4 h-4" />,
    id: 'nav-orders',
  },
  {
    to: '/warehouse',
    label: 'Warehouse & Routes',
    icon: <Grid className="w-4 h-4" />,
    id: 'nav-warehouse',
  },
  {
    to: '/stores',
    label: 'Store Network Map',
    icon: <MapPin className="w-4 h-4" />,
    id: 'nav-stores',
  },
  {
    to: '/simulations',
    label: 'Simulation Lab',
    icon: <FlaskConical className="w-4 h-4" />,
    id: 'nav-simulations',
  },
  {
    to: '/evaluations',
    label: 'Policy Evaluation',
    icon: <BarChart3 className="w-4 h-4" />,
    id: 'nav-evaluations',
  },
];

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        id="app-sidebar"
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-navy-900 border-r border-navy-750/80 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Main Navigation"
      >
        {/* Brand Header */}
        <div className="h-16 px-5 border-b border-navy-750/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-500 to-cyan-400 flex items-center justify-center font-bold text-white shadow-lg shadow-brand-500/25">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                DarkOps AI
                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  CT
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">Control Tower v1.0</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800"
            aria-label="Close navigation sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Operations & Control
          </div>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              id={item.id}
              onClick={() => {
                if (window.innerWidth < 1024) onClose();
              }}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-brand-500/15 text-cyan-300 border border-brand-500/30 shadow-sm shadow-brand-500/10'
                    : 'text-slate-300 hover:text-white hover:bg-navy-800/60'
                }`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* System Footer info */}
        <div className="p-4 border-t border-navy-750/80 bg-navy-950/40 text-[11px] text-slate-400 flex items-center justify-between">
          <div>
            <div className="text-slate-300 font-medium">Synthetic Q-Commerce</div>
            <div className="text-[10px] text-slate-400">Deterministic Engine</div>
          </div>
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="System Online" />
        </div>
      </aside>
    </>
  );
};
