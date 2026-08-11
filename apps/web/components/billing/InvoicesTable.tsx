'use client'

import * as React from 'react'
import { Download } from 'lucide-react'
import type { InvoiceSummary } from '@/lib/subscription'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DataTable, type Column } from '@/components/ui/data-table'

/**
 * E3-04 — invoice history.
 *
 * The rows are rendered rather than the raw Stripe objects, so the amount is a
 * formatted string in the same currency Stripe charged. `Figure` cannot be used
 * inside a `DataTable` cell — the table renders values, not nodes — so the
 * `figure` column flag does the same job: mono, tabular, inline-end.
 */

type Row = {
  id: string
  number: string
  date: string
  amount: string
  status: string
  pdfUrl: string | null
}

const COLUMNS: Column<Row>[] = [
  { key: 'number', header: 'Invoice' },
  { key: 'date', header: 'Date', figure: true },
  { key: 'amount', header: 'Amount', align: 'end', figure: true },
  { key: 'status', header: 'Status' },
]

export function InvoicesTable({ invoices }: { invoices: InvoiceSummary[] }) {
  if (invoices.length === 0) {
    return (
      <Card className="flex flex-col gap-1">
        <h2 className="font-ui text-subhead text-primary">Invoices</h2>
        {/* Not an EmptyState: nothing has gone wrong and there is no action to
            offer. An invoice appears here on its own the first time one is
            raised. */}
        <p className="font-ui text-body-sm text-secondary">
          Your invoices appear here once your first payment goes through.
        </p>
      </Card>
    )
  }

  const rows: Row[] = invoices.map((invoice) => ({
    id: invoice.id,
    number: invoice.number ?? '—',
    date: formatDate(invoice.createdAt),
    // Thin space between the code and the amount, per the currency rule.
    // Written as the escape rather than typed: a literal one is invisible in
    // review and eslint's no-irregular-whitespace refuses it. Same as Figure.
    amount: `${invoice.currency.toUpperCase()}\u2009${invoice.total.toFixed(2)}`,
    status: STATUS_LABEL[invoice.status ?? ''] ?? 'Draft',
    pdfUrl: invoice.pdfUrl,
  }))

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-ui text-subhead text-primary">Invoices</h2>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowActions={(row) =>
          row.pdfUrl ? (
            <Button
              variant="ghost"
              onClick={() => window.open(row.pdfUrl ?? '', '_blank', 'noopener')}
            >
              <Download size={16} strokeWidth={1.75} aria-hidden="true" />
              Download
            </Button>
          ) : null
        }
      />
    </Card>
  )
}

/** Stripe's own words, in ours. Sentence case, and nothing a shop owner has to look up. */
const STATUS_LABEL: Record<string, string> = {
  paid: 'Paid',
  open: 'Due',
  uncollectible: 'Unpaid',
  void: 'Cancelled',
  draft: 'Draft',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
