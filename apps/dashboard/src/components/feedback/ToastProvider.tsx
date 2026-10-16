import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (type: ToastType, title: string, message?: string, durationMs?: number) => void;
  showSuccess: (title: string, message?: string) => void;
  showError: (title: string, message?: string) => void;
  showWarning: (title: string, message?: string) => void;
  showInfo: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, title: string, message?: string, durationMs = 4500) => {
      const id = 'toast-' + Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, type, title, message, durationMs }]);

      if (durationMs > 0) {
        setTimeout(() => {
          removeToast(id);
        }, durationMs);
      }
    },
    [removeToast]
  );

  const showSuccess = useCallback((title: string, message?: string) => showToast('success', title, message), [showToast]);
  const showError = useCallback((title: string, message?: string) => showToast('error', title, message, 6000), [showToast]);
  const showWarning = useCallback((title: string, message?: string) => showToast('warning', title, message), [showToast]);
  const showInfo = useCallback((title: string, message?: string) => showToast('info', title, message), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showWarning, showInfo }}>
      {children}
      {/* Toast container floating bottom-right */}
      <div
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const typeConfigs = {
            success: {
              border: 'border-emerald-500/40',
              bg: 'bg-navy-900/95',
              icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />,
              titleColor: 'text-emerald-300',
            },
            error: {
              border: 'border-rose-500/40',
              bg: 'bg-navy-900/95',
              icon: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />,
              titleColor: 'text-rose-300',
            },
            warning: {
              border: 'border-amber-500/40',
              bg: 'bg-navy-900/95',
              icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />,
              titleColor: 'text-amber-300',
            },
            info: {
              border: 'border-cyan-500/40',
              bg: 'bg-navy-900/95',
              icon: <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />,
              titleColor: 'text-cyan-300',
            },
          }[toast.type];

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto p-4 rounded-xl border ${typeConfigs.border} ${typeConfigs.bg} shadow-2xl shadow-black/80 flex items-start gap-3 backdrop-blur-md transition-all duration-200 animate-in slide-in-from-bottom-3`}
              role="status"
            >
              {typeConfigs.icon}
              <div className="min-w-0 flex-1">
                <h5 className={`text-xs font-semibold ${typeConfigs.titleColor}`}>{toast.title}</h5>
                {toast.message && <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{toast.message}</p>}
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-white p-1 rounded transition-colors"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
