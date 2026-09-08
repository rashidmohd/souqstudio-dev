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
 */

type Props = {
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
    <div className="flex flex-wrap items-center gap-2 rounded-pill bg-surface px-2 py-1">
      <div className="flex items-center gap-0.5" role="group" aria-label="Align">
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

      <span className="h-4 w-px bg-border-subtle" aria-hidden="true" />

      <Button
        type="button"
        variant="ghost"
        iconOnly
        aria-label="Group"
        disabled={!canAlign}
        onClick={onGroup}
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
      >
        <Ungroup className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </Button>

      <span className="h-4 w-px bg-border-subtle" aria-hidden="true" />

      <div className="flex items-center gap-1" role="group" aria-label="Zoom">
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
