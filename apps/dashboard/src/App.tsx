import React from 'react';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-100 flex flex-col justify-between p-6 md:p-12">
      <header className="flex justify-between items-center border-b border-gray-800 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/30">
            D
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">DarkOps AI</h1>
            <p className="text-xs text-gray-400">Decision-Support & Simulation Platform</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-xs font-medium text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full bg-emerald-500/10">
            Bootstrap Active
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto my-auto text-center py-12 px-4">
        <div className="inline-block mb-4 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
          Phase 00 Foundation
        </div>
        <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-4">
          Quick-Commerce Dark Store Operations Control
        </h2>
        <p className="text-base md:text-lg text-gray-400 max-w-2xl mx-auto mb-8">
          Modular decision-support, discrete-event simulation, deterministic inventory replenishment, and AI operations copilot.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
          <div className="bg-[#111827] border border-gray-800 p-5 rounded-xl">
            <div className="text-blue-400 font-semibold mb-1">Operational API</div>
            <div className="text-xs text-gray-400">Node.js + Express backend managing orders, stock ledger, and inventory reservations.</div>
          </div>
          <div className="bg-[#111827] border border-gray-800 p-5 rounded-xl">
            <div className="text-purple-400 font-semibold mb-1">Optimization Service</div>
            <div className="text-xs text-gray-400">Python + FastAPI + OR-Tools solving replenishment, allocation, and picker routing.</div>
          </div>
          <div className="bg-[#111827] border border-gray-800 p-5 rounded-xl">
            <div className="text-emerald-400 font-semibold mb-1">Simulation Worker</div>
            <div className="text-xs text-gray-400">Discrete-event virtual clock scheduling synthetic demand and reproducible evaluations.</div>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-800 pt-4 flex flex-col sm:flex-row justify-between text-xs text-gray-500">
        <div>DarkOps AI Operations Control Center</div>
        <div>Simulated Environment &bull; Synthetic World &bull; Deterministic Optimizers</div>
      </footer>
    </div>
  );
};

export default App;
