'use client'

import * as React from 'react'
import { Ban, Check, Pencil } from 'lucide-react'
import type { Arrangement, BrandKit } from '@souqstudio/types'
import { BLOCK_CATEGORIES, type BlockCategory } from '@souqstudio/engine'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Segmented } from '@/components/ui/segmented'
import { BlockTile, TILE_HEIGHT } from '@/components/blocks/BlockTile'
import { bandBlocks } from '@/lib/band-blocks'
import { cn } from '@/lib/utils'

/**
 * Which design is drawn, picked by looking at it — for one cell, or for the
 * whole book.
 *
 * **One picker at two scopes, because it is one question.** "Which of these
 * sixty-five" is the same act whether the answer applies to a cell or to every
 * cell; what differs is the sentence above the grid and which blocks are even
 * candidates. Two components would be two category filters, two tile grids and
 * two places to fix the next thing wrong with either.
 *
 * At `book` scope only *repeating* blocks are offered, and that is not a
 * nicety. A region's fill is decided from the block's own `repeats`, so a panel
 * as the book-wide card turns every flowing cell static — a book whose cells
 * all refuse products places none of them. At `cell` scope a static block is
 * exactly the point, and the warning below says what it costs.
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
 * **The running bands came here last, and they had the same fault.** A header
 * and a footer were two selects in the layout panel, which asked an owner to
 * know what "Corner flag band" looks like — the identical question this dialog
 * was built to stop asking about cards. They are the choice a book is *most*
 * judged on: a band is on every page, so a wrong one is wrong forty times. They
 * are scopes here now, and "None" is a tile in the grid rather than the first
 * row of a dropdown, which is where the select already put it and for the same
 * reason: taking the footer off is one of the answers to "what is along the
 * bottom", not a different kind of act.
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

/**
 * What is being chosen for.
 *
 * It decides the wording, which blocks are candidates, and which of the two
 * "nothing" answers — the book's own card, or no band at all — is offered as a
 * tile.
 */
export type PickerScope = 'cell' | 'book' | 'header' | 'footer'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * `cell` changes the one cell the owner clicked; `book` changes the card
   * every cell draws; `header` and `footer` change the band on every page.
   */
  scope: PickerScope
  blocks: CellBlock[]
  kit: BrandKit
  /**
   * What is drawn now. Null at cell scope once the cell draws the book's card,
   * and at band scope when the book has no band at that end.
   */
  current: string | null
  /** The book's repeating card, offered as the way back. Cell scope only. */
  offerCardBlockId: string | null
  onChoose: (blockId: string | null) => void
  busy: boolean
  /**
   * Open the designer on the chosen design. Absent for a member who may not
   * change blocks, which is the same bar the API puts on it.
   *
   * **Beside the grid rather than on each tile.** "Edit" applies to the design
   * the owner has settled on, and a pencil on sixty-five tiles invites opening
   * a designer on something they were only looking at.
   */
  onEdit?: ((blockId: string) => void) | undefined
}

type Filter = BlockCategory | 'all'

const TITLE: Record<PickerScope, string> = {
  book: 'The card every cell draws',
  cell: 'What this cell draws',
  header: 'The band across the top',
  footer: 'The band across the bottom',
}

/**
 * **Each says what it applies to, because that is what the scopes differ in.**
 * A band is on every page; a cell is one cell. An owner who reads the sentence
 * above the grid should not have to remember which control they came from.
 */
const DESCRIPTION: Record<PickerScope, string> = {
  book: 'Every product in this book is drawn with this design.',
  cell: "Every other cell keeps the book's offer card. This one is yours to change.",
  header: 'Drawn along the top of every page in this book.',
  footer: 'Drawn along the bottom of every page in this book.',
}

/**
 * Committing "None" at a band scope, which is a removal and should read like
 * one — "Use this header" over an empty tile is a sentence about nothing.
 */
const REMOVE: Record<PickerScope, string> = {
  book: '',
  cell: '',
  header: 'Remove the header',
  footer: 'Remove the footer',
}

/** What "Use this" commits to, said in the words of the thing being changed. */
const COMMIT: Record<PickerScope, string> = {
  book: 'Use this design',
  cell: 'Use this design',
  header: 'Use this header',
  footer: 'Use this footer',
}

const CATEGORY_LABEL: Record<BlockCategory, string> = {
  'offer-card': 'Offer cards',
  header: 'Headers',
  panel: 'Panels',
  footer: 'Footers',
  'social-post': 'Square posts',
  seasonal: 'Seasonal',
}

export function BlockPickerDialog({
  open,
  onOpenChange,
  scope,
  blocks,
  kit,
  current,
  offerCardBlockId,
  onChoose,
  busy,
  onEdit,
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

  /*
   * At book scope a static block is not a candidate at all — see the note at
   * the top. At a band scope the test is the mirror image and lives in
   * `lib/band-blocks.ts`, because the layout panel applies it too. Filtered
   * before the category row rather than refused on choosing, so the owner never
   * picks something that is then taken back.
   */
  const candidates = React.useMemo(() => {
    if (scope === 'book') return blocks.filter((block) => block.repeats)
    if (scope === 'header' || scope === 'footer') return bandBlocks(blocks, scope)
    return blocks
  }, [blocks, scope])

  const shown = React.useMemo(
    () =>
      filter === 'all' ? candidates : candidates.filter((block) => block.category === filter),
    [candidates, filter]
  )

  // Only the categories this shop actually has. A filter that leads to an empty
  // grid is a control that lies about what is behind it.
  const present = React.useMemo(() => {
    const kinds = new Set(candidates.map((block) => block.category))
    return BLOCK_CATEGORIES.filter((category) => kinds.has(category))
  }, [candidates])

  const chosen = picked === undefined ? current : picked
  const changed = picked !== undefined && picked !== current
  const chosenBlock = chosen === null ? undefined : blocks.find((block) => block.id === chosen)
  /*
   * Cell scope only, and now stated rather than implied. Book scope offers no
   * static block to pick, so this could never fire there — but a band offers
   * *nothing else*, and the warning would have appeared on every band an owner
   * ever chose, telling them a product was about to move when a band has never
   * been handed one.
   */
  const losesProduct = scope === 'cell' && chosenBlock !== undefined && !chosenBlock.repeats

  const band = scope === 'header' || scope === 'footer'

  /**
   * Which design "Edit" would open.
   *
   * At book scope that is whatever is selected. At cell scope `null` means the
   * cell has gone back to the book's own card, so the thing to edit is the
   * book's card — which is what the owner is looking at either way.
   */
  const editing = band ? chosen : (chosen ?? offerCardBlockId)

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={TITLE[scope]}
      description={DESCRIPTION[scope]}
      {...(changed
        ? {
            primaryAction: {
              label: chosen === null && band ? REMOVE[scope] : COMMIT[scope],
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

        {/*
          **The library can be empty at a band scope, and a select said so in a
          hint.** Nothing else in this dialog can be: a shop always has offer
          cards, because we ship them. A shop with no footer in its library —
          possible the day it archives ours — must be told that rather than shown
          an empty grid it will read as a broken screen.
        */}
        {candidates.length === 0 ? (
          <p className="font-ui text-body-sm text-secondary">
            You have no {scope === 'header' ? 'headers' : 'footers'} in your library yet. Add one
            from the block library and it will be here for every book.
          </p>
        ) : null}

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {/*
            **"None" is a tile, in the grid, first.** The select it replaced put
            it first in the list for the reason that still holds: an owner is
            answering "what runs along the bottom of every page", and "nothing"
            is one of the answers rather than a separate act of removal. It is
            drawn as an empty frame because that is what it does to the page.
          */}
          {!band ? null : (
            <li>
              <button
                type="button"
                aria-pressed={chosen === null}
                onClick={() => setPicked(null)}
                className={cn(
                  'flex w-full flex-col gap-2 rounded-card border-hairline p-2 text-start',
                  chosen === null
                    ? 'border-border-focus bg-selected-bg'
                    : 'border-border-subtle hover:bg-stone-100'
                )}
              >
                <span
                  className="relative flex items-center justify-center overflow-hidden rounded-control border-hairline border-border-subtle bg-stone-0"
                  style={{ height: TILE_HEIGHT }}
                >
                  <Ban className="size-4 text-muted" strokeWidth={1.75} aria-hidden="true" />
                  {chosen === null ? (
                    <span className="absolute end-1 top-1 flex size-4 items-center justify-center rounded-pill bg-action-primary text-inverse">
                      <Check className="size-3" strokeWidth={2.5} aria-hidden="true" />
                    </span>
                  ) : null}
                </span>
                <span className="truncate font-ui text-label font-medium text-primary">
                  None
                </span>
              </button>
            </li>
          )}
          {/*
            **The way back is a tile, not a reset button beside the grid.** "What
            does this cell draw" has one answer at a time and the book's own card
            is one of the answers, so it belongs in the same list as the others —
            the same reasoning `Band` uses for putting "None" first in its select.
          */}
          {/*
            Cell scope only. At book scope "the book's offer card" is the thing
            being chosen, so offering it as one of the choices would be a tile
            that means "leave it as it is" sitting in a grid of designs.
          */}
          {scope !== 'cell' || offerCardBlockId === null ? null : (
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
            .filter((block) => scope !== 'cell' || block.id !== offerCardBlockId)
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

        {/*
          **Change and edit, in one place, because the owner is holding one
          design.** Picking a different card and reworking the card they have
          are the two things they came here to do, and separating them across a
          dialog and a panel means learning where each one lives.

          It names the design rather than saying "Edit this", so a press is
          never ambiguous about which of the sixty-five it opens — and it is
          disabled while a choice is unsaved, because editing the design you
          have not applied yet is a trap: the window would open on a block this
          book does not draw.
        */}
        {onEdit === undefined || editing === null ? null : (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t-hairline border-border-subtle pt-4">
            <p className="font-ui text-body-sm text-secondary">
              {changed
                ? 'Apply this design first, then you can edit it.'
                : 'Want it to look different? Open it in the designer.'}
            </p>
            <Button
              type="button"
              variant="secondary"
              disabled={changed || busy}
              onClick={() => onEdit(editing)}
            >
              <Pencil className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Edit this design
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  )
}
