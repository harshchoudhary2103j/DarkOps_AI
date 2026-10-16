import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { ToastProvider } from './components/feedback/ToastProvider';
import { AppShell } from './components/layout/AppShell';

import { OverviewPage } from './features/overview/OverviewPage';
import { InventoryPage } from './features/inventory/InventoryPage';
import { ReplenishmentPage } from './features/replenishment/ReplenishmentPage';
import { OrdersPage } from './features/orders/OrdersPage';
import { WarehousePage } from './features/warehouse/WarehousePage';
import { StoresPage } from './features/stores/StoresPage';
import { EvaluationsPage } from './features/evaluations/EvaluationsPage';
import { SimulationLabPage } from './features/simulations/pages/SimulationLabPage';

export const App: React.FC = () => {
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route
              element={
                <AppShell
                  selectedStoreId={selectedStoreId}
                  onSelectStore={setSelectedStoreId}
                />
              }
            >
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/overview" element={<OverviewPage selectedStoreId={selectedStoreId} />} />
              <Route path="/inventory" element={<InventoryPage selectedStoreId={selectedStoreId} />} />
              <Route
                path="/replenishment"
                element={<ReplenishmentPage selectedStoreId={selectedStoreId} />}
              />
              <Route path="/orders" element={<OrdersPage selectedStoreId={selectedStoreId} />} />
              <Route
                path="/warehouse"
                element={<WarehousePage selectedStoreId={selectedStoreId} />}
              />
              <Route
                path="/stores"
                element={
                  <StoresPage
                    selectedStoreId={selectedStoreId}
                    onSelectStore={setSelectedStoreId}
                  />
                }
              />
              <Route path="/evaluations" element={<EvaluationsPage />} />
              <Route path="/simulations" element={<SimulationLabPage />} />
              <Route path="*" element={<Navigate to="/overview" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
};

export default App;
