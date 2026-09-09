'use client'

import * as React from 'react'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignVerticalSpaceAround,
  Group,
  Minus,
  Plus,
  Ungroup,
} from 'lucide-react'
import type { Alignment } from '@souqstudio/engine'
import { Button } from '@/components/ui/button'
import { Figure } from '@/components/ui/figure'

/**
 * The canvas toolbar — align, distribute, group, zoom.
 *
 * **Everything here acts on the selection, and everything here is disabled
 * until the selection can support it.** Aligning one element to itself is a
 * no-op that leaves an owner wondering what they did wrong; distributing two is
 * the same. Refusing in the control rather than in the handler is what makes
 * that legible.
 *
 * Alignment is **logical** — start and end rather than left and right — so the
 * same button means the same thing in an Arabic edition. That is the rule the
 * whole artboard follows and this is not the place to break it.
 *
 * **The canvas shape sits in here too, in `leading`.** It used to be a separate
 * row floating above this one on the dark surround — two bars of chrome over one
 * canvas, and the owner asked for one. They are the same kind of thing: what am
 * I designing, and what am I doing to it. A card rather than a pill now, because
 * a pill is the shape of a row of icons and this row starts with a field.
 */

type Props = {
  /** The canvas shape control — a shape picker, or the layout tabs. */
  leading?: React.ReactNode
  count: number
  zoom: number
  disabled: boolean
  onAlign: (how: Alignment) => void
  onGroup: () => void
  onUngroup: () => void
  onZoom: (zoom: number) => void
}

const ALIGNMENTS: { how: Alignment; label: string; icon: typeof Group; rotate?: boolean }[] = [
  { how: 'start', label: 'Align to the start', icon: AlignStartHorizontal, rotate: true },
  { how: 'center', label: 'Centre across', icon: AlignCenterVertical },
  { how: 'end', label: 'Align to the end', icon: AlignEndHorizontal, rotate: true },
  { how: 'top', label: 'Align to the top', icon: AlignStartHorizontal },
  { how: 'middle', label: 'Centre down', icon: AlignCenterHorizontal },
  { how: 'bottom', label: 'Align to the bottom', icon: AlignEndHorizontal },
]

export function CanvasToolbar({
  leading,
  count,
  zoom,
  disabled,
  onAlign,
  onGroup,
  onUngroup,
  onZoom,
}: Props) {
  const canAlign = !disabled && count >= 2
  const canDistribute = !disabled && count >= 3

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-card bg-surface px-2 py-2">
      {leading === undefined ? null : (
        <>
          {leading}
          <Divider />
        </>
      )}

      <div className="flex items-center gap-1 pb-1" role="group" aria-label="Align">
        {ALIGNMENTS.map((entry) => (
          <Button
            key={entry.how}
            type="button"
            variant="ghost"
            iconOnly
            aria-label={entry.label}
            disabled={!canAlign}
            onClick={() => onAlign(entry.how)}
          >
            <entry.icon
              className={entry.rotate === true ? 'size-4 rotate-90 rtl:-rotate-90' : 'size-4'}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          iconOnly
          aria-label="Space evenly across"
          disabled={!canDistribute}
          onClick={() => onAlign('distribute-x')}
        >
          <AlignHorizontalSpaceAround className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          iconOnly
          aria-label="Space evenly down"
          disabled={!canDistribute}
          onClick={() => onAlign('distribute-y')}
        >
          <AlignVerticalSpaceAround className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </div>

      <Divider />

      <Button
        type="button"
        variant="ghost"
        iconOnly
        aria-label="Group"
        disabled={!canAlign}
        onClick={onGroup}
        className="mb-1"
      >
        <Group className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        iconOnly
        aria-label="Ungroup"
        disabled={disabled || count === 0}
        onClick={onUngroup}
        className="mb-1"
      >
        <Ungroup className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </Button>

      <Divider />

      <div className="flex items-center gap-1 pb-1" role="group" aria-label="Zoom">
        <Button
          type="button"
          variant="ghost"
          iconOnly
          aria-label="Zoom out"
          onClick={() => onZoom(zoom - 0.25)}
        >
          <Minus className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </Button>
        <button
          type="button"
          onClick={() => onZoom(1)}
          className="font-ui text-body-sm text-secondary"
          aria-label="Fit to the pane"
        >
          <Figure value={`${Math.round(zoom * 100)}%`} size="data-sm" />
        </button>
        <Button
          type="button"
          variant="ghost"
          iconOnly
          aria-label="Zoom in"
          onClick={() => onZoom(zoom + 0.25)}
        >
          <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}

/** Between groups. `self-center` so it does not stretch with an `items-end` row. */
const Divider = () => (
  <span className="h-4 w-px self-center bg-border-subtle" aria-hidden="true" />
)
