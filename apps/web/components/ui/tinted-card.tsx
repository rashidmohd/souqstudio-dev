import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * TintedCard. Governed by the design skill → Components → Tinted content cards,
 * and by references/component-inventory.md, which owns this signature.
 *
 * A soft full-bleed tint block, 16px radius, no border. **For prompts, not
 * content** — onboarding next steps, feature introductions, upgrade nudges.
 * General content lives on white `Card`s. More than two on a screen and the page
 * becomes a quilt; the restraint is what makes them read as prompts at all.
 *
 * **Never a primary charcoal button inside.** The tint already carries the
 * emphasis and a solid dark button on a tint block fights it — use `secondary`
 * or `ghost`. Lint cannot see the nesting, so that one is on review.
 *
 * No border and no shadow: separation comes from the tint against
 * `--sq-ui-page`, which is why the tints are calibrated against that ground
 * rather than white.
 *
 * `sky` is deliberately not offered. Charcoal on full-strength sky is 4.25:1,
 * under the AA floor, and a tinted card exists to hold text — `sky-tint` is the
 * usable form.
 *
 * **`text-muted` is not available inside a tinted card.** `--sq-ui-text-muted`
 * is rated 4.91:1, but that is measured against `--sq-ui-page`; on sand it is
 * 4.19:1 and on sky-tint 4.26:1, both under the floor. The lightest ink a
 * tinted card may carry is `text-secondary` (6.13:1 on sand). Nothing enforces
 * this — a tint ground and its text are separate classes — so it is here, in
 * the skill, and in the consistency checklist.
 */
type TintedCardProps = {
  tint: 'sand' | 'sand-tint' | 'sky-tint'
} & React.HTMLAttributes<HTMLDivElement>

const TINT_CLASS = {
  sand: 'bg-sand',
  'sand-tint': 'bg-sand-tint',
  'sky-tint': 'bg-sky-tint',
} as const

export const TintedCard = React.forwardRef<HTMLDivElement, TintedCardProps>(function TintedCard(
  { tint, className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn('rounded-block p-4 text-charcoal', TINT_CLASS[tint], className)}
      {...props}
    />
  )
})
