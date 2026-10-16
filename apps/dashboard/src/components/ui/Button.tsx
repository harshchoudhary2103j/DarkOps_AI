import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-500 hover:bg-brand-400 text-white font-medium shadow-lg shadow-brand-500/20 active:translate-y-0.5 border border-brand-400/30',
  secondary:
    'bg-navy-800 hover:bg-navy-750 text-slate-100 font-medium border border-navy-700 active:translate-y-0.5',
  outline:
    'bg-transparent hover:bg-navy-800 text-slate-200 border border-navy-600/60 active:translate-y-0.5',
  danger:
    'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 active:translate-y-0.5',
  ghost:
    'bg-transparent hover:bg-navy-800/60 text-slate-300 hover:text-white',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs rounded-lg gap-1.5',
  md: 'px-3.5 py-2 text-sm rounded-lg gap-2',
  lg: 'px-5 py-2.5 text-base rounded-xl gap-2.5',
  icon: 'p-2 rounded-lg',
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  disabled,
  className = '',
  id,
  type = 'button',
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400';

  return (
    <button
      id={id}
      type={type}
      disabled={disabled || isLoading}
      className={`${baseClasses} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" aria-hidden="true" />
      ) : (
        leftIcon
      )}
      {children}
      {!isLoading && rightIcon}
    </button>
  );
};
