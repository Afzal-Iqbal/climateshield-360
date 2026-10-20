import React, { useState } from 'react';

export interface Column<T> {
  key: string;
  header: string | React.ReactNode;
  render?: (item: T, index: number) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  emptyMessage?: string;
  className?: string;
  stickyHeader?: boolean;
  onRowClick?: (item: T) => void;
}

export function Table<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'No records found',
  className = '',
  stickyHeader = true,
  onRowClick,
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedData = React.useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return sortDir === 'asc'
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });
  }, [data, sortKey, sortDir]);

  return (
    <div className={`w-full overflow-x-auto custom-scrollbar rounded-xl border border-white/10 dark:border-white/10 border-slate-200 ${className}`}>
      <table className="w-full text-left border-collapse text-xs sm:text-sm">
        <thead
          className={`${
            stickyHeader ? 'sticky top-0 z-10' : ''
          } bg-slate-900/90 dark:bg-slate-900/90 bg-slate-100 backdrop-blur-md text-slate-400 dark:text-slate-400 text-slate-600 font-mono-val border-b border-white/10 dark:border-white/10 border-slate-200`}
        >
          <tr>
            {columns.map((col) => {
              const isCurrentSort = sortKey === col.key;
              const alignClass =
                col.align === 'right'
                  ? 'text-right'
                  : col.align === 'center'
                  ? 'text-center'
                  : 'text-left';

              return (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={`px-3.5 py-3 font-semibold uppercase tracking-wider text-[11px] ${alignClass} ${
                    col.sortable ? 'cursor-pointer select-none hover:text-white transition-colors' : ''
                  }`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div
                    className={`inline-flex items-center gap-1.5 ${
                      col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'
                    }`}
                  >
                    <span>{col.header}</span>
                    {col.sortable && (
                      <span className="material-symbols-outlined text-[14px]">
                        {isCurrentSort
                          ? sortDir === 'asc'
                            ? 'arrow_upward'
                            : 'arrow_downward'
                          : 'unfold_more'}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 dark:divide-white/5 divide-slate-200 bg-slate-950/40 dark:bg-slate-950/40 bg-white">
          {sortedData.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-slate-500 font-body text-xs"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((item, idx) => (
              <tr
                key={keyExtractor(item, idx)}
                onClick={() => onRowClick && onRowClick(item)}
                className={`transition-colors ${
                  onRowClick ? 'cursor-pointer hover:bg-white/5 dark:hover:bg-white/5 hover:bg-slate-50' : 'hover:bg-white/[0.02]'
                }`}
              >
                {columns.map((col) => {
                  const alignClass =
                    col.align === 'right'
                      ? 'text-right font-mono-val'
                      : col.align === 'center'
                      ? 'text-center'
                      : 'text-left';

                  return (
                    <td
                      key={col.key}
                      className={`px-3.5 py-3 text-slate-300 dark:text-slate-300 text-slate-800 ${alignClass}`}
                    >
                      {col.render ? col.render(item, idx) : item[col.key] ?? '—'}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
