'use client'

import * as React from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Maximize2, Minimize2, RotateCcw } from 'lucide-react'
import { SLOT_OVERRIDE_LIMITS } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Figure } from '@/components/ui/figure'
import { useEditorStore } from '@/stores/editor-store'

/**
 * Nudging one card. E6-04.
 *
 * **Bounded, and the bound is the feature.** E6 §1: unbounded free positioning
 * is what turns week 33 into a rebuild, because a hand-placed card cannot
 * survive the product list changing under it. A delta can — it is stored against
 * the region *and* the offer, re-applied to whatever the engine produces next
 * week, and dropped when its card is gone.
 *
 * So the controls are steps rather than a drag: an owner cannot express
 * "anywhere on the page" with them, which is exactly the point. Eight percent of
 * the region in each direction, four steps of two percent, and an image between
 * 0.8 and 1.25.
 *
 * **Arrows are logical, not physical.** The start arrow moves the card toward
 * the start of the reading order, which is left in an English book and right in
 * an Arabic one — the same rule the whole artboard follows, so the control means
 * the same thing in both editions.
 *
 * "Reset to template" removes the entry rather than zeroing it, which is also
 * what makes a reset survive a change to the limits.
 */

/** Four steps to the limit. Small enough to be a nudge, big enough to see. */
const STEP = SLOT_OVERRIDE_LIMITS.offset / 4
const SCALE_STEP = 0.05

type Props = { bookId: string; offerId: string; direction: 'ltr' | 'rtl' }

export function SlotAdjust({ bookId, offerId, direction }: Props) {
  const nudge = useEditorStore((state) => state.nudge)
  const resetOverride = useEditorStore((state) => state.resetOverride)
  const setSave = useEditorStore((state) => state.setSave)
  const settle = useEditorStore((state) => state.settle)
  // Subscribed to the map rather than reading it once: the buttons disable at
  // the limit, and a stale copy would leave them live past it.
  const overrides = useEditorStore((state) => state.overrides)
  const placement = useEditorStore((state) => state.placement)

  const where = placement[offerId]
  const current = where
    ? overrides[where.pageIndex]?.find(
        (entry) => entry.regionId === where.regionId && entry.offerId === offerId
      )
    : undefined

  const offsetX = current?.offsetX ?? 0
  const offsetY = current?.offsetY ?? 0
  const scale = current?.imageScale ?? 1
  const limit = SLOT_OVERRIDE_LIMITS

  async function persist(pageIndex: number, body: Record<string, unknown>) {
    setSave('saving')
    try {
      const res = await fetch(
        `/api/v1/offer-books/${bookId}/pages/${pageIndex}/overrides`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ regionId: where?.regionId, offerId, ...body }),
        }
      )
      if (!res.ok) throw new Error('save failed')
      setSave('saved')
      settle(offerId, true)
    } catch {
      setSave('error')
      settle(offerId, false)
    }
  }

  function move(patch: { offsetX?: number; offsetY?: number; imageScale?: number }) {
    const applied = nudge(offerId, patch)
    if (applied === null) return
    void persist(applied.pageIndex, {
      offsetX: applied.override.offsetX ?? 0,
      offsetY: applied.override.offsetY ?? 0,
      imageScale: applied.override.imageScale ?? 1,
    })
  }

  if (where === undefined) return null

  // The start arrow moves toward the start of the reading order. The delta the
  // engine applies is logical too, so this is one sign flip and no second rule.
  const towardStart = direction === 'rtl' ? STEP : -STEP
  const towardEnd = -towardStart

  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-ui text-eyebrow uppercase tracking-wide text-secondary">
        Fine position
      </h3>

      <div className="flex items-center gap-2">
        <div className="grid grid-cols-3 gap-1">
          <span />
          <Button
            type="button"
            variant="ghost"
            iconOnly
            aria-label="Move this card up"
            disabled={offsetY <= -limit.offset}
            onClick={() => move({ offsetY: offsetY - STEP })}
          >
            <ArrowUp className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <span />

          <Button
            type="button"
            variant="ghost"
            iconOnly
            aria-label="Move this card toward the start"
            disabled={direction === 'rtl' ? offsetX >= limit.offset : offsetX <= -limit.offset}
            onClick={() => move({ offsetX: offsetX + towardStart })}
          >
            <ArrowLeft className="size-4 rtl:rotate-180" strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            iconOnly
            aria-label="Put this card back where the layout puts it"
            disabled={current === undefined}
            onClick={() => {
              const reset = resetOverride(offerId)
              if (reset !== null) void persist(reset.pageIndex, { reset: true })
            }}
          >
            <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            iconOnly
            aria-label="Move this card toward the end"
            disabled={direction === 'rtl' ? offsetX <= -limit.offset : offsetX >= limit.offset}
            onClick={() => move({ offsetX: offsetX + towardEnd })}
          >
            <ArrowRight className="size-4 rtl:rotate-180" strokeWidth={1.75} aria-hidden="true" />
          </Button>

          <span />
          <Button
            type="button"
            variant="ghost"
            iconOnly
            aria-label="Move this card down"
            disabled={offsetY >= limit.offset}
            onClick={() => move({ offsetY: offsetY + STEP })}
          >
            <ArrowDown className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <span />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              iconOnly
              aria-label="Make the photo smaller"
              disabled={scale <= limit.imageScaleMin}
              onClick={() => move({ imageScale: scale - SCALE_STEP })}
            >
              <Minimize2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </Button>
            <span className="font-ui text-body-sm text-secondary">
              Photo <Figure value={`${Math.round(scale * 100)}%`} size="data-sm" />
            </span>
            <Button
              type="button"
              variant="ghost"
              iconOnly
              aria-label="Make the photo bigger"
              disabled={scale >= limit.imageScaleMax}
              onClick={() => move({ imageScale: scale + SCALE_STEP })}
            >
              <Maximize2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </Button>
          </div>

          <p className="font-ui text-body-sm text-muted">
            Small adjustments only, so next week&rsquo;s book keeps them.
          </p>
        </div>
      </div>
    </section>
  )
}
