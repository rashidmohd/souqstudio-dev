'use client'

import * as React from 'react'
import { Check, Lock } from 'lucide-react'
import type { BrandKit } from '@souqstudio/types'
import { BLOCK_CATEGORIES, SEED_BLOCKS, type BlockCategory } from '@souqstudio/engine'
import { Dialog } from '@/components/ui/dialog'
import { Segmented } from '@/components/ui/segmented'
import { BlockPreview } from '@/components/blocks/BlockPreview'
import type { LibraryBlock } from '@/components/blocks/BlockLibrary'
import { cn } from '@/lib/utils'

/**
 * Adding blocks from the seeded library. E7 — `docs/composition-model.md` §3.6.
 *
 * **The library used to be printed on the page underneath the shop's own, and
 * at sixty-seven blocks that stopped working.** Two collections of very
 * different sizes were shown the same way, so the four blocks a shop had
 * designed — the ones they can actually change, and the whole point of the
 * screen — sat above a wall of sixty-seven they cannot. The shop's library is
 * the page now; ours is a thing you go and get something from.
 *
 * That reframing is what makes the filter honest rather than decorative. On a
 * page you scroll, a category heading is a signpost. In a picker, "footers" is
 * the question the owner arrived with, and answering it should remove the other
 * sixty-two blocks from the screen rather than move them further down it.
 *
 * **Selection is multiple, and the action names the count.** An owner setting up
 * comes for a card, a header and a footer in one go; making them open this three
 * times to get three blocks is the kind of friction that reads as the product
 * not understanding what they are doing.
 */

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The seeded collection — `organizationId: null`. */
  blocks: LibraryBlock[]
  kit: BrandKit
  /** Called after a successful import, so the page behind can re-read. */
  onImported: () => void
}

type Filter = BlockCategory | 'all'

/**
 * Which group a seeded block belongs to, read from the library rather than from
 * the row.
 *
 * **Not a column on `blocks`.** It is a property of the design we shipped, not a
 * fact about a database record, and a column would be one only the seed ever
 * writes and only this dialog ever reads. A block the shop authored has no
 * category and needs none — theirs are not in here.
 */
const SEEDED_CATEGORY = new Map<string, BlockCategory>(
  SEED_BLOCKS.map((block) => [block.id, block.category])
)

const categoryOf = (id: string): BlockCategory => SEEDED_CATEGORY.get(id) ?? 'panel'

/**
 * The filter's words are what a block is *for*, because that is the question an
 * owner is holding when they open this. Not "repeating" and "static", which is
 * how the schema thinks about it and how nobody else does.
 */
const CATEGORY_LABEL: Record<BlockCategory, string> = {
  'offer-card': 'Offer cards',
  header: 'Headers',
  panel: 'Panels',
  footer: 'Footers',
  seasonal: 'Seasonal',
}

const CATEGORY_NOTE: Record<Filter, string> = {
  all: 'Everything we ship, in your own colours and typefaces.',
  'offer-card': 'One per product. Each reflows into whatever shape its region turns out to be.',
  header: 'The front of a book, the band across a page, and the dividers between sections.',
  panel: 'Placed once. Pin one into a book and the products route around it.',
  footer: 'The last row of a page, and the small print that has to be somewhere.',
  seasonal: 'The occasions, with the greeting already set in both languages.',
}

/**
 * The preview box every tile gets, and the blocks are fitted *inside* it.
 *
 * A `lg` dialog is 672px, less 24px of inline padding each side, less two 12px
 * gaps across three columns — so a tile is about 200px and its preview about
 * 176 once the tile's own padding comes off.
 *
 * **Uniform box, block contained within it**, which is the opposite of what the
 * page does. On the page each preview sets its own height and the grid absorbs
 * it; in a three-column picker that produces rows of wildly different heights
 * and a footer strip 22px tall sitting beside a 240px card. Fitting each block
 * into one box keeps the grid a grid and still draws every block at its own
 * proportions — a footer really is a thin strip, and showing it as one is the
 * information.
 */
const TILE_WIDTH = 176
const TILE_HEIGHT = 160

export function BlockImportDialog({ open, onOpenChange, blocks, kit, onImported }: Props) {
  const [filter, setFilter] = React.useState<Filter>('all')
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Closing and reopening starts clean. A picker that remembers a selection the
  // owner walked away from will add blocks they thought they had abandoned.
  React.useEffect(() => {
    if (!open) {
      setSelected(new Set())
      setFilter('all')
      setError(null)
    }
  }, [open])

  const shown = React.useMemo(
    () => (filter === 'all' ? blocks : blocks.filter((block) => categoryOf(block.id) === filter)),
    [blocks, filter]
  )

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function add() {
    setBusy(true)
    setError(null)

    const response = await fetch('/api/v1/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromIds: [...selected] }),
    })
    const body = (await response.json()) as {
      data: { created: { id: string; name: string }[]; skipped: string[] } | null
      error: { message: string } | null
    }
    setBusy(false)

    if (body.data === null) {
      setError(body.error?.message ?? 'Those blocks could not be added.')
      return
    }

    // A partial result is reported rather than hidden. Seven blocks arriving and
    // one not is a fact the owner needs — silently adding fewer than they picked
    // is how a footer goes missing from a book two weeks later.
    if (body.data.skipped.length > 0) {
      setSelected(new Set(body.data.skipped))
      setError(
        `${body.data.created.length} added. ${body.data.skipped.length} could not be — they may need a higher plan.`
      )
      onImported()
      return
    }

    onImported()
    onOpenChange(false)
  }

  const count = selected.size
  const options = [
    { value: 'all' as const, label: 'All' },
    ...BLOCK_CATEGORIES.map((category) => ({ value: category, label: CATEGORY_LABEL[category] })),
  ]

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Add blocks to your library"
      description="Pick the ones you want. Each becomes a block of your own — yours to edit, and available in every book this organization makes."
      // **No action row until something is picked**, rather than a primary that
      // is there and does nothing. `Dialog` has no `disabled` on its action and
      // should not grow one: a confirm dialog's primary *is* the decision, so a
      // dialog with no decision available yet has no action to show. The header
      // close and Escape are the way out in the meantime.
      {...(count === 0
        ? {}
        : {
            primaryAction: {
              label: count === 1 ? 'Add 1 block' : `Add ${count} blocks`,
              onClick: () => void add(),
              loading: busy,
            },
            secondaryAction: { label: 'Cancel', onClick: () => onOpenChange(false) },
          })}
    >
      <div className="flex flex-col gap-4">
        {/* The row scrolls rather than wrapping. Six segments in one shell is
            the control; broken over two lines it stops reading as one. */}
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <Segmented
            label="Filter blocks by what they are for"
            value={filter}
            options={options}
            onChange={setFilter}
          />
        </div>

        <p className="font-ui text-body-sm text-muted">
          {CATEGORY_NOTE[filter]}{' '}
          <span className="text-secondary">
            {shown.length} {shown.length === 1 ? 'block' : 'blocks'}
            {count > 0 ? ` · ${count} selected` : ''}
          </span>
        </p>

        {error ? (
          <p role="status" className="font-ui text-body-sm text-critical-fg">
            {error}
          </p>
        ) : null}

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shown.map((block) => (
            <Tile
              key={block.id}
              block={block}
              kit={kit}
              selected={selected.has(block.id)}
              onToggle={() => toggle(block.id)}
            />
          ))}
        </ul>
      </div>
    </Dialog>
  )
}

/**
 * One block, pickable.
 *
 * The whole tile is the target rather than a checkbox in the corner of it: the
 * thing an owner is deciding about is the picture, and a hit area the size of a
 * picture is what a picker should have. `aria-pressed` is what carries the state
 * to anyone not looking at the ring.
 */
function Tile({
  block,
  kit,
  selected,
  onToggle,
}: {
  block: LibraryBlock
  kit: BrandKit
  selected: boolean
  onToggle: () => void
}) {
  const size = tileSize(block)

  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        disabled={block.locked}
        onClick={onToggle}
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
          <BlockPreview arrangements={block.arrangements} kit={kit} {...size} />

          {selected ? (
            <span className="absolute end-1 top-1 flex size-4 items-center justify-center rounded-pill bg-action-primary text-inverse">
              <Check className="size-3" strokeWidth={2.5} aria-hidden="true" />
            </span>
          ) : null}
        </div>

        <span className="flex flex-wrap items-center gap-1">
          <span className="font-ui text-label font-medium text-primary">{block.name}</span>
          {block.locked ? (
            <span className="flex items-center gap-1 rounded-pill bg-sand px-2 py-px font-ui text-eyebrow uppercase text-secondary">
              <Lock className="size-3" strokeWidth={1.75} aria-hidden="true" />
              {block.planTier}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  )
}

function tileSize(block: LibraryBlock): { width: number; height: number } {
  const arrangement = block.arrangements[0]

  // A repeating card is drawn in the shape a booklet cell actually is — it
  // carries four arrangements and the tall one is the one it was designed in.
  // A block placed once is drawn at the shape its own aspect range says it was
  // designed for, which is what `defaultShape` reads in the designer.
  const natural =
    block.repeats || arrangement === undefined
      ? 0.72
      : Math.min(6, Math.max(0.4, Math.sqrt(arrangement.aspectMin * arrangement.aspectMax)))

  return natural > TILE_WIDTH / TILE_HEIGHT
    ? { width: TILE_WIDTH, height: Math.round(TILE_WIDTH / natural) }
    : { width: Math.round(TILE_HEIGHT * natural), height: TILE_HEIGHT }
}
