'use client'

import * as React from 'react'
import { Check } from 'lucide-react'
import type { PlanSummary } from '@/lib/billing-summary'
import { Button } from '@/components/ui/button'
import { Figure } from '@/components/ui/figure'
import { cn } from '@/lib/utils'

/**
 * E3-01 — the plan comparison table.
 *
 * One column per plan, current plan marked, and every column says the same
 * three things in the same order so they can be read across rather than down.
 * A comparison where the rows do not line up is a list, not a comparison.
 *
 * The button label states the direction. "Choose" on every column would leave a
 * shop owner to work out for themselves that the cheaper plan takes effect next
 * month and the dearer one takes effect now.
 */

export function PlanPicker({
  plans,
  currentPlanId,
  pendingPlanId,
  busyPlanId,
  onChoose,
}: {
  plans: PlanSummary[]
  currentPlanId: string | null
  pendingPlanId: string | null
  busyPlanId: string | null
  onChoose: (plan: PlanSummary) => void
}) {
  const current = plans.find((plan) => plan.id === currentPlanId) ?? null

  return (
    <ul className="grid gap-3 md:grid-cols-3">
      {plans.map((plan) => {
        const isCurrent = plan.id === currentPlanId
        const isPending = plan.id === pendingPlanId
        const direction = !current
          ? 'start'
          : plan.tier > current.tier
            ? 'upgrade'
            : plan.tier < current.tier
              ? 'downgrade'
              : 'same'

        return (
          <li
            key={plan.id}
            className={cn(
              'flex flex-col gap-4 rounded-card border-hairline p-4',
              isCurrent ? 'border-border-focus bg-selected-bg' : 'border-border-subtle bg-surface'
            )}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-ui text-subhead text-primary">{plan.name}</h3>
                {isCurrent ? (
                  <span className="font-ui text-label text-secondary">Current</span>
                ) : isPending ? (
                  <span className="font-ui text-label text-caution-fg">Scheduled</span>
                ) : null}
              </div>
              <p className="text-primary">
                <Figure value={plan.basePrice.toFixed(2)} currency="USD" size="data-lg" />
                <span className="font-ui text-body-sm text-secondary"> / month</span>
              </p>
            </div>

            <ul className="flex flex-col gap-2">
              <Included>
                <Figure value={plan.maxShops ?? '∞'} size="data-sm" /> shops
                {plan.pricePerShop > 0 ? (
                  <>
                    {', then '}
                    <Figure value={plan.pricePerShop.toFixed(2)} currency="USD" size="data-sm" />
                    {' each'}
                  </>
                ) : null}
              </Included>
              <Included>
                <Figure value={plan.maxUsers ?? '∞'} size="data-sm" /> people
              </Included>
              <Included>
                <Figure value={plan.aiCreditsMonth} size="data-sm" /> AI credits a month
              </Included>
              <Included>
                {plan.creditsRollover ? 'Unused credits roll over' : 'Credits reset monthly'}
              </Included>
            </ul>

            <div className="mt-auto">
              {isCurrent ? (
                <Button variant="secondary" className="w-full" disabled>
                  Your plan
                </Button>
              ) : (
                <Button
                  variant={direction === 'upgrade' ? 'primary' : 'secondary'}
                  className="w-full"
                  loading={busyPlanId === plan.id}
                  onClick={() => onChoose(plan)}
                >
                  {direction === 'start'
                    ? `Choose ${plan.name}`
                    : direction === 'upgrade'
                      ? `Upgrade to ${plan.name}`
                      : `Switch to ${plan.name}`}
                </Button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function Included({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 font-ui text-body-sm text-secondary">
      <Check className="mt-1 shrink-0 text-primary" size={16} strokeWidth={1.75} aria-hidden="true" />
      <span>{children}</span>
    </li>
  )
}
