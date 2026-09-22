'use client'

import * as React from 'react'
import type { BlockElement } from '@souqstudio/types'
import { SHAPE_VARIANTS, shapeElement } from '@/lib/block-elements'
import { ShapeMark } from '@/components/card-designer/ShapeMark'

/**
 * Every shape, on a visible surface. E7.
 *
 * **The rail carries one shape and the kit has thirteen.** A burst is on the
 * rail because a burst is what an offer card is usually about; the ribbon, the
 * tag, the corner flash, the star and the arrow were reachable only by placing
 * some other shape and then finding the variant grid in the properties panel.
 * That is a route nobody discovers — an owner who wants a ribbon looks where
 * things are added, sees a square, a circle and a rule, and concludes the
 * product does not draw ribbons. Which is how they end up uploading one as
 * artwork, flat and unrecolourable, instead of placing the shape whose fill
 * they can change.
 *
 * **Here rather than on the rail**, because the rail is a strip of icons that
 * is already long and five more would make it a scroll. And **not behind a
 * flyout**: the design system's own rule is that every hover-revealed
 * affordance needs a persistent equivalent, since the editor ships on tablet
 * where hover does not exist — a menu holding something that exists nowhere
 * else is what `ContextMenu` is documented as never being.
 *
 * Each shape lands placed and coloured by `SHAPE_SEEDS`, and lands *selected*,
 * so the fill control in the properties panel is already pointed at the thing
 * the owner just made. That is the whole answer to "can I change the colour":
 * it is one glance away rather than a thing to go looking for.
 */

type Props = {
  disabled: boolean
  onAdd: (element: BlockElement) => void
}

export function ShapesPanel({ disabled, onAdd }: Props) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-ui text-eyebrow uppercase tracking-wide text-secondary">Shapes</h2>

      {/*
        Four across: the widest that keeps a full-height control inside the
        pane at its narrowest, and it puts the three primitives and the burst
        on one row — which is the split the list is already ordered by.
      */}
      <ul className="grid grid-cols-4 gap-1">
        {SHAPE_VARIANTS.map((shape) => (
          <li key={shape.value}>
            <button
              type="button"
              // The pointer gets the native tooltip and the screen reader gets
              // the name, neither depending on a tooltip component that would
              // have to be built, positioned and dismissed. Same contract as
              // the rail's buttons, which sit two centimetres away.
              title={shape.label}
              aria-label={shape.label}
              disabled={disabled}
              onClick={() => onAdd(shapeElement(shape.value))}
              className="flex h-control-lg w-full items-center justify-center rounded-control text-secondary hover:bg-stone-100 disabled:opacity-disabled"
            >
              <ShapeMark variant={shape.value} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
