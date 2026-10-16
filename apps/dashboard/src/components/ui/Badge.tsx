import React from 'react';

export type BadgeVariant =
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'blue'
  | 'indigo'
  | 'purple'
  | 'cyan'
  | 'slate';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
  id?: string;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string; border: string; dot: string }> = {
  emerald: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
    dot: 'bg-emerald-400',
  },
  amber: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/20',
    dot: 'bg-amber-400',
  },
  rose: {
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/20',
    dot: 'bg-rose-400',
  },
  blue: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/20',
    dot: 'bg-blue-400',
  },
  indigo: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-400',
    border: 'border-indigo-500/20',
    dot: 'bg-indigo-400',
  },
  purple: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/20',
    dot: 'bg-purple-400',
  },
  cyan: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/20',
    dot: 'bg-cyan-400',
  },
  slate: {
    bg: 'bg-slate-700/30',
    text: 'text-slate-300',
    border: 'border-slate-600/30',
    dot: 'bg-slate-400',
  },
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'slate',
  size = 'md',
  dot = false,
  className = '',
  id,
}) => {
  const styles = variantStyles[variant] || variantStyles.slate;
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      id={id}
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${styles.bg} ${styles.text} ${styles.border} ${sizeClasses} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} aria-hidden="true" />}
      {children}
    </span>
  );
};

export function getStatusBadgeVariant(status: string): BadgeVariant {
  switch (status?.toUpperCase()) {
    case 'ACTIVE':
    case 'PICKED':
    case 'DELIVERED':
    case 'COMPLETED':
    case 'APPROVED':
    case 'OPTIMAL':
      return 'emerald';
    case 'PENDING':
    case 'ALLOCATED':
    case 'IN_PROGRESS':
    case 'PICKING':
    case 'FEASIBLE':
      return 'amber';
    case 'INACTIVE':
    case 'CANCELLED':
    case 'FAILED':
    case 'REJECTED':
    case 'INFEASIBLE':
    case 'SHORT':
      return 'rose';
    case 'DISPATCHED':
    case 'EXECUTED':
      return 'cyan';
    default:
      return 'slate';
  }
}
