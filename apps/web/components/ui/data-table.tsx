'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * DataTable. Governed by the design skill → Components → Tables, and by
 * references/component-inventory.md, which owns this signature.
 *
 * Horizontal hairline dividers only — no zebra striping, no vertical rules, no
 * shadow on the sticky header. Row actions are ghost buttons that are **always
 * visible**, never revealed on hover: hover does not exist on a tablet, which
 * is what a shop owner is holding.
 */

export type Column<T> = {
  key: keyof T & string
  header: string
  /**
   * Logical, never left/right. The type is what makes the RTL rule
   * unbreakable — a physical value will not compile.
   */
  align?: 'start' | 'end' | undefined
  /** Mono, tabular, inline-end. Numbers, dates, counts. */
  figure?: boolean | undefined
}

export type DataTableProps<T> = {
  columns: Column<T>[]
  rows: T[]
  /** Ghost buttons, always visible. Rendered in a trailing cell. */
  rowActions?: ((row: T) => React.ReactNode) | undefined
  stickyHeader?: boolean | undefined
  /** Forces a 44px minimum row height — the row becomes a tap target. */
  onRowClick?: ((row: T) => void) | undefined
}

/**
 * Rows must carry a stable `id`. A table keyed by array index re-associates
 * every row when one is removed, which loses focus and animates the wrong row
 * out — visible the first time somebody archives a shop from the middle of a
 * list.
 */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  rowActions,
  stickyHeader = false,
  onRowClick,
}: DataTableProps<T>) {
  return (
    // The scroll container is the table's own, so a wide table scrolls inside
    // the page rather than making the page scroll sideways.
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-start">
        <thead>
          <tr
            className={cn(
              'border-b-hairline border-border-subtle',
              stickyHeader && 'sticky top-0 z-10 bg-surface'
            )}
          >
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'px-3 py-2 font-ui text-label font-medium text-muted',
                  column.align === 'end' || column.figure ? 'text-end' : 'text-start'
                )}
              >
                {column.header}
              </th>
            ))}
            {rowActions ? (
              // Named for screen readers, silent for everyone else — a visible
              // "Actions" header over a column of icon buttons is noise.
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-b-hairline border-border-subtle last:border-b-0',
                onRowClick && 'min-h-row cursor-pointer hover:bg-stone-50'
              )}
            >
              {columns.map((column) => {
                const value = row[column.key]
                return (
                  <td
                    key={column.key}
                    className={cn(
                      'px-3 py-3 font-ui text-body text-primary',
                      column.figure && 'font-figure text-data',
                      column.align === 'end' || column.figure ? 'text-end' : 'text-start'
                    )}
                    // Bidi isolation for numbers, the same reason Figure sets
                    // it: a figure column inside an Arabic table must not
                    // reorder against its neighbours.
                    {...(column.figure ? { 'data-figure': '' } : {})}
                  >
                    {value as React.ReactNode}
                  </td>
                )
              })}
              {rowActions ? (
                <td className="px-3 py-3 text-end">
                  {/* Stops a row action from also firing onRowClick. Without
                      this, archiving a shop navigates to it on the way out. */}
                  <div
                    className="inline-flex items-center justify-end gap-1"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {rowActions(row)}
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
