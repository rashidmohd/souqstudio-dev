'use client'

import * as React from 'react'
import { Ban } from 'lucide-react'
import type { Arrangement, BrandKit } from '@souqstudio/types'
import { BLOCK_CATEGORIES, type BlockCategory } from '@souqstudio/engine'
import { Dialog } from '@/components/ui/dialog'
import { Segmented } from '@/components/ui/segmented'
import { BlockTile } from '@/components/blocks/BlockTile'

/**
 * What one cell draws, picked by looking at it.
 *
 * **A select was the first version and it was the wrong control.** Sixty-five
 * blocks reduced to sixty-five names in a dropdown asks an owner to know what
 * "Corner flag card" looks like, which is exactly the knowledge the seeded
 * library exists to save them needing. `/brand/blocks` already answers this
 * question with previews grouped by what a block is *for*, and an owner who has
 * added blocks there has already learned that screen.
 *
 * So this is the same shape as `BlockImportDialog` and shares its tile — same
 * uniform preview box, same category filter, same grid. The differences are
 * that this picks **one** rather than many, and that it offers going back to the
 * book's own card as a choice rather than as a separate reset button.
 *
 * **Choosing something that does not repeat moves the products.** A cell holding
 * a brand block takes no offer, so the offer that was there goes to the next
 * cell and the book grows by a page rather than losing it. That is surprising
 * enough to say twice: on the tile that will do it, and again above the button
 * that commits it.
 */

type CellBlock = {
  id: string
  name: string
  repeats: boolean
  arrangements: Arrangement[]
  category: BlockCategory | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  blocks: CellBlock[]
  kit: BrandKit
  /** What the cell draws now. Null once it draws the book's own card. */
  current: string | null
  /** The book's repeating card, offered as the way back. */
  offerCardBlockId: string | null
  onChoose: (blockId: string | null) => void
  busy: boolean
}

type Filter = BlockCategory | 'all'

const CATEGORY_LABEL: Record<BlockCategory, string> = {
  'offer-card': 'Offer cards',
  header: 'Headers',
  panel: 'Panels',
  footer: 'Footers',
  'social-post': 'Square posts',
  seasonal: 'Seasonal',
}

export function CellBlockDialog({
  open,
  onOpenChange,
  blocks,
  kit,
  current,
  offerCardBlockId,
  onChoose,
  busy,
}: Props) {
  const [filter, setFilter] = React.useState<Filter>('all')
  /** `null` is the book's own card. `undefined` is "nothing picked yet". */
  const [picked, setPicked] = React.useState<string | null | undefined>(undefined)

  // Opening starts from what the cell actually draws, so the dialog shows the
  // owner where they are rather than an empty grid. Closing forgets a choice
  // they walked away from.
  React.useEffect(() => {
    if (open) {
      setPicked(undefined)
      setFilter('all')
    }
  }, [open])

  const shown = React.useMemo(
    () => (filter === 'all' ? blocks : blocks.filter((block) => block.category === filter)),
    [blocks, filter]
  )

  // Only the categories this shop actually has. A filter that leads to an empty
  // grid is a control that lies about what is behind it.
  const present = React.useMemo(() => {
    const kinds = new Set(blocks.map((block) => block.category))
    return BLOCK_CATEGORIES.filter((category) => kinds.has(category))
  }, [blocks])

  const chosen = picked === undefined ? current : picked
  const changed = picked !== undefined && picked !== current
  const chosenBlock = chosen === null ? undefined : blocks.find((block) => block.id === chosen)
  const losesProduct = chosenBlock !== undefined && !chosenBlock.repeats

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="What this cell draws"
      description="Every other cell keeps the book's offer card. This one is yours to change."
      {...(changed
        ? {
            primaryAction: {
              label: 'Use this design',
              onClick: () => onChoose(chosen ?? null),
              loading: busy,
            },
            secondaryAction: { label: 'Cancel', onClick: () => onOpenChange(false) },
          }
        : {})}
    >
      <div className="flex flex-col gap-4">
        {/* The row scrolls rather than wrapping. Segments in one shell are the
            control; broken over two lines they stop reading as one. */}
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <Segmented
            label="Filter blocks by what they are for"
            value={filter}
            options={[
              { value: 'all' as const, label: 'All' },
              ...present.map((category) => ({
                value: category,
                label: CATEGORY_LABEL[category],
              })),
            ]}
            onChange={setFilter}
          />
        </div>

        {/*
          Said before it is done rather than discovered afterwards. A cell that
          stops taking a product pushes every offer after it along by one, which
          an owner otherwise reads as their book quietly rearranging itself.
        */}
        {losesProduct ? (
          <p className="flex items-start gap-2 rounded-control bg-caution-bg p-2 font-ui text-body-sm text-caution-fg">
            <Ban className="mt-px size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>
              This one shows no product, so the offer in this cell moves along to the
              next one. Nothing is dropped.
            </span>
          </p>
        ) : null}

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {/*
            **The way back is a tile, not a reset button beside the grid.** "What
            does this cell draw" has one answer at a time and the book's own card
            is one of the answers, so it belongs in the same list as the others —
            the same reasoning `Band` uses for putting "None" first in its select.
          */}
          {offerCardBlockId === null ? null : (
            <BlockTile
              name="The book's offer card"
              arrangements={
                blocks.find((block) => block.id === offerCardBlockId)?.arrangements ?? []
              }
              repeats
              kit={kit}
              selected={chosen === null || chosen === offerCardBlockId}
              onSelect={() => setPicked(null)}
              badges={
                <span className="rounded-pill bg-sand px-2 py-px font-ui text-eyebrow uppercase text-secondary">
                  Like every other cell
                </span>
              }
            />
          )}

          {shown
            .filter((block) => block.id !== offerCardBlockId)
            .map((block) => (
              <BlockTile
                key={block.id}
                name={block.name}
                arrangements={block.arrangements}
                repeats={block.repeats}
                kit={kit}
                selected={chosen === block.id}
                onSelect={() => setPicked(block.id)}
                badges={
                  block.repeats ? null : (
                    <span className="rounded-pill bg-sand px-2 py-px font-ui text-eyebrow uppercase text-secondary">
                      No product
                    </span>
                  )
                }
              />
            ))}
        </ul>
      </div>
    </Dialog>
  )
}
