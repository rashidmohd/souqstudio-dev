import { Skeleton } from '@/components/ui/skeleton'

/**
 * The billing page waits on two Stripe calls, so it is over the 400ms line
 * where a skeleton beats a spinner. The shapes mirror what arrives: one plan
 * card, two panels of usage, then the invoice rows.
 */
export default function BillingLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">Billing</h1>
        <p className="font-ui text-body text-secondary">
          Your plan, what you are using, and your invoices.
        </p>
      </div>

      <Skeleton shape="card" />
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton shape="card" />
        <Skeleton shape="card" />
      </div>
      <Skeleton shape="row" count={3} />
    </div>
  )
}
