// ============================================================================
// File: src/components/copilot/CopilotTriggerButton.tsx
// Description: Floating Action Button (FAB) and Topbar trigger for AI Copilot.
// ============================================================================

import React from 'react';
import { Bot, Sparkles } from 'lucide-react';

interface CopilotTriggerButtonProps {
  onClick: () => void;
  isOpen: boolean;
}

export const CopilotTriggerButton: React.FC<CopilotTriggerButtonProps> = ({
  onClick,
  isOpen
}) => {
  if (isOpen) return null;

  return (
    <button
      onClick={onClick}
      id="btn-open-copilot"
      aria-label="Open AI Operations Copilot"
      className="fixed bottom-6 right-6 z-40 group flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 text-white font-medium text-sm shadow-xl shadow-cyan-950/80 hover:shadow-cyan-500/25 border border-cyan-400/40 hover:scale-105 transition-all duration-200"
    >
      <div className="relative flex items-center justify-center">
        <Bot className="w-5 h-5 text-white" />
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-navy-950 animate-pulse" />
      </div>
      <span className="font-semibold tracking-wide">AI Copilot</span>
      <Sparkles className="w-4 h-4 text-cyan-200 group-hover:rotate-12 transition-transform" />
    </button>
  );
};
