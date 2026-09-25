'use client'

import * as React from 'react'
import { Check } from 'lucide-react'
import type { Arrangement, BrandKit } from '@souqstudio/types'
import { BlockPreview } from '@souqstudio/designer/components/blocks/BlockPreview'
import { previewAspect } from '@souqstudio/designer/lib/preview-shape'
import { cn } from '@souqstudio/designer/lib/utils'

/**
 * A block, drawn small enough to pick from a grid.
 *
 * **Extracted when a second picker needed one.** `BlockImportDialog` had this
 * inline, and the editor's "what does this cell draw" dialog needs the same
 * thing: a preview in a uniform box, a name, a pressed state. Two copies of a
 * tile is two tiles that drift, and the component inventory's rule is that a
 * component already in the file is used rather than reinvented — this is that
 * rule applied one level down, to a thing the inventory does not list yet
 * because it had only ever had one caller.
 *
 * **What differs between the two callers is badges**, so badges are a slot. The
 * library picker marks what is in season and what a plan locks; the cell picker
 * marks what will stop showing a product. Neither belongs in here.
 *
 * A `lg` dialog is 672px, less 24px of inline padding each side, less two 12px
 * gaps across three columns — so a tile is about 200px and its preview about
 * 176 once the tile's own padding comes off.
 *
 * **Uniform box, block contained within it**, which is the opposite of what the
 * library page does. On the page each preview sets its own height and the grid
 * absorbs it; in a three-column picker that produces rows of wildly different
 * heights and a footer strip 22px tall sitting beside a 240px card. Fitting each
 * block into one box keeps the grid a grid and still draws every block at its
 * own proportions — a footer really is a thin strip, and showing it as one is
 * the information.
 */
export const TILE_WIDTH = 176
export const TILE_HEIGHT = 160

export function tileSize(block: {
  repeats: boolean
  arrangements: Arrangement[]
}): { width: number; height: number } {
  // Shared with the admin panel's tiles, so both show a block at one shape.
  const natural = previewAspect(block)

  return natural > TILE_WIDTH / TILE_HEIGHT
    ? { width: TILE_WIDTH, height: Math.round(TILE_WIDTH / natural) }
    : { width: Math.round(TILE_HEIGHT * natural), height: TILE_HEIGHT }
}

export function BlockTile({
  name,
  arrangements,
  repeats,
  kit,
  selected,
  disabled = false,
  badges,
  onSelect,
}: {
  name: string
  arrangements: Arrangement[]
  repeats: boolean
  kit: BrandKit
  selected: boolean
  disabled?: boolean
  /** Caller's own chips — in season, plan-locked, takes no product. */
  badges?: React.ReactNode
  onSelect: () => void
}) {
  const size = tileSize({ repeats, arrangements })

  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={onSelect}
        className={cn(
          'flex w-full flex-col gap-2 rounded-card border-hairline p-2 text-start',
          selected
            ? 'border-border-focus bg-selected-bg'
            : 'border-border-subtle hover:bg-stone-100',
          'disabled:opacity-disabled'
        )}
      >
        <div
          className="relative flex items-center justify-center overflow-hidden rounded-control border-hairline border-border-subtle bg-stone-0"
          style={{ height: TILE_HEIGHT }}
        >
          {/* Drawn at the shape the block was designed for, centred in a box
              every tile shares — a cover, a page panel and a footer strip are
              not the same object and must not arrive looking like one. */}
          <BlockPreview arrangements={arrangements} kit={kit} {...size} />

          {selected ? (
            <span className="absolute end-1 top-1 flex size-4 items-center justify-center rounded-pill bg-action-primary text-inverse">
              <Check className="size-3" strokeWidth={2.5} aria-hidden="true" />
            </span>
          ) : null}
        </div>

        <span className="flex flex-wrap items-center gap-1">
          <span className="font-ui text-label font-medium text-primary">{name}</span>
          {badges}
        </span>
      </button>
    </li>
  )
}
