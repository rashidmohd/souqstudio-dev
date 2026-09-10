'use client'

import * as React from 'react'
import { Check, Lock } from 'lucide-react'
import type { BrandKit } from '@souqstudio/types'
import { BlockPreview } from '@/components/blocks/BlockPreview'
import { cn } from '@/lib/utils'
import type { PickableBlock } from '@/components/offer-book/types'

/**
 * Picking the offer card a book is built from. E6 —
 * `docs/E6-create-flow.md` §2.2.
 *
 * **Twenty-five offer cards were seeded in E7 and not one of them was reachable
 * from the flow that makes a book.** `bookletGrid` closed over a module constant
 * — `const OFFER_CARD = byId('blk_offer_card')` — so every book this product has
 * ever created used the same design, and the library was a gallery an owner
 * could browse at `/brand/blocks` and could not act on. This step is the whole
 * reason the creation flow was reopened.
 *
 * **What is being chosen is the repeating card, and only that.** Headers,
 * footers and panels are placed once and are the editor's job; offering them
 * here would be four questions inside one step. So the list is
 * `category === 'offer-card'` plus whatever repeating blocks the shop designed
 * itself.
 *
 * **The shop's own come first**, which is the order `listBlocks` already
 * returns. They are the ones the owner can change, and on a screen that is
 * otherwise ours that distinction is worth the position.
 *
 * **A locked block is shown and not selectable**, with the plan named on the
 * tile. A grid that silently omits the designs a shop is one upgrade away from
 * undersells the product, and a disabled control whose reason is only in a
 * tooltip is unreachable on the tablet this ships on.
 */
type Props = {
  blocks: PickableBlock[]
  kit: BrandKit
  value: string
  onChange: (blockId: string) => void
  /** The book's language, never the interface's. The tile draws what will print. */
  direction: 'ltr' | 'rtl'
}

/**
 * The tile, in the proportions the cards are designed at.
 *
 * `TALL` is 0.35–0.85 and every kind's cells land inside it — `book-kind.ts`
 * carries the measured table — so a tile at 0.7 is showing the owner roughly
 * what they will get rather than a shape no page produces.
 */
const TILE = { width: 154, height: 220 }

export function DesignPicker({ blocks, kit, value, onChange, direction }: Props) {
  const own = blocks.filter((block) => block.organizationId !== null)
  const seeded = blocks.filter((block) => block.organizationId === null)

  return (
    <div className="flex flex-col gap-4">
      {own.length > 0 ? (
        <Group title="Your designs" blocks={own} {...{ kit, value, onChange, direction }} />
      ) : null}
      <Group
        title={own.length > 0 ? 'From the library' : 'Pick a design'}
        blocks={seeded}
        {...{ kit, value, onChange, direction }}
      />
    </div>
  )
}

function Group({
  title,
  blocks,
  kit,
  value,
  onChange,
  direction,
}: { title: string; blocks: PickableBlock[] } & Omit<Props, 'blocks'>) {
  if (blocks.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-ui text-label font-medium text-secondary">{title}</h3>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {blocks.map((block) => (
          <li key={block.id}>
            <Tile
              block={block}
              kit={kit}
              checked={block.id === value}
              onSelect={() => onChange(block.id)}
              direction={direction}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function Tile({
  block,
  kit,
  checked,
  onSelect,
  direction,
}: {
  block: PickableBlock
  kit: BrandKit
  checked: boolean
  onSelect: () => void
  direction: 'ltr' | 'rtl'
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer flex-col gap-2 rounded-card border-hairline p-2',
        'transition-colors duration-fast',
        checked ? 'border-border-focus bg-selected-bg' : 'border-border-subtle',
        block.locked ? 'cursor-not-allowed' : 'hover:bg-stone-100'
      )}
    >
      <input
        type="radio"
        name="card-design"
        checked={checked}
        onChange={onSelect}
        disabled={block.locked}
        className="sr-only"
      />

      <span
        className={cn(
          'relative flex justify-center overflow-hidden rounded-control bg-sunken',
          block.locked && 'opacity-disabled'
        )}
      >
        <BlockPreview
          arrangements={block.arrangements}
          kit={kit}
          width={TILE.width}
          height={TILE.height}
          direction={direction}
        />
        {checked ? (
          <span
            aria-hidden="true"
            className="absolute end-1 top-1 flex h-chip w-chip items-center justify-center rounded-full bg-action-primary text-action-primary-fg"
          >
            <Check className="size-4" strokeWidth={2} />
          </span>
        ) : null}
      </span>

      <span className="flex flex-col">
        <span className="truncate font-ui text-body-sm font-medium text-primary" title={block.name}>
          {block.name}
        </span>
        {block.locked ? (
          <span className="flex items-center gap-1 font-ui text-body-sm text-muted">
            <Lock className="size-4 shrink-0" aria-hidden="true" strokeWidth={1.75} />
            On the {block.planTier} plan
          </span>
        ) : null}
      </span>
    </label>
  )
}
