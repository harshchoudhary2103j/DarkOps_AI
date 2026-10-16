import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message?: string;
  code?: string;
  correlationId?: string;
  onRetry?: () => void;
  className?: string;
  id?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Failed to load operational data',
  message = 'An unexpected backend error occurred while fetching information.',
  code,
  correlationId,
  onRetry,
  className = '',
  id,
}) => {
  return (
    <div
      id={id}
      className={`p-6 border border-rose-500/30 bg-rose-500/5 rounded-xl text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3.5 min-w-0">
        <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 shrink-0 mt-0.5 sm:mt-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-rose-300">{title}</h4>
          <p className="text-xs text-rose-200/80 mt-0.5 leading-relaxed break-words">{message}</p>
          {(code || correlationId) && (
            <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400 font-mono">
              {code && <span>Code: {code}</span>}
              {correlationId && <span>Trace: {correlationId.slice(0, 8)}...</span>}
            </div>
          )}
        </div>
      </div>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          id={id ? `${id}-retry-btn` : undefined}
          className="shrink-0 border-rose-500/40 text-rose-200 hover:bg-rose-500/10"
        >
          Retry
        </Button>
      )}
    </div>
  );
};
