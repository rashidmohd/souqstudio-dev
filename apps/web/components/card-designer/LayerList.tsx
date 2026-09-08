'use client'

import * as React from 'react'
import { ArrowDown, ArrowUp, GripVertical, Link2, Lock, LockOpen, Trash2 } from 'lucide-react'
import type { BlockElement } from '@souqstudio/types'
import { isBound } from '@souqstudio/engine'

/**
 * The layer list. E7.
 *
 * **Front-most at the top, which is the opposite of how it was built and the
 * same as every tool this is modelled on.** Photoshop, Illustrator, Figma and
 * Canva all put the layer nearest the viewer at the top of the list, and an
 * owner who has used any of them reads the first row as "the thing in front".
 * The array underneath is paint order — index 0 is drawn first, so it is
 * furthest back — so this list renders it reversed and translates on the way
 * out. Getting that backwards makes every drag go the wrong way, which is worse
 * than having no list.
 *
 * **Drag to reorder, and keep the arrows.** Dragging is what anyone coming from
 * a design tool reaches for first; the arrows are the tablet path, and the
 * design system asks for a persistent equivalent because long-press drag is
 * unreliable on an iPad. Neither is a fallback for the other.
 *
 * The leading indicator is the second of the three places the design system
 * requires a bound element to be marked. It reads its answer from the engine's
 * `isBound`, as do the canvas and the tool rail — three surfaces deriving it
 * separately is how one of them ends up wrong.
 */

type Props = {
  /** In paint order: index 0 is furthest back. Displayed reversed. */
  elements: BlockElement[]
  selectedIds: readonly string[]
  disabled: boolean
  onSelect: (ids: string[], additive?: boolean) => void
  /** Both indexes are into the **paint-order** array, not into this list. */
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
  const [dragging, setDragging] = React.useState<string | null>(null)
  const [over, setOver] = React.useState<string | null>(null)

  if (elements.length === 0) {
    return (
      <p className="font-ui text-body-sm text-muted">
        Nothing on this layout yet. Pick a tool to add something.
      </p>
    )
  }

  // Reversed for display; every index handed back is translated to paint order.
  const rows = [...elements].reverse()
  const paintIndex = (row: number) => elements.length - 1 - row

  function drop(targetRow: number) {
    const source = dragging
    setDragging(null)
    setOver(null)
    if (source === null) return

    const from = elements.findIndex((element) => element.id === source)
    if (from === -1) return
    onReorder(from, paintIndex(targetRow))
  }

  return (
    <ul className="flex flex-col gap-1">
      {rows.map((element, row) => {
        const bound = isBound(element)
        const selected = selectedIds.includes(element.id)
        const locked = element.locked === true
        const index = paintIndex(row)

        return (
          <li
            key={element.id}
            draggable={!disabled && !locked}
            onDragStart={(event) => {
              setDragging(element.id)
              event.dataTransfer.effectAllowed = 'move'
              // Firefox starts no drag at all without payload.
              event.dataTransfer.setData('text/plain', element.id)
            }}
            onDragEnd={() => {
              setDragging(null)
              setOver(null)
            }}
            onDragOver={(event) => {
              if (dragging === null) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setOver(element.id)
            }}
            onDragLeave={() =>
              setOver((current) => (current === element.id ? null : current))
            }
            onDrop={(event) => {
              event.preventDefault()
              drop(row)
            }}
            className={[
              'flex items-center gap-1 rounded-control p-1',
              selected ? 'bg-selected-bg' : '',
              dragging === element.id ? 'opacity-50' : '',
              over === element.id && dragging !== element.id
                ? 'outline outline-2 outline-offset-2 outline-border-focus'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <GripVertical
              className={locked ? 'size-4 shrink-0 text-muted opacity-disabled' : 'size-4 shrink-0 text-muted'}
              strokeWidth={1.75}
              aria-hidden="true"
            />

            <button
              type="button"
              // Shift and cmd add to the selection, exactly as on the canvas —
              // two ways of doing the same thing that behaved differently would
              // be worse than one.
              onClick={(event) => onSelect([element.id], event.shiftKey || event.metaKey)}
              className="flex min-w-0 flex-1 items-center gap-2 text-start"
            >
              {/* The mark, not a colour alone: a link glyph for bound, a rule
                  for static. Colour is the reinforcement. */}
              {bound ? (
                <Link2 className="size-4 shrink-0 text-link" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <span className="h-4 w-px shrink-0 bg-border-strong" aria-hidden="true" />
              )}
              <span className="truncate font-ui text-body-sm text-primary">
                {describe(element)}
              </span>
              {element.groupId !== undefined ? (
                <span className="shrink-0 font-ui text-eyebrow uppercase text-muted">grouped</span>
              ) : null}
              <span className="sr-only">{bound ? 'From the catalog' : 'Fixed'}</span>
            </button>

            <IconButton
              label={locked ? `Unlock ${describe(element)}` : `Lock ${describe(element)}`}
              pressed={locked}
              disabled={disabled}
              onClick={() => onToggleLock(element.id)}
            >
              {locked ? (
                <Lock className="size-4" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <LockOpen className="size-4" strokeWidth={1.75} aria-hidden="true" />
              )}
            </IconButton>

            {/* Up is toward the front, because up is toward the front of this
                list. The paint-order index moves the other way, which is what
                `paintIndex` is for. */}
            <IconButton
              label={`Bring ${describe(element)} forward`}
              disabled={disabled || row === 0}
              onClick={() => onReorder(index, index + 1)}
            >
              <ArrowUp className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
            <IconButton
              label={`Send ${describe(element)} back`}
              disabled={disabled || row === rows.length - 1}
              onClick={() => onReorder(index, index - 1)}
            >
              <ArrowDown className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
            <IconButton
              label={`Delete ${describe(element)}`}
              disabled={disabled}
              onClick={() => onRemove(element.id)}
            >
              <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
          </li>
        )
      })}
    </ul>
  )
}

function IconButton({
  label,
  disabled,
  pressed,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  pressed?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className="rounded-pill p-1 text-secondary hover:bg-stone-100 disabled:opacity-disabled"
    >
      {children}
    </button>
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
