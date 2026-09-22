import { cn } from '@/lib/utils'

/**
 * Horizontal hairline dividers only. No vertical rules, no zebra striping,
 * sticky header, 44px minimum row. souqstudio-design → Tables.
 *
 * Tables are the primary UI in this app rather than cards, so these are plain
 * elements rather than a data-table abstraction: every screen wants different
 * columns and none of them wants a shared column-config type yet. TanStack
 * Table is in the dependencies for the screen that first needs sorting and
 * filtering in the client; nothing does today, because every list here is
 * filtered and paged on the server.
 */
export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    // The one horizontal scroller the responsive rule permits, and it is scoped
    // to the table rather than to the page.
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-body', className)}>{children}</table>
    </div>
  )
}

export function Thead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-surface">
      <tr className="border-b border-border-subtle">{children}</tr>
    </thead>
  )
}

export function Th({
  children,
  numeric = false,
  className,
}: {
  children?: React.ReactNode
  numeric?: boolean
  className?: string
}) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap px-3 py-2 text-label font-medium text-secondary',
        numeric ? 'text-end' : 'text-start',
        className
      )}
    >
      {children}
    </th>
  )
}

export function Tbody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>
}

export function Tr({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <tr className={cn('min-h-row border-b border-border-subtle last:border-b-0', className)}>
      {children}
    </tr>
  )
}

export function Td({
  children,
  numeric = false,
  className,
}: {
  children?: React.ReactNode
  numeric?: boolean
  className?: string
}) {
  return (
    <td
      className={cn(
        'px-3 py-2 align-middle text-primary',
        numeric ? 'text-end' : 'text-start',
        className
      )}
    >
      {children}
    </td>
  )
}
