// ============================================================================
// File: src/components/copilot/CopilotDrawer.tsx
// Description: Interactive Sliding AI Copilot Chat Drawer with tool badges,
//              contextual prompts, and action approval integration.
// ============================================================================

import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Send,
  Bot,
  Sparkles,
  Zap,
  Building2,
  ChevronDown,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { CopilotActionCard, ActionProposalData } from './CopilotActionCard';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{
    tool_name: string;
    parameters: any;
    result?: any;
    actionProposal?: any;
    isMutating: boolean;
  }>;
  actionProposal?: ActionProposalData;
  timestamp: string;
}

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedStoreId?: string;
}

export const CopilotDrawer: React.FC<CopilotDrawerProps> = ({
  isOpen,
  onClose,
  selectedStoreId
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-init',
      role: 'assistant',
      content:
        "Hello! I'm your **DarkOps AI Operations Copilot**. I can inspect live store inventory, detect stockout risks under surge traffic, explain order allocations, and prepare emergency restock proposals.\n\nHow can I assist your dark store operations?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  const toggleToolExpand = (toolId: string) => {
    setExpandedTools((prev) => ({ ...prev, [toolId]: !prev[toolId] }));
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setLoading(true);

    try {
      // Build lightweight message history
      const history = messages.slice(-4).map((m) => ({
        role: m.role,
        content: m.content
      }));

      const res = await api.copilotChat({
        message: text,
        store_id: selectedStoreId,
        history
      });

      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: res.data.reply,
        toolCalls: res.data.toolCallsExecuted,
        actionProposal: res.data.actionProposal,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Operational API Error: ${err.message || 'Failed to communicate with Copilot service.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    'Check stockout risks for the next 12 hours',
    'What is the surge order pressure across stores?',
    'Propose emergency restock of 60 units of milk',
    'Why was order #ord-morning-rush-01 routed here?'
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <aside
          id="copilot-drawer"
          className="w-screen max-w-lg bg-navy-900 border-l border-navy-750 shadow-2xl flex flex-col text-slate-100"
          aria-label="AI Operations Copilot"
        >
          {/* Header */}
          <div className="p-4 border-b border-navy-750 flex items-center justify-between bg-navy-950/70">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-950 border border-cyan-400/30">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white tracking-wide">DarkOps AI Copilot</h2>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Online
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Two-Stage Human In The Loop Gated</span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              id="btn-close-copilot"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800 transition"
              aria-label="Close Copilot"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Active Store Context Indicator */}
          <div className="px-4 py-2 bg-navy-950/40 border-b border-navy-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-slate-300">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Active Scope:</span>
              <span className="font-mono text-cyan-300 font-medium">
                {selectedStoreId || 'All Dark Stores'}
              </span>
            </div>
            <span className="text-[10px] text-slate-400">Model: GPT-4o / Real-time Postgres</span>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="text-[10px] text-slate-400 mb-1 px-1">{msg.timestamp}</div>

                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-br-none shadow-md'
                      : 'bg-navy-800/90 text-slate-200 border border-navy-700/80 rounded-bl-none shadow-md'
                  }`}
                >
                  {/* Formatted Text Content */}
                  <div className="whitespace-pre-wrap font-sans">
                    {msg.content.split('\n').map((line, idx) => {
                      if (line.startsWith('• ') || line.startsWith('- ')) {
                        return (
                          <div key={idx} className="ml-2 my-0.5 text-slate-300 flex gap-1.5">
                            <span className="text-cyan-400 font-bold">•</span>
                            <span>{line.replace(/^([•-]\s*)/, '')}</span>
                          </div>
                        );
                      }
                      if (line.startsWith('**') && line.endsWith('**')) {
                        return (
                          <div key={idx} className="font-bold text-white mt-1 mb-0.5">
                            {line.replace(/\*\*/g, '')}
                          </div>
                        );
                      }
                      return <p key={idx} className={line.trim() === '' ? 'h-2' : ''}>{line}</p>;
                    })}
                  </div>

                  {/* Tool Call Pills */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-navy-700/60 space-y-1.5">
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-400" />
                        Backend Tools Executed
                      </div>
                      {msg.toolCalls.map((tc, tIdx) => {
                        const toolKey = `${msg.id}-tool-${tIdx}`;
                        const isExpanded = !!expandedTools[toolKey];
                        return (
                          <div
                            key={tIdx}
                            className="rounded bg-navy-950/70 border border-navy-750 text-xs overflow-hidden"
                          >
                            <button
                              onClick={() => toggleToolExpand(toolKey)}
                              className="w-full px-2.5 py-1.5 flex items-center justify-between text-left hover:bg-navy-900 transition text-[11px]"
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-cyan-300">{tc.tool_name}</span>
                                {tc.isMutating ? (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-semibold border border-amber-500/30">
                                    MUTATION PROPOSAL
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-semibold">
                                    READ-ONLY
                                  </span>
                                )}
                              </div>
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                              )}
                            </button>
                            {isExpanded && (
                              <pre className="p-2 bg-black/40 text-[10px] text-slate-300 font-mono overflow-x-auto border-t border-navy-800">
                                {JSON.stringify(tc.result || tc.actionProposal || tc.parameters, null, 2)}
                              </pre>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Two-Stage Action Proposal Card */}
                  {msg.actionProposal && (
                    <CopilotActionCard
                      proposal={msg.actionProposal}
                      onDecision={(_propId, status) => {
                        if (status === 'EXECUTED') {
                          setMessages((prev) => [
                            ...prev,
                            {
                              id: `dec-${Date.now()}`,
                              role: 'assistant',
                              content: `✓ **Action Verified & Executed in PostgreSQL!**\n\nThe physical inventory position has been updated and an immutable audit event was recorded.`,
                              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            }
                          ]);
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-start gap-2.5 text-slate-400 text-xs py-2">
                <div className="w-7 h-7 rounded-lg bg-navy-800 border border-navy-700 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-cyan-400 animate-spin" />
                </div>
                <div className="bg-navy-800/80 rounded-xl px-3.5 py-2 border border-navy-700/60 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span>Evaluating live operational state...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestion Chips */}
          <div className="px-4 py-2 border-t border-navy-800 bg-navy-950/40">
            <div className="text-[11px] font-medium text-slate-400 mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              Suggested Quick Inquiries
            </div>
            <div className="flex flex-wrap gap-1.5">
              {quickPrompts.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(p)}
                  disabled={loading}
                  className="px-2.5 py-1 rounded-full text-[11px] bg-navy-800 hover:bg-navy-750 text-slate-300 hover:text-white border border-navy-700 transition disabled:opacity-50 text-left truncate max-w-full"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Input Box */}
          <div className="p-4 border-t border-navy-750 bg-navy-950/80">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                id="copilot-input"
                placeholder="Ask about inventory, stockout risks, surge traffic, or order routes..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={loading}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-navy-900 border border-navy-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition disabled:opacity-50"
              />
              <button
                type="submit"
                id="btn-send-copilot"
                disabled={!inputValue.trim() || loading}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-sm transition shadow-lg shadow-cyan-950 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
};
