'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * The admin table (Phase 5 — W25.3).
 *
 * Lives in `components/admin/ui/` and never in `components/ui/`: that folder
 * is the traveller-facing kit, mobile-first and rounded, and a table is
 * neither. Sharing one component between the two surfaces would mean every
 * future change to it has to be right for both — which is how design systems
 * end up with props nobody can explain.
 *
 * Sorting is client-side and deliberately so. These screens page from the API;
 * sorting the page you are looking at is what "click the column" means to
 * somebody scanning fifty rows, and a round trip per click would be slower and
 * no more correct.
 */

export interface Column<Row> {
  key: string;
  header: string;
  /** What to render in the cell. */
  cell: (row: Row) => React.ReactNode;
  /**
   * What to sort on. Omit and the column is not sortable — which is the right
   * answer for a column of buttons.
   */
  sortBy?: (row: Row) => string | number;
  /** Figures right-align so their digits line up; text does not. */
  align?: 'left' | 'right';
  className?: string;
}

export function DataTable<Row>({
  rows,
  columns,
  rowKey,
  onRowClick,
  empty = 'ยังไม่มีข้อมูล',
  caption,
  className,
}: {
  rows: Row[];
  columns: Column<Row>[];
  rowKey: (row: Row) => string;
  /** Opens the detail drawer for this row. Omit for a read-only table. */
  onRowClick?: (row: Row) => void;
  empty?: string;
  /** Screen-reader description of what the table holds. */
  caption?: string;
  className?: string;
}) {
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortBy) return rows;

    // Copied before sorting: the array belongs to the query cache, and sorting
    // it in place mutates what every other reader of that cache sees.
    return [...rows].sort((a, b) => {
      const left = column.sortBy!(a);
      const right = column.sortBy!(b);
      const order =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), 'th');
      return sort.desc ? -order : order;
    });
  }, [rows, columns, sort]);

  function toggle(key: string) {
    setSort((current) =>
      current?.key === key ? { key, desc: !current.desc } : { key, desc: false },
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-brand bg-surface text-muted p-8 text-center text-sm">{empty}</div>
    );
  }

  return (
    // The table scrolls inside its own box rather than pushing the page
    // sideways — a horizontally scrolling admin page loses its sidebar.
    <div className={cn('rounded-brand bg-surface overflow-x-auto', className)}>
      <table className="w-full min-w-max border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}

        <thead>
          <tr className="border-border border-b">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={
                  sort?.key === column.key ? (sort.desc ? 'descending' : 'ascending') : 'none'
                }
                className={cn(
                  'text-muted px-4 py-3 text-[11px] font-medium tracking-[0.08em]',
                  column.align === 'right' ? 'text-right' : 'text-left',
                )}
              >
                {column.sortBy ? (
                  <button
                    type="button"
                    onClick={() => toggle(column.key)}
                    className={cn(
                      'hover:text-ink inline-flex items-center gap-1 transition',
                      column.align === 'right' && 'flex-row-reverse',
                    )}
                  >
                    {column.header}
                    <SortIcon active={sort?.key === column.key} desc={sort?.desc ?? false} />
                  </button>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-border/60 border-b last:border-0',
                onRowClick && 'hover:bg-bg/60 cursor-pointer transition',
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'text-ink px-4 py-3',
                    column.align === 'right' && 'nums text-right',
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortIcon({ active, desc }: { active: boolean; desc: boolean }) {
  if (!active) return <ChevronsUpDown className="size-3 opacity-40" />;
  return desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />;
}
