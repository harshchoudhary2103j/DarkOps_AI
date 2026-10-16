import React from 'react';
import { AlertCircle } from 'lucide-react';

export const SyntheticBanner: React.FC = () => {
  return (
    <aside
      id="synthetic-env-banner"
      aria-label="Synthetic Environment Notice"
      className="bg-gradient-to-r from-amber-950/90 via-amber-900/90 to-amber-950/90 border-b border-amber-500/40 px-4 py-2 text-amber-200 text-xs font-medium flex items-center justify-center gap-2 select-none z-40 sticky top-0 backdrop-blur-md shadow-md"
    >
      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" aria-hidden="true" />
      <span className="text-center font-semibold tracking-wide">
        Operating in Synthetic Quick-Commerce Environment — All data and metrics are simulated.
      </span>
    </aside>
  );
};
