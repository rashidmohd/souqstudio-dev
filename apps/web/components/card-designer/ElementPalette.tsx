'use client'

import * as React from 'react'
import {
  Image as ImageIcon,
  Layers,
  Square,
  Tag,
  Type,
  BadgePercent,
  Store,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { BlockElement } from '@souqstudio/types'

/**
 * The element palette. E7 — `docs/composition-model.md` §3.4a.
 *
 * **Drop, then bind.** Dropping creates an element with a box; the properties
 * panel decides what fills it. That order is what makes the panel's binding
 * control the only place a product field is ever chosen, which is what keeps
 * owners from typing a product name onto a page.
 *
 * **`repeats` decides the vocabulary, and it decides it by omission.** A block
 * placed once has no product in scope, so the bound section is not empty — it
 * does not exist. That is the whole content of "this only works on a product
 * card", said by the interface rather than by a warning after the fact.
 *
 * The two groups are also one of the three places the design system requires
 * bound and static elements to be distinguishable: here, on the canvas, and in
 * the layer list. A shop that cannot tell which is which cannot predict what
 * their card does across twelve products.
 */

type Props = {
  repeats: boolean
  disabled: boolean
  onAdd: (element: BlockElement) => void
}

/** Dropped elements land here, in the middle, at a size that can be seen. */
const DROP = { start: 0.25, top: 0.4, width: 0.5, height: 0.14 }

type Entry = {
  key: string
  label: string
  hint: string
  icon: LucideIcon
  element: BlockElement
}

const BOUND: Entry[] = [
  {
    key: 'product-image',
    label: 'Product image',
    hint: 'The packshot, or a reserved space when there is none',
    icon: ImageIcon,
    element: { kind: 'image', box: { ...DROP, height: 0.3 }, source: { from: 'product' } },
  },
  {
    key: 'product-name',
    label: 'Product name',
    hint: 'Never typed in — it follows the catalog',
    icon: Type,
    element: {
      kind: 'text',
      box: DROP,
      source: { from: 'product', field: 'name' },
      level: 'h3',
      align: 'start',
    },
  },
  {
    key: 'product-spec',
    label: 'Size or spec',
    hint: 'Pack size, weight, variant',
    icon: Type,
    element: {
      kind: 'text',
      box: { ...DROP, height: 0.08 },
      source: { from: 'product', field: 'spec' },
      level: 'caption',
      align: 'start',
    },
  },
  {
    key: 'product-brand',
    label: 'Brand',
    hint: 'Absent on four rows in ten, so give it room to be empty',
    icon: Type,
    element: {
      kind: 'text',
      box: { ...DROP, height: 0.08 },
      source: { from: 'product', field: 'brand' },
      level: 'h6',
      align: 'start',
    },
  },
  {
    key: 'price',
    label: 'Price',
    hint: 'One element. Everything inside it is decided for you',
    icon: Tag,
    element: { kind: 'priceMark', box: { ...DROP, height: 0.2 } },
  },
  {
    key: 'chip',
    label: 'Offer badge',
    hint: 'Reads the promo tier on the offer',
    icon: BadgePercent,
    element: { kind: 'chip', box: { start: 0.04, top: 0.03, width: 0.34, height: 0.1 }, anchor: 'TOP_START' },
  },
]

const STATIC: Entry[] = [
  {
    key: 'static-text',
    label: 'Fixed text',
    hint: 'A headline or a legal line, in both languages',
    icon: Type,
    element: {
      kind: 'text',
      box: DROP,
      source: { from: 'static', textEn: 'Your text', textAr: 'النص' },
      level: 'h2',
      align: 'start',
    },
  },
  {
    key: 'shop-name',
    label: 'Shop details',
    hint: 'Name, phone or address, from the shop',
    icon: Store,
    element: {
      kind: 'text',
      box: { ...DROP, height: 0.1 },
      source: { from: 'shop', field: 'name' },
      level: 'h4',
      align: 'start',
    },
  },
  {
    key: 'logo',
    label: 'Logo',
    hint: 'From the brand kit',
    icon: Layers,
    element: { kind: 'logo', box: { start: 0.04, top: 0.04, width: 0.18, height: 0.14 } },
  },
  {
    key: 'shape',
    label: 'Shape',
    hint: 'A ground or a panel, in one of your brand colours',
    icon: Square,
    element: { kind: 'shape', box: { start: 0, top: 0, width: 1, height: 1 }, surface: 'surface', radius: 3 },
  },
]

export function ElementPalette({ repeats, disabled, onAdd }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {repeats ? (
        <Group
          title="From the catalog"
          note="These change with every product the card is used for."
          entries={BOUND}
          disabled={disabled}
          onAdd={onAdd}
          bound
        />
      ) : null}

      <Group
        title="The same every time"
        note={
          repeats
            ? 'Identical on every card in the book.'
            : 'This block is placed once, so nothing on it comes from a product.'
        }
        entries={STATIC}
        disabled={disabled}
        onAdd={onAdd}
        bound={false}
      />
    </div>
  )
}

function Group({
  title,
  note,
  entries,
  disabled,
  onAdd,
  bound,
}: {
  title: string
  note: string
  entries: Entry[]
  disabled: boolean
  onAdd: (element: BlockElement) => void
  bound: boolean
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-ui text-eyebrow uppercase tracking-wide text-secondary">{title}</h2>
        <p className="font-ui text-body-sm text-muted">{note}</p>
      </div>

      <ul className="flex flex-col gap-1">
        {entries.map((entry) => (
          <li key={entry.key}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAdd(structuredClone(entry.element))}
              className="flex w-full items-start gap-2 rounded-control border-hairline border-border-subtle bg-surface p-2 text-start hover:bg-stone-100 disabled:opacity-50"
            >
              <entry.icon
                className={
                  bound
                    ? 'mt-0.5 size-4 shrink-0 text-link'
                    : 'mt-0.5 size-4 shrink-0 text-muted'
                }
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span className="flex flex-col">
                <span className="font-ui text-label font-medium text-primary">{entry.label}</span>
                <span className="font-ui text-body-sm text-muted">{entry.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
