import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { prisma } from '@souqstudio/db'
import { requireCompliantSession } from '@/lib/session'
import { toRole } from '@/lib/authz'
import { getBillingSummary } from '@/lib/billing-summary'
import { listInvoices } from '@/lib/subscription'
import { BillingScreen } from '@/components/billing/BillingScreen'
import { InvoicesTable } from '@/components/billing/InvoicesTable'

export const metadata: Metadata = { title: 'Billing · SouqStudio' }

/**
 * E3 — billing.
 *
 * Owner only. A manager who lands here is redirected rather than shown a page
 * of disabled controls: what the organization pays is not a permission they are
 * missing, it is a question that is not theirs. Same reasoning as the team
 * screen for editors and viewers.
 *
 * The summary and the invoices are fetched together on the server. Both touch
 * Stripe, and doing them in parallel means the page waits for the slower one
 * rather than for the sum.
 */
export default async function BillingSettingsPage() {
  const session = await requireCompliantSession()
  if (toRole(session.user.role) !== 'owner') redirect('/')

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: session.user.organizationId },
  })

  const [summary, invoices] = await Promise.all([
    getBillingSummary(organization.id),
    listInvoices(organization),
  ])

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">Billing</h1>
        <p className="font-ui text-body text-secondary">
          Your plan, what you are using, and your invoices.
        </p>
      </div>

      <BillingScreen summary={summary} />
      <InvoicesTable invoices={invoices} />
    </div>
  )
}
