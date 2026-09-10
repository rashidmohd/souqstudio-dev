'use client'

import * as React from 'react'
import { CalendarClock, Check, Lock } from 'lucide-react'
import type { BrandKit } from '@souqstudio/types'
import {
  BLOCK_CATEGORIES,
  BLOCK_OCCASION,
  occasionWindow,
  type BlockCategory,
  type SeasonWindow,
} from '@souqstudio/engine'
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
  /** The organization's country. National days differ across the Gulf. */
  country: string
  /** Called after a successful import, so the page behind can re-read. */
  onImported: () => void
}

type Filter = BlockCategory | 'all'

/*
 * The category arrives **on the block**, put there by `lib/blocks.ts` when the
 * page read the row.
 *
 * It used to be looked up here, from a `Map` built over `SEED_BLOCKS` — which
 * meant this `'use client'` module imported the shipped library, and every
 * element of every seeded block was downloaded by anyone who opened the
 * designer. 72 KB, to answer *which of five words describes this id*. The
 * server already knows, and was already sending a summary of the row.
 *
 * Still not a column on `blocks`: it is a property of the design we shipped,
 * not a fact about the record. A block the shop authored has a null category
 * and needs none — theirs are not in here.
 */

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

export function BlockImportDialog({ open, onOpenChange, blocks, kit, country, onImported }: Props) {
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

  /**
   * **Read after mount, not during render.** `new Date()` in a render runs once
   * on the server and again in the browser, and the two answers differ — which
   * on the day a window opens is a hydration mismatch React reports and a
   * picker that shows a different order for a frame. Before it is set nothing is
   * promoted, which is the same picker this was a week ago.
   */
  const [now, setNow] = React.useState<Date | null>(null)
  React.useEffect(() => setNow(new Date()), [open])

  /**
   * The blocks whose occasion is running, and the window each is in. E7-03.
   *
   * **Computed rather than read off the row.** `blocks.activeFrom` and
   * `activeTo` are still null on every seeded row and always will be: Ramadan
   * and both Eids move about eleven days a year against the Gregorian calendar,
   * so a date seeded today is wrong by the next re-seed and silently wrong
   * after that. `occasionWindow` in the engine derives it — see that file.
   */
  const inSeason = React.useMemo(() => {
    const windows = new Map<string, SeasonWindow>()
    if (now === null) return windows

    for (const block of blocks) {
      const occasion = BLOCK_OCCASION[block.id]
      if (occasion === undefined) continue
      const window = occasionWindow(occasion, now, country)
      if (window === null) continue
      if (now >= window.from && now <= window.to) windows.set(block.id, window)
    }
    return windows
  }, [blocks, now, country])

  const shown = React.useMemo(() => {
    const matching =
      filter === 'all' ? blocks : blocks.filter((block) => block.category === filter)

    // **Stable, and only the promotion moves.** Sorting by "is it in season"
    // alone would reshuffle the other sixty blocks on a browser whose sort is
    // not stable; comparing the flag and nothing else keeps the library's own
    // order underneath, which is the order an owner saw yesterday.
    return [...matching].sort(
      (a, b) => Number(inSeason.has(b.id)) - Number(inSeason.has(a.id))
    )
  }, [blocks, filter, inSeason])

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
        `${body.data.created.length} added. ${body.data.skipped.length} could not be. They may need a higher plan.`
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
      description="Pick the ones you want. Each becomes a block of your own, yours to edit and available in every book this organization makes."
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
              season={inSeason.get(block.id)}
              now={now}
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
  season,
  now,
  selected,
  onToggle,
}: {
  block: LibraryBlock
  kit: BrandKit
  season: SeasonWindow | undefined
  now: Date | null
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
          {season !== undefined && now !== null ? (
            <span className="flex items-center gap-1 rounded-pill bg-selected-bg px-2 py-px font-ui text-eyebrow uppercase text-selected-fg">
              <CalendarClock className="size-3" strokeWidth={1.75} aria-hidden="true" />
              {seasonLabel(season, now)}
            </span>
          ) : null}
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

/**
 * What the badge says.
 *
 * **"On now" or a countdown, never a date.** A date is a thing an owner has to
 * compare against today; the reason the block is at the top of the picker is
 * that it is nearly time, and that is the sentence. Days rather than a
 * formatted date also sidesteps the question of which calendar to print it in
 * — the answer for Ramadan is not the same as for back to school.
 */
function seasonLabel(season: SeasonWindow, now: Date): string {
  const days = Math.ceil((season.starts.getTime() - now.getTime()) / 86_400_000)
  if (days <= 0) return 'On now'
  return days === 1 ? 'Tomorrow' : `In ${days} days`
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
