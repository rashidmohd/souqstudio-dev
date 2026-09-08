'use client'

import * as React from 'react'
import { Trash2 } from 'lucide-react'
import type { Arrangement } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

/**
 * What the properties pane shows when nothing on the card is selected: the
 * block itself, and the layout currently open.
 *
 * **The aspect range is the whole of "which shapes is this layout for".** A
 * region can be a tall booklet cell, a square carousel post, a two-column merge
 * or a full-width band, and fit cannot mean stretch — a stretched card is a
 * distorted card — so a block carries one layout per shape and the engine picks
 * by aspect. Editing the range here is editing that decision directly, which is
 * more honest than a named preset that hides the number it sets.
 */

type Props = {
  name: string
  status: string
  repeats: boolean
  disabled: boolean
  arrangement: Arrangement | undefined
  arrangementCount: number
  canRemoveArrangement: boolean
  onName: (name: string) => void
  onStatus: (status: string) => void
  onAspect: (min: number, max: number) => void
  onRemoveArrangement: () => void
}

export function BlockProperties({
  name,
  status,
  repeats,
  disabled,
  arrangement,
  arrangementCount,
  canRemoveArrangement,
  onName,
  onStatus,
  onAspect,
  onRemoveArrangement,
}: Props) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-subhead text-primary">This block</h2>
        <p className="font-ui text-body-sm text-muted">
          {repeats
            ? 'Drawn once for every product in a book.'
            : 'Placed once — a header, a footer, a message.'}
        </p>
      </div>

      <Input
        label="Name"
        disabled={disabled}
        value={name}
        onChange={(event) => onName(event.target.value)}
      />

      {/* `repeats` is not editable here, deliberately. It decides which fields
          exist at all, so flipping it on a block that already binds product
          fields would invalidate the design in place — the copy path is where
          that choice is made, before anything has been drawn. */}

      <Select
        label="Availability"
        disabled={disabled}
        value={status}
        hint="Books already made keep the block they were made with."
        options={[
          { value: 'published', label: 'Available in new books' },
          { value: 'draft', label: 'Hidden while you work on it' },
          { value: 'archived', label: 'Retired' },
        ]}
        onChange={(event) => onStatus(event.target.value)}
      />

      {arrangement === undefined ? null : (
        <fieldset className="flex flex-col gap-3 rounded-control border-hairline border-border-subtle p-3">
          <legend className="font-ui text-eyebrow uppercase tracking-wide text-secondary">
            This layout
          </legend>

          <p className="font-ui text-body-sm text-muted">
            Used when the space it lands in is between these shapes — width
            divided by height. A tall booklet cell is about 0.7, a square post
            is 1, a two-column merge is 2.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="From"
              type="number"
              min={0.05}
              max={40}
              step={0.05}
              figure
              disabled={disabled}
              value={arrangement.aspectMin}
              onChange={(event) => onAspect(Number(event.target.value), arrangement.aspectMax)}
            />
            <Input
              label="To"
              type="number"
              min={0.05}
              max={40}
              step={0.05}
              figure
              disabled={disabled}
              value={arrangement.aspectMax}
              onChange={(event) => onAspect(arrangement.aspectMin, Number(event.target.value))}
            />
          </div>

          {canRemoveArrangement ? (
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              onClick={onRemoveArrangement}
              className="self-start"
            >
              <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Remove this layout
            </Button>
          ) : (
            <p className="font-ui text-body-sm text-muted">
              {arrangementCount === 1
                ? 'A block needs at least one layout.'
                : 'This layout cannot be removed.'}
            </p>
          )}
        </fieldset>
      )}
    </div>
  )
}
