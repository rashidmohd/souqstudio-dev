'use client'

import * as React from 'react'
import type { Block, BrandColor, BrandKit, PageBackground, SlotOverride, TokenRef } from '@souqstudio/types'
import {
  applyOverride,
  compactBlock,
  findOverride,
  resolveBlock,
  spansIntersect,
  type CellSpan,
  type CompactionPolicy,
  type FlowPage,
  type MasterCell,
  type Rect,
} from '@souqstudio/engine'
import { resolvePalette, resolveToken } from '@/lib/brand-palette'
import { resolveScale } from '@/lib/brand-fonts'
import {
  contentFor,
  drawElement,
  estimateWidth,
  fitTextElement,
  measureText,
  paintFill,
  type DrawContext,
} from '@/components/blocks/draw'
import type { ComposedOffer } from '@/lib/offer-book-compose'

/**
 * One page of an offer book, drawn.
 *
 * **The first thing in the product that draws a page from database rows.**
 * Everything before it drew literals: the render harness composes invented
 * products, and `BlockPreview` draws one block against a sample. This takes what
 * `loadBook` composed and paints it.
 *
 * **Inline SVG, not Fabric, and that is not a shortcut.** Fabric is the
 * *editor's* renderer, where dragging and nudging need an object model. A page
 * that is only looked at needs neither, and going through Fabric would mean
 * loading it — plus `document.fonts.load()` for every family and weight before a
 * single text object, or every bounding box is measured against the fallback —
 * on a screen that has nothing to drag yet.
 *
 * **It computes no geometry and paints nothing itself.** `flowBook` decided which
 * block sits in which rectangle carrying which offer; `resolveBlock` turns a
 * block into element rectangles; `components/blocks/draw` paints them, and
 * `/brand` uses the same painter. Two implementations of a card is how the PDF
 * stops matching the screen.
 */
type Props = {
  page: FlowPage
  size: { width: number; height: number }
  offers: Record<string, ComposedOffer>
  blocks: Record<string, Block>
  kit: BrandKit
  /** The shop's name, for a block binding `shop.name` — a footer, a hero band.
   *  Not on the brand kit: the kit is identity, and which shop is printing this
   *  book is a property of the book. */
  shopName: string
  /** The **book's** language, never the interface's. */
  direction: 'ltr' | 'rtl'
  /**
   * The paper. Absent is `--sq-tpl-paper`, which is what this drew before the
   * field existed, so nothing was taken away by adding it.
   */
  background?: PageBackground | null | undefined
  /**
   * Artwork the owner uploaded, by R2 key.
   *
   * **Absent means an image background draws nothing**, and the same is already
   * true of an `image` element inside a block — `DrawContext.asset`. That is not
   * a placeholder decision so much as an admission: a surface that has not been
   * given the base URL cannot invent one.
   */
  asset?: ((assetId: string) => string | null) | undefined
  /** Where a card's unused height goes. See `compactBlock`. */
  compaction?: CompactionPolicy
  /**
   * This page's bounded nudges. E6-04.
   *
   * **Applied after compaction, last of all.** Compaction reclaims the space a
   * card's content did not use, which changes the rectangles; an override
   * applied before it would be measured against boxes that no longer exist. A
   * nudge is the owner's word on the finished card.
   */
  overrides?: readonly SlotOverride[]
  /** The offer whose card carries the selection ring, if it is on this page. */
  selectedOfferId?: string | null
  /** Selecting a card. Absent on a read-only surface — a page with no handler
   *  renders no hit targets at all rather than pressable-looking cards that do
   *  nothing. */
  onSelectOffer?: (offerId: string) => void
  /**
   * Which offers on this page ran out of rungs on the fit ladder.
   *
   * **Reported rather than returned, because it is only knowable here.** E6-01
   * makes `fit-escalated` a quality flag the owner sees before publishing, and
   * unlike the other three it is not decidable from the rows: it depends on the
   * box the card landed in and on the type scale the shop chose. The page is
   * the only place that knows both.
   */
  onEscalated?: (offerIds: string[]) => void
  /**
   * The master's flowing cells, which turns the page into a surface an owner can
   * select cells on. Absent is the read-only artboard: the preview screen and
   * the export render pages, they do not restructure them.
   *
   * **The master's, not this page's.** A cell with no offer on it is still a
   * cell — the last page of a book is mostly empty, and that is exactly where a
   * hero band gets built. `flowBook` emits no placement for those, so an editor
   * driven by placements could not address them.
   */
  cells?: readonly MasterCell[]
  /**
   * The selected span, in body-card coordinates.
   *
   * **Drawn on every page, and that is the point.** There is one master grid and
   * every body page is an instance of it, so selecting the top two cells selects
   * them on all nine pages — and merging them changes all nine. An owner who
   * sees the selection appear on every page has been told that before they press
   * the button rather than after. Composition model §5.
   */
  cellSelection?: CellSpan | null
  /** A cell was picked. `extend` is a shift-click or a drag, which grows the
   *  selection from its anchor rather than starting a new one. */
  onSelectCell?: (cell: MasterCell, options: { extend: boolean; offerId: string | null }) => void
  className?: string
}

export function BookPage({
  page,
  size,
  offers,
  blocks,
  kit,
  shopName,
  direction,
  background = null,
  asset,
  compaction = 'balance',
  overrides = [],
  selectedOfferId = null,
  onSelectOffer,
  onEscalated,
  cells,
  cellSelection = null,
  onSelectCell,
  className,
}: Props) {
  // Structural editing is on only when the surface was given both the cells and
  // somewhere to report a pick. One without the other would draw a grid nothing
  // responds to, or listen for clicks on cells that were never drawn.
  const editingCells = cells !== undefined && onSelectCell !== undefined
  const palette = resolvePalette(kit)
  const scale = resolveScale(kit)

  // Estimate on the server and the first client paint, real metrics after mount
  // — otherwise the two renders break lines differently and React flags the
  // mismatch. Same reasoning as `BlockPreview`.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const measure = mounted ? measureText : estimateWidth

  // Collected during render into a plain array — no state is written here — and
  // reported from an effect below. The alternative, a second pass over the same
  // blocks in a separate module, would be a second implementation of the two-
  // pass compaction this component already performs.
  const escalated: string[] = []

  /**
   * The offer sitting in a region *on this page*.
   *
   * A cell belongs to the master and an offer belongs to a page, so the cell
   * layer cannot know this and the page can: the same region carries a different
   * product on every page of the book, and none at all where a pin took it.
   */
  const offerAt = React.useCallback(
    (regionId: string): string | null =>
      page.placements.find((placement) => placement.sourceId === regionId)?.offerId ?? null,
    [page.placements]
  )

  const report = React.useRef(onEscalated)
  report.current = onEscalated
  const uid = React.useId()
  const escalatedKey = escalated.join(',')
  React.useEffect(() => {
    // Only once the real measurer is in play: the server estimate breaks lines
    // differently, and flagging a card on it would show a warning that
    // disappears a frame later.
    if (mounted) report.current?.(escalatedKey === '' ? [] : escalatedKey.split(','))
  }, [escalatedKey, mounted])

  return (
    <svg
      viewBox={`0 0 ${size.width} ${size.height}`}
      width="100%"
      className={className}
      role="img"
      aria-label={`Page ${page.index + 1}`}
    >
      <PageGround
        background={background}
        size={size}
        token={(ref) => resolveToken(palette, ref)}
        palette={palette}
        asset={asset}
        uid={uid}
      />

      {page.placements.map((placement, index) => {
        const block = blocks[placement.blockId]
        if (block === undefined) return null

        const offer = placement.offerId === null ? undefined : offers[placement.offerId]

        // Type levels size against the block, not the element box — that is what
        // keeps h1 larger than h2 in a 1080px post and a 380px booklet cell
        // alike. Geometric mean rather than the shorter edge: a footer band is
        // wide and short, and anchoring to its shorter edge collapses its type.
        const blockSize = Math.sqrt(placement.rect.width * placement.rect.height)

        const ctx: DrawContext = {
          // Per placement, not per page: the same block appears in several
          // cells of one page and each draws its own gradient definition.
          uid: `${uid}-${index}`,
          token: (ref) => resolveToken(palette, ref),
          scale,
          blockSize,
          ar: direction === 'rtl',
          direction,
          measure,
          offer,
          shopName,
        }

        const resolved = resolveBlock(block, placement.rect, direction)

        // Two passes, and only two: fit against the box the block designed to
        // learn what the content used, reclaim the rest, then fit again against
        // the box that came back. It converges because compaction changes
        // heights only and line breaking is driven by width.
        const compacted = compactBlock(
          resolved,
          ({ element, rect }) => neededHeight(element, rect, ctx),
          compaction
        )

        const nudged = applyOverride(
          compacted,
          placement.rect,
          findOverride(overrides, placement.sourceId, placement.offerId)
        )

        // The same ladder the painter runs, on the same boxes, so the flag and
        // the drawn card can never disagree about whether the text fitted.
        if (placement.offerId !== null) {
          for (const { element, rect } of nudged.elements) {
            if (element.kind !== 'text') continue
            const measured = fitTextElement(element, rect, ctx)
            if (measured?.fitted.escalated === true) {
              if (!escalated.includes(placement.offerId)) escalated.push(placement.offerId)
              break
            }
          }
        }

        // Off while the cell layer is up: it draws one hit target per cell and
        // reports the offer on it, so leaving these in place would put two
        // buttons over one card and two tab stops on one thing.
        const selectable =
          !editingCells && onSelectOffer !== undefined && placement.offerId !== null
        const selected =
          !editingCells && placement.offerId !== null && placement.offerId === selectedOfferId

        return (
          <React.Fragment key={`${placement.blockId}-${index}`}>
            {nudged.elements.map(({ element, rect }, elementIndex) => (
              <React.Fragment key={elementIndex}>
                {drawElement(element, rect, ctx)}
              </React.Fragment>
            ))}

            {selected ? (
              // Drawn after the card so the ring is never covered by an element
              // that overhangs its box — a tier chip anchored TOP_START does
              // exactly that, by design.
              <rect
                {...rectAttrs(placement.rect)}
                rx={3}
                fill="none"
                stroke="var(--sq-ui-selected-ring)"
                strokeWidth={Math.max(2, placement.rect.width * 0.006)}
                pointerEvents="none"
              />
            ) : null}

            {selectable ? (
              // A transparent hit target over the whole cell rather than
              // handlers on each element: the gaps between a card's elements are
              // part of the card, and an owner tapping the whitespace beside a
              // price expects to select it.
              //
              // A `<button>` inside SVG would need a foreignObject; a rect with
              // a role and a key handler is what SVG gives us, and it keeps the
              // tab order in document order — which is page order.
              <rect
                {...rectAttrs(placement.rect)}
                fill="transparent"
                role="button"
                tabIndex={0}
                aria-label={offer ? offer.name : 'Offer'}
                aria-pressed={selected}
                className="cursor-pointer outline-none"
                onClick={() => onSelectOffer(placement.offerId as string)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  onSelectOffer(placement.offerId as string)
                }}
              />
            ) : null}
          </React.Fragment>
        )
      })}

      {/* Narrowed inline rather than through `editingCells`, so the compiler
          carries the non-null through to the props instead of an assertion. */}
      {cells !== undefined && onSelectCell !== undefined ? (
        <CellLayer
          cells={cells}
          selection={cellSelection}
          offerAt={offerAt}
          nameFor={(offerId) => (offerId === null ? null : (offers[offerId]?.name ?? null))}
          onSelect={onSelectCell}
        />
      ) : null}
    </svg>
  )
}

const rectAttrs = (r: { x: number; y: number; width: number; height: number }) => ({
  x: r.x,
  y: r.y,
  width: r.width,
  height: r.height,
})

/**
 * How much of its box an element's content actually needs.
 *
 * **A missing packshot is deliberately not reported as absent.** 4.2% of the
 * catalog has an image, and a card that quietly closes up around the hole looks
 * finished when it is not. The `no-image` flag on the offer is what tells the
 * owner; the reserved space is what keeps the page honest until they act on it.
 */
function neededHeight(
  element: Parameters<typeof drawElement>[0],
  rect: Parameters<typeof drawElement>[1],
  ctx: DrawContext
): number | null {
  if (element.kind !== 'text') return rect.height

  const content = contentFor(element, ctx)
  if (content === '') return null

  // Line count at the box the block designed. The second fit inside `drawElement`
  // runs against the compacted box and produces the same count, because width
  // does not change.
  const step = ctx.scale.levels[element.level]
  const perLine = step.size * ctx.scale.base * ctx.blockSize
  const measured = ctx.measure(content, perLine, '')
  const lines = Math.max(1, Math.ceil(measured / Math.max(rect.width, 1)))
  return Math.min(rect.height, lines * perLine * step.lineHeight)
}



/**
 * The paper, and whatever the owner put on it.
 *
 * **`--sq-tpl-paper` was hardcoded here until a `PageGrid` could say otherwise.**
 * Every book printed on white, with white gutters between the cards, whatever
 * the shop's brand was — a card could be navy and the page around it could not.
 *
 * Three things can be behind a page and they are one union, so this is one
 * component rather than a branch at the call site:
 *
 * - **Nothing** — the token, exactly as before.
 * - **A colour or a gradient** — `paintFill`, the same resolver and the same
 *   `<linearGradient>` a shape fill uses. There is one gradient emitter in this
 *   codebase and both callers go through it.
 * - **Artwork** — an `<image>`, with the paper still underneath it.
 *
 * **The paper rect is always drawn**, even under an image, and that is not
 * belt-and-braces. `contain` letterboxes, so the bars have to be *something*; an
 * image with an opacity below 1 is being deliberately knocked back and needs a
 * ground to be knocked back *towards*; and an asset that fails to load leaves a
 * page rather than a hole.
 */
function PageGround({
  background,
  size,
  token,
  palette,
  asset,
  uid,
}: {
  background: PageBackground | null
  size: { width: number; height: number }
  token: (ref: TokenRef) => string
  palette: readonly BrandColor[]
  asset: ((assetId: string) => string | null) | undefined
  uid: string
}) {
  /* The paper. `--sq-tpl-paper`, not a `--sq-ui-*` surface: this is offer book
     content and the two namespaces never cross. A block's own `shape` element
     usually covers it — this is what shows in the gaps and margins, which is
     exactly what paper is. */
  const paper = <rect width={size.width} height={size.height} fill="var(--sq-tpl-paper)" />

  if (background === null) return paper

  if (background.from === 'asset') {
    const href = asset?.(background.assetId) ?? null
    if (href === null) return paper

    return (
      <>
        {paper}
        <image
          href={href}
          width={size.width}
          height={size.height}
          // `slice` crops to fill and `meet` letterboxes — SVG's own words for
          // `cover` and `contain`, which is what `ImageSource.fit` already means
          // inside a block.
          preserveAspectRatio={
            (background.fit ?? 'cover') === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'
          }
          opacity={background.opacity ?? 1}
        />
      </>
    )
  }

  // `uid` is what keeps the gradient id unique. Ids are document-global and the
  // preview screen draws six pages in one svg-per-page tree on one document, so
  // without it page two's ground would adopt page one's gradient.
  const { fill, defs } = paintFill(background, { token, palette, id: `${uid}-page-ground` })

  return (
    <>
      {defs}
      <rect width={size.width} height={size.height} fill={fill} />
    </>
  )
}

/**
 * The cells of the master, as something an owner can select.
 *
 * **A spreadsheet's selection model, because the page is a spreadsheet.**
 * Composition model §4: cells merge into regions, merges are rectangular only,
 * and a non-rectangular selection is refused rather than solved. So there is one
 * hit target per cell, a click anchors, and shift or a drag extends — and the
 * span that comes out is always a rectangle.
 *
 * **It draws the grid, not just the selection.** A cell with no offer in it is
 * invisible on a page: the last page of a book is mostly paper, and an owner
 * cannot select what they cannot see. The hairlines are the faintest thing on
 * the artboard and they are chrome, so they go away with the tool.
 *
 * **One hit target per cell, carrying both jobs.** Clicking reports the cell
 * *and* the offer on it, so picking a card to merge also opens its properties —
 * the same click means both, exactly as selecting a spreadsheet cell both moves
 * the selection and shows what is in it. Two overlapping targets would mean two
 * tab stops on one card and a hit-testing order nobody could predict.
 */
function CellLayer({
  cells,
  selection,
  offerAt,
  nameFor,
  onSelect,
}: {
  cells: readonly MasterCell[]
  selection: CellSpan | null
  offerAt: (regionId: string) => string | null
  nameFor: (offerId: string | null) => string | null
  onSelect: (cell: MasterCell, options: { extend: boolean; offerId: string | null }) => void
}) {
  const selected = selection === null ? [] : cells.filter((cell) => spansIntersect(cell.body, selection))
  const ring = unionRect(selected.map((cell) => cell.rect))

  // Proportional to the cells rather than fixed, for the same reason the offer
  // ring is: this svg is scaled to whatever width the artboard column gives it,
  // so a constant here would be a hairline on A3 and a band on a story.
  const hairline = pageHairline(cells)

  return (
    <>
      {cells.map((cell) => (
        <rect
          key={`grid-${cell.regionId}`}
          {...rectAttrs(cell.rect)}
          rx={3}
          fill="none"
          stroke="var(--sq-ui-selected-ring)"
          strokeWidth={hairline}
          // Faint enough to read as a guide rather than as part of the flyer.
          // The owner is judging their own page through this.
          opacity={0.28}
          pointerEvents="none"
        />
      ))}

      {ring === null ? null : (
        <>
          <rect
            {...rectAttrs(ring)}
            rx={3}
            fill="var(--sq-ui-selected-ring)"
            fillOpacity={0.1}
            pointerEvents="none"
          />
          <rect
            {...rectAttrs(ring)}
            rx={3}
            fill="none"
            stroke="var(--sq-ui-selected-ring)"
            strokeWidth={hairline * 3}
            pointerEvents="none"
          />
        </>
      )}

      {cells.map((cell) => {
        const offerId = offerAt(cell.regionId)
        const name = nameFor(offerId)
        const inSelection = selection !== null && spansIntersect(cell.body, selection)

        return (
          <rect
            key={`hit-${cell.regionId}`}
            {...rectAttrs(cell.rect)}
            fill="transparent"
            role="button"
            tabIndex={0}
            // Named for what is in it, falling back to where it is. An empty cell
            // is a real target — it is most of the last page — and "Offer" would
            // be a lie about it. The position is said in rows and columns rather
            // than as the region id: `r0c1` is how the grid names a cell, not how
            // anybody reads one out.
            aria-label={name ?? emptyCellLabel(cell)}
            aria-pressed={inSelection}
            className="cursor-pointer outline-none"
            onPointerDown={(event) =>
              onSelect(cell, { extend: event.shiftKey, offerId })
            }
            // Drag to extend, which is how a range gets selected anywhere else.
            // `buttons` rather than a state flag: it is already the answer to
            // "is a drag in progress", and a flag would survive a pointer
            // released outside the page.
            onPointerEnter={(event) => {
              if (event.buttons !== 1) return
              onSelect(cell, { extend: true, offerId })
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              onSelect(cell, { extend: event.shiftKey, offerId })
            }}
          />
        )
      })}
    </>
  )
}

/** The smallest rectangle containing all of them. */
function unionRect(rects: readonly Rect[]): Rect | null {
  const [first, ...rest] = rects
  if (first === undefined) return null

  return rest.reduce((box, rect) => {
    const x = Math.min(box.x, rect.x)
    const y = Math.min(box.y, rect.y)
    return {
      x,
      y,
      width: Math.max(box.x + box.width, rect.x + rect.width) - x,
      height: Math.max(box.y + box.height, rect.y + rect.height) - y,
    }
  }, first)
}

/**
 * A stroke width that reads the same at any page size.
 *
 * Taken from the narrowest cell rather than from the page, so a dense 6×8 grid
 * gets a finer line than a 2×2 one — which is what keeps the guides from
 * swallowing the gaps between cards at high track counts.
 */
function pageHairline(cells: readonly MasterCell[]): number {
  const narrowest = cells.reduce(
    (min, cell) => Math.min(min, cell.rect.width, cell.rect.height),
    Infinity
  )
  return Number.isFinite(narrowest) ? Math.max(1, narrowest * 0.004) : 1
}

/**
 * What to call a cell with nothing in it.
 *
 * One-based, and **in reading order rather than left to right**: `colStart` is
 * logical, so "column 1" is the first column an owner reads in either edition.
 * A merged cell says how far it reaches, because "row 1, column 1" for something
 * covering four cells would be a description its own owner could not match to
 * what they can see.
 */
function emptyCellLabel(cell: MasterCell): string {
  const row = cell.body.rowStart + 1
  const column = cell.body.colStart + 1
  if (!cell.merged) return `Empty cell, row ${row}, column ${column}`

  return (
    `Empty merged cell, rows ${row} to ${cell.body.rowEnd + 1}, ` +
    `columns ${column} to ${cell.body.colEnd + 1}`
  )
}
