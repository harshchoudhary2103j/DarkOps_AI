import React from 'react';

interface SkeletonProps {
  className?: string;
  count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', count = 1 }) => {
  if (count > 1) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={`animate-pulse bg-navy-800/80 rounded-lg ${className}`}
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`animate-pulse bg-navy-800/80 rounded-lg ${className}`}
      aria-hidden="true"
    />
  );
};
