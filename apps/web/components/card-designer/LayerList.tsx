'use client'

import * as React from 'react'
import { ArrowDown, ArrowUp, Link2, Lock, LockOpen, Trash2 } from 'lucide-react'
import type { BlockElement } from '@souqstudio/types'
import { isBound } from '@souqstudio/engine'

/**
 * The layer list. E7.
 *
 * **Array order is paint order**, so this list *is* the z-order and the arrows
 * are the only control over it. Bottom of the list paints last, which is why it
 * is listed last: a list that showed the top layer first would put the arrows
 * the wrong way round for anyone who has used a design tool.
 *
 * The leading indicator is the second of the three places the design system
 * requires a bound element to be marked. It reads its answer from the engine's
 * `isBound`, as do the canvas and the palette — three surfaces deriving it
 * separately is how one of them ends up wrong.
 */

type Props = {
  elements: BlockElement[]
  selectedIds: readonly string[]
  disabled: boolean
  onSelect: (ids: string[], additive?: boolean) => void
  onReorder: (from: number, to: number) => void
  onRemove: (id: string) => void
  onToggleLock: (id: string) => void
}

export function LayerList({
  elements,
  selectedIds,
  disabled,
  onSelect,
  onReorder,
  onRemove,
  onToggleLock,
}: Props) {
  if (elements.length === 0) {
    return (
      <p className="font-ui text-body-sm text-muted">
        Nothing on this layout yet. Add something from the palette.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-1">
      {elements.map((element, index) => {
        const bound = isBound(element)
        const selected = selectedIds.includes(element.id)
        const locked = element.locked === true

        return (
          <li
            key={element.id}
            className={
              selected
                ? 'flex items-center gap-1 rounded-control bg-selected-bg p-1'
                : 'flex items-center gap-1 rounded-control p-1'
            }
          >
            <button
              type="button"
              // Shift and cmd add to the selection, exactly as on the canvas —
              // two ways of doing the same thing that behaved differently would
              // be worse than one.
              onClick={(event) =>
                onSelect([element.id], event.shiftKey || event.metaKey)
              }
              className="flex min-w-0 flex-1 items-center gap-2 text-start"
            >
              {/* The mark, not a colour alone: a link glyph for bound, a rule
                  for static. Colour is the reinforcement. */}
              {bound ? (
                <Link2 className="size-3.5 shrink-0 text-link" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <span className="ms-1 h-3.5 w-px shrink-0 bg-border-strong" aria-hidden="true" />
              )}
              <span className="truncate font-ui text-body-sm text-primary">
                {describe(element)}
              </span>
              {element.groupId !== undefined ? (
                <span className="shrink-0 font-ui text-eyebrow uppercase text-muted">grouped</span>
              ) : null}
              <span className="sr-only">{bound ? 'From the catalog' : 'Fixed'}</span>
            </button>

            <button
              type="button"
              disabled={disabled}
              onClick={() => onToggleLock(element.id)}
              aria-label={locked ? `Unlock ${describe(element)}` : `Lock ${describe(element)}`}
              aria-pressed={locked}
              className="rounded-pill p-1 text-secondary hover:bg-stone-100 disabled:opacity-40"
            >
              {locked ? (
                <Lock className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <LockOpen className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              disabled={disabled || index === 0}
              onClick={() => onReorder(index, index - 1)}
              aria-label={`Move ${describe(element)} behind`}
              className="rounded-pill p-1 text-secondary hover:bg-stone-100 disabled:opacity-40"
            >
              <ArrowUp className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={disabled || index === elements.length - 1}
              onClick={() => onReorder(index, index + 1)}
              aria-label={`Move ${describe(element)} in front`}
              className="rounded-pill p-1 text-secondary hover:bg-stone-100 disabled:opacity-40"
            >
              <ArrowDown className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove(element.id)}
              aria-label={`Remove ${describe(element)}`}
              className="rounded-pill p-1 text-secondary hover:bg-stone-100 disabled:opacity-40"
            >
              <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * What an element is called, in the owner's words.
 *
 * A bound element is named by what it *shows* — "Product name", not "Text" —
 * because the field is the whole reason it is there, and a list of six rows all
 * called "Text" is a list nobody can navigate.
 */
export function describe(element: BlockElement): string {
  switch (element.kind) {
    case 'text':
      if (element.source.from === 'product') return `Product ${element.source.field}`
      if (element.source.from === 'shop') return `Shop ${element.source.field}`
      return element.source.textEn === '' ? 'Fixed text' : `“${element.source.textEn}”`
    case 'image':
      return element.source.from === 'product' ? 'Product image' : 'Artwork'
    case 'priceMark':
      return 'Price'
    case 'chip':
      return 'Offer badge'
    case 'logo':
      return 'Logo'
    case 'shape':
      if (element.variant === 'line') return 'Line'
      if (element.variant === 'ellipse') return 'Circle'
      return element.box.width === 1 && element.box.height === 1 ? 'Background' : 'Shape'
  }
}
