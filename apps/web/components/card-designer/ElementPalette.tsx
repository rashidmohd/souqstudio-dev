'use client'

import * as React from 'react'
import {
  BadgePercent,
  Circle,
  Image as ImageIcon,
  Minus,
  Square,
  SquareStack,
  Store,
  Tag,
  Type,
  Upload,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { BlockElement } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { BOUND_ELEMENTS, FREE_ELEMENTS } from '@/lib/block-elements'

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
  /** `atBottom` puts the element behind everything already on the layout. */
  onAdd: (element: BlockElement, atBottom?: boolean) => void
  /** Opens the artwork picker. Absent while uploads are unavailable. */
  onUpload?: (() => void) | undefined
  uploading?: boolean
}

type Entry = {
  key: string
  label: string
  hint: string
  icon: LucideIcon
  make: () => BlockElement
  /**
   * Added behind everything rather than on top. Only a background wants this,
   * and it wants it absolutely: an element that covers the card and paints last
   * is not a background, it is a lid.
   */
  atBottom?: boolean
}

const BOUND: Entry[] = [
  {
    key: 'product-image',
    label: 'Product image',
    hint: 'The packshot, or a reserved space when there is none',
    icon: ImageIcon,
    make: BOUND_ELEMENTS['product-image'],
  },
  {
    key: 'product-name',
    label: 'Product name',
    hint: 'Never typed in, it follows the catalog',
    icon: Type,
    make: BOUND_ELEMENTS['product-name'],
  },
  {
    key: 'product-spec',
    label: 'Size or spec',
    hint: 'Pack size, weight, variant',
    icon: Type,
    make: BOUND_ELEMENTS['product-spec'],
  },
  {
    key: 'product-brand',
    label: 'Brand',
    hint: 'Absent on four rows in ten, so give it room to be empty',
    icon: Type,
    make: BOUND_ELEMENTS['product-brand'],
  },
  {
    key: 'price',
    label: 'Price',
    hint: 'One piece. You place, size and colour it',
    icon: Tag,
    make: BOUND_ELEMENTS.price,
  },
  {
    key: 'chip',
    label: 'Offer badge',
    hint: 'Reads the promo tier on the offer',
    icon: BadgePercent,
    make: BOUND_ELEMENTS.chip,
  },
]

const FREE: Entry[] = [
  {
    key: 'text',
    label: 'Text',
    hint: 'A headline or a legal line, in both languages',
    icon: Type,
    make: FREE_ELEMENTS.text,
  },
  {
    key: 'shop-detail',
    label: 'Shop details',
    hint: 'Name, phone or address, from the shop',
    icon: Store,
    make: FREE_ELEMENTS['shop-detail'],
  },
  {
    key: 'logo',
    label: 'Logo',
    hint: 'From the brand kit',
    icon: SquareStack,
    make: FREE_ELEMENTS.logo,
  },
  {
    key: 'background',
    label: 'Background',
    hint: 'A ground behind everything else',
    icon: Square,
    make: FREE_ELEMENTS.background,
    atBottom: true,
  },
  {
    key: 'rectangle',
    label: 'Rectangle',
    hint: 'A panel, a band, a colour block',
    icon: Square,
    make: FREE_ELEMENTS.rectangle,
  },
  {
    key: 'ellipse',
    label: 'Circle',
    hint: 'A burst, a dot, a rounded ground',
    icon: Circle,
    make: FREE_ELEMENTS.ellipse,
  },
  {
    key: 'line',
    label: 'Line',
    hint: 'A rule or a divider',
    icon: Minus,
    make: FREE_ELEMENTS.line,
  },
]

export function ElementPalette({ repeats, disabled, onAdd, onUpload, uploading }: Props) {
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
        title={repeats ? 'The same every time' : 'Anything you like'}
        note={
          repeats
            ? 'Identical on every card in the book.'
            : 'This panel is placed once, so it is yours to design freely.'
        }
        entries={FREE}
        disabled={disabled}
        onAdd={onAdd}
        bound={false}
      >
        {onUpload ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={disabled}
            loading={uploading ?? false}
            onClick={onUpload}
          >
            <Upload className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Upload artwork
          </Button>
        ) : null}
      </Group>
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
  children,
}: {
  title: string
  note: string
  entries: Entry[]
  disabled: boolean
  /** `atBottom` puts the element behind everything already on the layout. */
  onAdd: (element: BlockElement, atBottom?: boolean) => void
  bound: boolean
  children?: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <h2 className="font-ui text-eyebrow uppercase tracking-wide text-secondary">{title}</h2>
        <p className="font-ui text-body-sm text-muted">{note}</p>
      </div>

      <ul className="flex flex-col gap-1">
        {entries.map((entry) => (
          <li key={entry.key}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAdd(entry.make(), entry.atBottom)}
              className="flex w-full items-start gap-2 rounded-control border-hairline border-border-subtle bg-surface p-2 text-start hover:bg-stone-100 disabled:opacity-50"
            >
              <entry.icon
                className={
                  bound
                    ? 'mt-1 size-4 shrink-0 text-link'
                    : 'mt-1 size-4 shrink-0 text-muted'
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

      {children}
    </section>
  )
}
