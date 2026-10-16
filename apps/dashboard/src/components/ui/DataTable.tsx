import React from 'react';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';
import { Button } from './Button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (item: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  page?: number;
  totalPages?: number;
  onPageChange?: (newPage: number) => void;
  className?: string;
  id?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  emptyTitle,
  emptyDescription,
  page,
  totalPages,
  onPageChange,
  className = '',
  id,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className={`border border-navy-750/80 rounded-xl overflow-hidden bg-navy-900 ${className}`}>
        <div className="p-4 space-y-3">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-10 w-full" count={5} />
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={`border border-navy-750/80 rounded-xl overflow-hidden bg-navy-900 p-4 ${className}`}>
        <EmptyState title={emptyTitle} description={emptyDescription} id={id ? `${id}-empty` : undefined} />
      </div>
    );
  }

  return (
    <div id={id} className={`border border-navy-750/80 rounded-xl overflow-hidden bg-navy-900 ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-navy-950/60 border-b border-navy-750/80 text-slate-400 font-medium">
              {columns.map((col) => {
                const alignClass =
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={{ width: col.width }}
                    className={`px-4 py-3 font-semibold text-slate-300 uppercase tracking-wider text-[11px] ${alignClass} ${col.className || ''}`}
                  >
                    {col.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-750/50">
            {data.map((item, idx) => {
              const rowKey = keyExtractor(item, idx);
              return (
                <tr
                  key={rowKey}
                  className="hover:bg-navy-800/40 transition-colors duration-100 group"
                >
                  {columns.map((col) => {
                    const alignClass =
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
                    return (
                      <td
                        key={`${rowKey}-${col.key}`}
                        className={`px-4 py-3 text-slate-200 align-middle ${alignClass} ${col.className || ''}`}
                      >
                        {col.render ? col.render(item, idx) : (item as any)[col.key] ?? '—'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages !== undefined && totalPages > 1 && page !== undefined && onPageChange && (
        <div className="px-4 py-3 bg-navy-950/40 border-t border-navy-750/80 flex items-center justify-between text-xs text-slate-400">
          <div>
            Page <span className="font-semibold text-white">{page}</span> of{' '}
            <span className="font-semibold text-white">{totalPages}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous Page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              aria-label="Next Page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
