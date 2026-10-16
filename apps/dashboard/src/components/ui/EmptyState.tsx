import React from 'react';
import { Inbox } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  actionText?: string;
  onAction?: () => void;
  className?: string;
  id?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No data available',
  description = 'There are no items matching the current filter criteria.',
  icon,
  actionText,
  onAction,
  className = '',
  id,
}) => {
  return (
    <div
      id={id}
      className={`flex flex-col items-center justify-center p-8 md:p-12 text-center border border-dashed border-navy-700/60 rounded-xl bg-navy-950/20 ${className}`}
    >
      <div className="w-12 h-12 rounded-xl bg-navy-800/80 border border-navy-700/60 flex items-center justify-center text-slate-400 mb-3.5 shadow-inner">
        {icon || <Inbox className="w-6 h-6" />}
      </div>
      <h4 className="text-sm font-semibold text-slate-200 mb-1">{title}</h4>
      <p className="text-xs text-slate-400 max-w-sm mb-4 leading-relaxed">{description}</p>
      {actionText && onAction && (
        <Button size="sm" variant="outline" onClick={onAction} id={`${id}-btn`}>
          {actionText}
        </Button>
      )}
    </div>
  );
};
