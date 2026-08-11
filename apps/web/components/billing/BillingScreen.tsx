'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { BillingSummary, PlanSummary } from '@/lib/billing-summary'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Figure } from '@/components/ui/figure'
import { UsageMeter } from '@/components/ui/usage-meter'
import { CreditsPanel } from '@/components/billing/CreditsPanel'
import { PlanPicker } from '@/components/billing/PlanPicker'

/**
 * E3-01 — the plan, what it includes, and every control over it.
 *
 * One client component around the whole screen rather than several islands:
 * every action here changes the same object, and a plan change that refreshed
 * the plan card but left the usage meters showing the old limits would be worse
 * than no update at all.
 *
 * The screen never computes money. Every figure comes from the server, which
 * got it from Stripe.
 */

type Preview = {
  direction: 'upgrade' | 'downgrade' | 'same'
  plan: { id: string; name: string }
  conflicts: Array<{ kind: 'shops' | 'users'; current: number; allowed: number }>
  needsCheckout: boolean
}

export function BillingScreen({ summary }: { summary: BillingSummary }) {
  const router = useRouter()
  const [choosing, setChoosing] = React.useState(false)
  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [cancelling, setCancelling] = React.useState(false)
  const [busyPlanId, setBusyPlanId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const hasSubscription = summary.plan !== null && summary.status !== 'cancelled'

  /** Ask the server what a change would do, before committing to it. */
  async function choose(plan: PlanSummary) {
    setError(null)
    setBusyPlanId(plan.id)
    try {
      const res = await fetch(`/api/v1/billing/plan?planId=${encodeURIComponent(plan.id)}`)
      const result = await res.json()
      if (result.error) {
        setError(result.error.message)
        return
      }
      setChoosing(false)
      setPreview(result.data)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setBusyPlanId(null)
    }
  }

  async function confirmChange() {
    if (!preview) return
    setBusy(true)
    setError(null)
    try {
      // No card on file yet: Stripe Checkout collects one, and the subscription
      // comes back through the webhook.
      const url = preview.needsCheckout ? '/api/v1/billing/checkout' : '/api/v1/billing/plan'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: preview.plan.id }),
      })
      const result = await res.json()
      if (result.error) {
        setError(result.error.message)
        return
      }
      if (result.data.url) {
        window.location.assign(result.data.url)
        return
      }
      setPreview(null)
      router.refresh()
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function call(url: string, method: 'POST' | 'DELETE') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(url, { method })
      const result = await res.json()
      if (result.error) {
        setError(result.error.message)
        return false
      }
      if (result.data?.url) {
        window.location.assign(result.data.url)
        return true
      }
      router.refresh()
      return true
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <StatusBanner summary={summary} />

      {error ? (
        <p role="alert" className="font-ui text-body-sm text-critical-fg">
          {error}
        </p>
      ) : null}

      {summary.plan ? (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="font-ui text-label text-secondary">Your plan</span>
              <h2 className="font-ui text-heading text-primary">{summary.plan.name}</h2>
              <p className="text-primary">
                <Figure value={summary.plan.basePrice.toFixed(2)} currency="USD" size="data" />
                <span className="font-ui text-body-sm text-secondary"> / month</span>
              </p>
            </div>

            <div className="flex flex-col items-end gap-1">
              {summary.nextInvoice ? (
                <>
                  <span className="font-ui text-label text-secondary">
                    {summary.cancelAtPeriodEnd ? 'Access ends' : 'Next bill'}
                  </span>
                  <p className="text-primary">
                    <Figure
                      value={summary.nextInvoice.amount.toFixed(2)}
                      currency={summary.nextInvoice.currency.toUpperCase()}
                      size="data"
                    />
                  </p>
                  <span className="font-ui text-body-sm text-secondary">
                    on <Figure value={formatDate(summary.nextInvoice.date)} size="data-sm" />
                  </span>
                </>
              ) : summary.currentPeriodEnd ? (
                <>
                  <span className="font-ui text-label text-secondary">Renews</span>
                  <Figure value={formatDate(summary.currentPeriodEnd)} size="data-sm" />
                </>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setChoosing(true)}>
              Change plan
            </Button>
            <Button variant="secondary" onClick={() => call('/api/v1/billing/portal', 'POST')}>
              Payment methods
            </Button>
            {summary.cancelAtPeriodEnd ? (
              <Button
                variant="secondary"
                loading={busy}
                onClick={() => call('/api/v1/billing/subscription', 'POST')}
              >
                Keep my subscription
              </Button>
            ) : hasSubscription ? (
              <Button variant="danger" onClick={() => setCancelling(true)}>
                Cancel subscription
              </Button>
            ) : null}
          </div>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-ui text-subhead text-primary">Choose a plan</h2>
            <p className="font-ui text-body-sm text-secondary">
              You are not on a plan yet. Pick one to add shops, invite your team and generate
              with AI.
            </p>
          </div>
          <PlanPicker
            plans={summary.plans}
            currentPlanId={null}
            pendingPlanId={summary.pendingPlan?.id ?? null}
            busyPlanId={busyPlanId}
            onChoose={choose}
          />
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <h2 className="font-ui text-subhead text-primary">What you are using</h2>
          <UsageMeter
            label="Shops"
            used={summary.usage.shops.used}
            limit={summary.usage.shops.included}
            unit="shops"
          />
          <UsageMeter
            label="People"
            used={summary.usage.users.used}
            limit={summary.usage.users.included}
            unit="people"
          />
        </Card>

        <CreditsPanel
          credits={summary.usage.credits}
          pack={summary.topupPack}
          canBuy={hasSubscription}
        />
      </div>

      <Dialog
        open={choosing}
        onOpenChange={setChoosing}
        title="Change plan"
        description="Upgrades start straight away. A smaller plan takes effect at the end of the period you have paid for."
        primaryAction={{ label: 'Close', onClick: () => setChoosing(false) }}
      >
        <PlanPicker
          plans={summary.plans}
          currentPlanId={summary.plan?.id ?? null}
          pendingPlanId={summary.pendingPlan?.id ?? null}
          busyPlanId={busyPlanId}
          onChoose={choose}
        />
      </Dialog>

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
        title={preview ? `Switch to ${preview.plan.name}` : ''}
        description={preview ? consequence(preview) : undefined}
        primaryAction={{
          label: preview?.conflicts.length ? 'Close' : `Switch to ${preview?.plan.name ?? ''}`,
          onClick: preview?.conflicts.length ? () => setPreview(null) : confirmChange,
          loading: busy,
        }}
        {...(preview?.conflicts.length
          ? {}
          : { secondaryAction: { label: 'Cancel', onClick: () => setPreview(null) } })}
      >
        {preview?.conflicts.length ? (
          <ul className="flex flex-col gap-2">
            {preview.conflicts.map((conflict) => (
              <li key={conflict.kind} className="font-ui text-body-sm text-primary">
                You have <Figure value={conflict.current} size="data-sm" />{' '}
                {conflict.kind === 'shops' ? 'shops' : 'people'}, and {preview.plan.name} includes{' '}
                <Figure value={conflict.allowed} size="data-sm" />.{' '}
                {conflict.kind === 'shops'
                  ? 'Remove the extra shops, then switch.'
                  : 'Remove the extra people, then switch.'}
              </li>
            ))}
          </ul>
        ) : null}
      </Dialog>

      <Dialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel subscription"
        description={cancelConsequence(summary)}
        primaryAction={{
          label: 'Cancel subscription',
          destructive: true,
          loading: busy,
          onClick: async () => {
            const done = await call('/api/v1/billing/subscription?confirm=true', 'DELETE')
            if (done) setCancelling(false)
          },
        }}
        secondaryAction={{ label: 'Keep it', onClick: () => setCancelling(false) }}
      />
    </div>
  )
}

/**
 * The one place the screen says something is wrong. E3-01 and E3-04.
 *
 * Ordered by how much it costs the shop owner to ignore: suspended first, then
 * the grace period, then things that are merely scheduled.
 */
function StatusBanner({ summary }: { summary: BillingSummary }) {
  if (summary.restriction === 'suspended') {
    return (
      <p role="alert" className="rounded-block bg-critical-bg px-4 py-3 font-ui text-body text-critical-fg">
        Your account is suspended because a payment did not go through. Your data is safe.
        Update your payment method to pick up where you left off.
      </p>
    )
  }

  if (summary.restriction === 'read_only') {
    return (
      <p role="alert" className="rounded-block bg-caution-bg px-4 py-3 font-ui text-body text-caution-fg">
        A payment failed. You can still view your work, but you cannot create anything new
        until it clears. Update your payment method to fix it.
      </p>
    )
  }

  if (summary.status === 'cancelled') {
    return (
      <p role="status" className="rounded-block bg-caution-bg px-4 py-3 font-ui text-body text-caution-fg">
        Your subscription has ended.{' '}
        {summary.dataPurgeAt ? (
          <>
            Your data is kept until{' '}
            <Figure value={formatDate(summary.dataPurgeAt)} size="data-sm" />, then deleted.
          </>
        ) : null}{' '}
        Choose a plan to start again.
      </p>
    )
  }

  if (summary.cancelAtPeriodEnd && summary.currentPeriodEnd) {
    return (
      <p role="status" className="rounded-block bg-caution-bg px-4 py-3 font-ui text-body text-caution-fg">
        Your subscription ends on <Figure value={formatDate(summary.currentPeriodEnd)} size="data-sm" />.
        Everything keeps working until then.
      </p>
    )
  }

  if (summary.pendingPlan && summary.currentPeriodEnd) {
    return (
      <p role="status" className="rounded-block bg-sand px-4 py-3 font-ui text-body text-primary">
        You are moving to {summary.pendingPlan.name} on{' '}
        <Figure value={formatDate(summary.currentPeriodEnd)} size="data-sm" />. Until then you
        keep everything your current plan includes.
      </p>
    )
  }

  return null
}

function consequence(preview: Preview): string {
  if (preview.conflicts.length) {
    return `You are using more than ${preview.plan.name} includes. Here is what to sort out first.`
  }
  if (preview.needsCheckout) {
    return 'You will be taken to our payment page to enter your card details.'
  }
  return preview.direction === 'upgrade'
    ? 'The new limits apply straight away. You will be charged the difference for the rest of this month.'
    : 'Nothing changes until the end of the period you have already paid for. You will not be charged today.'
}

function cancelConsequence(summary: BillingSummary): string {
  const until = summary.currentPeriodEnd
    ? ` until ${formatDate(summary.currentPeriodEnd)}`
    : ' until the end of the period you have paid for'
  return `Everything keeps working${until}. After that your offer books stop being shareable, and your data is kept for 90 days before it is deleted. You can restart any time before then.`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
