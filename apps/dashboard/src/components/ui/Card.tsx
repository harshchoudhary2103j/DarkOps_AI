import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '', id }) => {
  return (
    <div
      id={id}
      className={`bg-navy-900 border border-navy-750/80 rounded-xl shadow-xl shadow-black/20 overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
};

interface CardHeaderProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  description,
  badge,
  action,
  icon,
  className = '',
}) => {
  return (
    <div className={`p-4 md:p-5 border-b border-navy-750/80 flex items-center justify-between gap-4 ${className}`}>
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className="p-2 rounded-lg bg-navy-800 text-cyan-400 border border-navy-700/60 shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {title && <h3 className="text-sm font-semibold text-white tracking-tight truncate">{title}</h3>}
            {badge}
          </div>
          {description && <p className="text-xs text-slate-400 mt-0.5 truncate">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

export const CardContent: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return <div className={`p-4 md:p-5 ${className}`}>{children}</div>;
};

export const CardFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`p-3 md:p-4 bg-navy-950/40 border-t border-navy-750/60 text-xs text-slate-400 ${className}`}>
      {children}
    </div>
  );
};
