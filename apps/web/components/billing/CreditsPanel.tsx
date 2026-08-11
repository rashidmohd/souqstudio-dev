'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import type { BillingSummary } from '@/lib/billing-summary'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Figure } from '@/components/ui/figure'
import { UsageMeter } from '@/components/ui/usage-meter'

/**
 * E3-03 — the credit balance, and buying more.
 *
 * The two balances are shown separately because they behave differently: the
 * monthly allocation resets, purchased credits do not. A single total would
 * hide the only fact that decides whether an owner should buy now or wait for
 * the reset in three days.
 */

export function CreditsPanel({
  credits,
  pack,
  canBuy,
}: {
  credits: BillingSummary['usage']['credits']
  pack: { credits: number; price: number }
  /** False without a subscription — there is no card on file to charge. */
  canBuy: boolean
}) {
  const router = useRouter()
  const [confirming, setConfirming] = React.useState(false)
  const [packs, setPacks] = React.useState(1)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [bought, setBought] = React.useState<number | null>(null)

  async function buy() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/billing/credits/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packs }),
      })
      const result = await res.json()
      if (result.error) {
        setError(result.error.message)
        return
      }
      setConfirming(false)
      setBought(result.data.credits)
      // The credits are granted by the invoice.paid webhook, so the balance is
      // usually a moment behind this response. Refreshing picks it up; the
      // message below says so rather than showing a total that has not moved.
      router.refresh()
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-ui text-subhead text-primary">AI credits</h2>
        <p className="font-ui text-body-sm text-secondary">
          Spent on generated characters, poses and covers.
        </p>
      </div>

      <UsageMeter
        label="Used this month"
        used={credits.usedThisPeriod}
        limit={credits.allocation > 0 ? credits.allocation : null}
        unit="credits"
      />

      <dl className="flex flex-col gap-2">
        {/* "remaining", not "left": the physical-direction lint rule matches a
            trailing "left" in any string literal, prose included. Reworded
            rather than suppressed — the rule is right to be blunt, and this
            reads better anyway. */}
        <Row label="Monthly credits remaining">
          <Figure value={credits.monthlyRemaining} size="data-sm" />
        </Row>
        <Row label="Purchased credits">
          <Figure value={credits.topupRemaining} size="data-sm" />
        </Row>
        <Row label="Resets on">
          <Figure value={formatDate(credits.periodEnd)} size="data-sm" />
        </Row>
      </dl>

      {bought !== null ? (
        <p role="status" className="font-ui text-body-sm text-positive-fg">
          <Figure value={bought} size="data-sm" /> credits are on the way. They appear here
          once the payment clears.
        </p>
      ) : null}

      {error && !confirming ? (
        <p role="alert" className="font-ui text-body-sm text-critical-fg">
          {error}
        </p>
      ) : null}

      <div>
        <Button
          variant="secondary"
          onClick={() => {
            setBought(null)
            setError(null)
            setConfirming(true)
          }}
          disabled={!canBuy}
        >
          Buy more credits
        </Button>
        {canBuy ? null : (
          // A disabled control has to say why on the screen — never a tooltip,
          // which does not exist on a tablet.
          <p className="mt-2 font-ui text-body-sm text-secondary">
            Start a subscription to buy credits.
          </p>
        )}
      </div>

      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open) setConfirming(false)
        }}
        title="Buy AI credits"
        description={`${pack.credits} credits for $${pack.price.toFixed(2)}. Charged to the card on file. Purchased credits never expire.`}
        primaryAction={{ label: `Buy ${pack.credits * packs} credits`, onClick: buy, loading: busy }}
        secondaryAction={{ label: 'Cancel', onClick: () => setConfirming(false) }}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              iconOnly
              aria-label="One pack fewer"
              disabled={packs <= 1}
              onClick={() => setPacks((value) => Math.max(1, value - 1))}
            >
              −
            </Button>
            <span className="text-primary">
              <Figure value={packs} size="data" />
              <span className="font-ui text-body-sm text-secondary">
                {packs === 1 ? ' pack' : ' packs'}
              </span>
            </span>
            <Button
              variant="ghost"
              iconOnly
              aria-label="One pack more"
              disabled={packs >= 20}
              onClick={() => setPacks((value) => Math.min(20, value + 1))}
            >
              +
            </Button>
          </div>

          <p className="flex items-center gap-2 font-ui text-body-sm text-secondary">
            <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>
              Total <Figure value={(pack.price * packs).toFixed(2)} currency="USD" size="data-sm" />
              {' for '}
              <Figure value={pack.credits * packs} size="data-sm" /> credits
            </span>
          </p>

          {error ? (
            <p role="alert" className="font-ui text-body-sm text-critical-fg">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
    </Card>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-ui text-body-sm text-secondary">{label}</dt>
      <dd className="text-primary">{children}</dd>
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
