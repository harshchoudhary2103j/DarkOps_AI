import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { SyntheticBanner } from './SyntheticBanner';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CopilotDrawer } from '../copilot/CopilotDrawer';
import { CopilotTriggerButton } from '../copilot/CopilotTriggerButton';

const pageTitles: Record<string, string> = {
  '/overview': 'Operations Control Tower',
  '/inventory': 'Inventory & Stock Ledger',
  '/replenishment': 'Replenishment Recommendations',
  '/orders': 'Order Operations & Picking',
  '/warehouse': 'Warehouse 2D Layout & Routes',
  '/stores': 'Store Network Map & GeoJSON',
  '/evaluations': 'Simulation & Policy Evaluation',
};

export const AppShell: React.FC<{
  selectedStoreId: string;
  onSelectStore: (id: string) => void;
}> = ({ selectedStoreId, onSelectStore }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const location = useLocation();

  const currentPath = '/' + location.pathname.split('/')[1];
  const title = pageTitles[currentPath] || 'Operations Control Center';

  return (
    <div className="min-h-screen bg-navy-950 text-slate-100 flex flex-col font-sans">
      {/* 1. Persistent Synthetic Environment Banner */}
      <SyntheticBanner />

      <div className="flex-1 flex min-h-0">
        {/* 2. Responsive Navigation Sidebar */}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* 3. Main Content Wrapper */}
        <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
          <Topbar
            title={title}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            selectedStoreId={selectedStoreId}
            onSelectStore={onSelectStore}
            onToggleCopilot={() => setCopilotOpen((prev) => !prev)}
          />

          <main id="main-content" className="flex-1 p-4 md:p-8 max-w-[1600px] w-full mx-auto">
            <Outlet />
          </main>
        </div>
      </div>

      {/* 4. AI Operations Copilot Trigger & Drawer */}
      <CopilotTriggerButton onClick={() => setCopilotOpen(true)} isOpen={copilotOpen} />
      <CopilotDrawer
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        selectedStoreId={selectedStoreId}
      />
    </div>
  );
};
