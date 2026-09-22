'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, Copy, PanelLeftClose, Plus, Redo2, TriangleAlert, Undo2 } from 'lucide-react'
import type { Alignment, BlockProblem } from '@souqstudio/engine'
import type { Arrangement, BlockElement, BrandKit } from '@souqstudio/types'
import { addElement, alignBoxes, reorderElement, validateBlock } from '@souqstudio/engine'
import { resolvePalette, resolveToken } from '@/lib/brand-palette'
import { FREE_ELEMENTS } from '@/lib/block-elements'
import { assetResolver } from '@/lib/block-assets'
import { uploadArtwork } from '@/lib/upload-artwork'
import { MAX_ARRANGEMENTS } from '@/lib/block-document'
import { ArtworkDialog } from '@/components/card-designer/ArtworkDialog'
import { CanvasToolbar } from '@/components/card-designer/CanvasToolbar'
import { InlineSelect } from '@/components/ui/inline-select'
import { Button } from '@/components/ui/button'
import { BlockArtboard } from '@/components/card-designer/BlockArtboard'
import { BlockProperties } from '@/components/card-designer/BlockProperties'
import { ToolRail } from '@/components/card-designer/ToolRail'
import {
  CanvasDrawer,
  CanvasDrawerToggles,
  useCanvasDrawer,
} from '@/components/shared/canvas-drawer'
import { ElementProperties } from '@/components/card-designer/ElementProperties'
import { splitPriceMark } from '@/lib/split-price-mark'
import { LayerList } from '@/components/card-designer/LayerList'
import { ShapesPanel } from '@/components/card-designer/ShapesPanel'
import { StressPreview } from '@/components/card-designer/StressPreview'
import { toArtboardOffer } from '@/lib/preview-offer'
import { TYPICAL_PRODUCT } from '@/lib/preview-product'
import { useDesignerStore, useElements, useSelectedElement } from '@/stores/designer-store'
import { useDesignerKeys } from '@/components/card-designer/useDesignerKeys'
import type { ArtboardIdentity } from '@/lib/artboard-identity'

/**
 * The block designer. E7, and layout family 3 in the design skill.
 *
 * Three panes — palette (start), canvas plus stress preview (centre), properties
 * (end) — on the canvas surround, with the same padding, selection outline and
 * handle treatment as the offer book editor. **Canvas parity is a hard
 * requirement**: an owner moving between designing a card and building a book
 * must not feel they changed application, and divergence there is the fastest
 * way to make the product feel assembled from parts.
 *
 * **A seeded block opens read-only.** Every account composes with the same four,
 * so editing one in place would either change everybody's library or fork it
 * silently. Duplicate is the primary action on that screen, and the copy is
 * theirs.
 *
 * **Autosave, debounced, with no save button** — `apps/web/CLAUDE.md`. A block
 * is design work, and design work that can be lost by closing a tab is design
 * work nobody does twice.
 */

type Props = {
  /**
   * Present when the designer is a window over something else — today, the
   * offer book editor — and absent on its own route.
   *
   * **It changes one thing: the way out.** On `/card-designer/[blockId]` the
   * exit is a link back to the library, because that is where the owner came
   * from and the browser's own history is the mechanism. In a window there is
   * no history entry to go back to, the book is still mounted underneath, and
   * the owner's question is "am I done" rather than "where next" — so the exit
   * becomes a button that flushes the pending save and hands control back.
   *
   * Nothing else forks. Two designers would be two sets of bugs, and the rule
   * this file opens with — canvas parity — is not a rule the designer gets to
   * break against itself.
   */
  onClose?: (() => void) | undefined
  blockId: string
  name: string
  description: string | null
  status: string
  repeats: boolean
  editable: boolean
  arrangements: Arrangement[]
  kit: BrandKit
  identity: ArtboardIdentity
  /** Where uploaded artwork is served from. A prop rather than a public env
   *  variable — see `lib/block-assets.ts`. */
  assetBaseUrl: string
}

/** The artboard's drawn size. Fractions resolve against it; nothing here is px. */
const CANVAS_EDGE = 720

/**
 * The shapes an owner designs a one-off panel at.
 *
 * Named after what they are for rather than by their numbers — an owner is
 * designing "a cover" or "a story", not a 0.71 aspect. Every one of them is a
 * shape a book actually produces: the page formats `pageSizeFor` knows, plus the
 * two bands a merged region makes.
 */
type PageShape = 'story' | 'a4' | 'square' | 'half' | 'band' | 'any'

/**
 * Each shape carries the aspect range it stands for, because **the shape an
 * owner picks is written onto the layout** rather than kept beside it.
 *
 * The ranges meet at shared endpoints, the way `library-kit`'s four do, so the
 * five named shapes cover the line an owner can reach without a hole between
 * them and `shapeFor` can read one back. They are the designer's own vocabulary
 * and not the seeded constants: `PAGE` is deliberately wide enough to hold both
 * an A4 page and a story, which is exactly the distinction this picker has to
 * be able to make.
 *
 * `any` is the shape-agnostic escape hatch and the one entry that is not a
 * shape at all. A message panel crops into anything close, so it claims the
 * open range; it is drawn at the half page because an open range's middle is
 * 1.7 and that is the nearest shape an owner can name.
 */
const PAGE_SHAPES: Record<
  PageShape,
  { label: string; aspect: number; width: number; aspectMin: number; aspectMax: number }
> = {
  story: { label: 'Story', aspect: 1080 / 1920, width: 1080, aspectMin: 0.45, aspectMax: 0.62 },
  a4: { label: 'A4 page', aspect: 1240 / 1754, width: 1240, aspectMin: 0.62, aspectMax: 0.85 },
  square: { label: 'Square post', aspect: 1, width: 1080, aspectMin: 0.85, aspectMax: 1.2 },
  half: { label: 'Half a page', aspect: 1.4, width: 1240, aspectMin: 1.2, aspectMax: 2.2 },
  band: { label: 'Band across a page', aspect: 3.2, width: 1240, aspectMin: 2.2, aspectMax: 30 },
  any: { label: 'Any shape', aspect: 1.4, width: 1240, aspectMin: 0.1, aspectMax: 30 },
}

/**
 * The drawn size of the previewed shape, in export pixels at 150dpi.
 *
 * **`aspect` stays the source of truth and the height is derived from it**, so
 * a pair of numbers here can never disagree with the rectangle on the canvas.
 * The widths are `pageSizeFor`'s own; a band and a half page are regions of an
 * A4 page rather than formats of their own, so they carry its width.
 *
 * Only the properties panel wants this, and only to say what a percentage comes
 * to. Nothing on the canvas is px.
 */
function pageSize(shape: PageShape): { width: number; height: number } {
  const { width, aspect } = PAGE_SHAPES[shape]
  return { width, height: Math.round(width / aspect) }
}

/**
 * The shape a layout was drawn for, read back off its own aspect range.
 *
 * **The inverse of the picker, and it has to stay one.** The shape was state
 * the designer kept and threw away on close, so an owner who drew a story
 * reopened on the band the seeded range still claimed — and the book agreed
 * with the range rather than with the drawing, because element boxes are
 * fractions of their container and a design is only true at the aspect it was
 * drawn at. The range is the whole of that promise, so the range is what the
 * picker writes and what this reads.
 *
 * Matched in three steps, narrowest first. The open range is checked by both
 * its endpoints, so a panel that genuinely claims every shape is not mistaken
 * for the half page its middle sits on. Everything else is placed by its middle
 * — which puts the seeded `PAGE`, `SQUARE`, `HALF` and `STRIP` on the page, the
 * square post, the half page and the band respectively. A range that reaches
 * past both ends of the list falls to the nearest, because the canvas has to
 * draw something.
 */
export function shapeFor(arrangement: Arrangement | undefined): PageShape {
  if (arrangement === undefined) return 'a4'

  const open = PAGE_SHAPES.any
  if (near(arrangement.aspectMin, open.aspectMin) && near(arrangement.aspectMax, open.aspectMax)) {
    return 'any'
  }

  const middle = Math.sqrt(arrangement.aspectMin * arrangement.aspectMax)
  const named = NAMED_SHAPES.find(
    (shape) => middle >= PAGE_SHAPES[shape].aspectMin && middle <= PAGE_SHAPES[shape].aspectMax
  )
  if (named !== undefined) return named

  return middle < PAGE_SHAPES.story.aspectMin ? 'story' : 'band'
}

/** The five shapes a block is actually drawn at, tallest first. `any` is not one. */
const NAMED_SHAPES: readonly PageShape[] = ['story', 'a4', 'square', 'half', 'band']

/** Within a twentieth of each other, which is closer than two ranges ever are. */
const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.05

export function DesignerShell({
  onClose,
  blockId,
  name: initialName,
  status: initialStatus,
  repeats,
  editable,
  arrangements: initialArrangements,
  kit,
  identity,
  assetBaseUrl,
}: Props) {
  const hydrate = useDesignerStore((state) => state.hydrate)
  const store = useDesignerStore()
  const elements = useElements()
  const selectedElement = useSelectedElement()
  const drawer = useCanvasDrawer()
  /**
   * Whether the layer list shows beside the tool rail.
   *
   * **Not persisted, unlike the dashboard rail.** That one is a cookie because
   * the shell renders on the server and the width has to be right before the
   * first paint; this pane is inside a client component that is only ever
   * reached from one screen, so a cookie would buy a preference that survives
   * navigation an owner rarely makes. If it turns out they collapse it every
   * session, `lib/rail-preference.ts` is the pattern to copy.
   */
  const [panelOpen, setPanelOpen] = React.useState(true)
  const [picking, setPicking] = React.useState(false)

  React.useEffect(() => {
    hydrate({
      blockId,
      name: initialName,
      status: initialStatus,
      repeats,
      editable,
      arrangements: initialArrangements,
    })
  }, [hydrate, blockId, initialName, initialStatus, repeats, editable, initialArrangements])

  const arrangement = store.arrangements[store.arrangementIndex]
  const direction = store.direction

  /**
   * The shape the canvas is drawn at, and the two kinds of block answer it
   * differently.
   *
   * **A repeating card is drawn at the middle of the range its layout claims** —
   * the geometric mean, which is the shape it will actually meet most often.
   * Showing it at one end would be designing for the edge case and eyeballing
   * the rest.
   *
   * **A block placed once is drawn at the shape its layout says it is for**, and
   * that is the same rule stated for a block that carries one arrangement. A
   * cover, a full-page brand panel and a footer band are the same kind of object
   * at three shapes, and the shape is the layout's own range — so this is read,
   * never held. Held, it was lost on close and the design reopened on whatever
   * shape the range had claimed since the block was seeded.
   *
   * **The picker now changes the document**, which is the point: a design drawn
   * at one aspect is only true at that aspect, so an owner who wants the block
   * at a second shape adds a second layout and draws it, exactly as a repeating
   * card already does.
   */
  const pageShape = shapeFor(arrangement)

  const aspect = repeats
    ? clamp(
        Math.sqrt(
          Math.max(arrangement?.aspectMin ?? 1, 0.05) * Math.max(arrangement?.aspectMax ?? 1, 0.05)
        ),
        0.3,
        4
      )
    : PAGE_SHAPES[pageShape].aspect

  const width = aspect >= 1 ? CANVAS_EDGE : CANVAS_EDGE * aspect
  const height = aspect >= 1 ? CANVAS_EDGE / aspect : CANVAS_EDGE

  const offer = React.useMemo(() => toArtboardOffer(TYPICAL_PRODUCT, direction === 'rtl'), [direction])

  /**
   * Open at a zoom that shows the whole card.
   *
   * **A tall booklet card is about 1.8 times as tall as it is wide**, so at the
   * full width of its column it runs well past the bottom of the window — an
   * owner opening the designer saw the top half of a card and a scrollbar. Every
   * tool this is modelled on opens at fit, and for the same reason: the first
   * thing you need is the whole thing.
   *
   * Measured rather than assumed, because the column's height depends on the
   * window, the warning banners above it and whether the stress panel is
   * showing. Only on mount and on a change of shape — re-fitting after the owner
   * has zoomed would be the tool arguing with them.
   */
  const stage = React.useRef<HTMLDivElement | null>(null)
  const fitted = React.useRef<string>('')
  const setZoom = store.setZoom

  React.useEffect(() => {
    const node = stage.current
    if (node === null) return

    const shape = `${width}x${height}`
    if (fitted.current === shape) return

    // The artboard fills the column's width, so its drawn height is that width
    // times its own aspect. Fit is whatever fraction of the column brings that
    // back inside the visible height.
    const available = node.clientHeight - 96
    const natural = node.clientWidth * (height / width)

    // **Marked as fitted only once it actually fitted.** The first pass can run
    // before layout, when the column has no height yet; recording the shape
    // there would lock the fit out for good and leave the owner at 100% on a
    // card twice the height of the window. That is exactly what it did.
    if (available <= 0 || natural <= 0) return
    fitted.current = shape

    setZoom(Math.min(1, Math.max(0.25, available / natural)))
  }, [width, height, setZoom])

  const problems = React.useMemo(
    () => validateBlock({ repeats, arrangements: store.arrangements }),
    [repeats, store.arrangements]
  )

  useAutosave(blockId, editable)
  useDesignerKeys(editable)

  const palette = React.useMemo(() => resolvePalette(kit), [kit])
  const token = React.useCallback(
    (ref: Parameters<typeof resolveToken>[1]) => resolveToken(palette, ref),
    [palette]
  )
  const asset = React.useMemo(() => assetResolver(assetBaseUrl), [assetBaseUrl])
  const [uploading, setUploading] = React.useState(false)

  /**
   * Upload artwork, then place it.
   *
   * The bytes go straight to R2 from the browser on a presigned URL — the same
   * path the logo takes, and for the same reason: proxying a file this size
   * through a serverless function fails on the platform's own body limit rather
   * than on anything the owner did.
   */
  /**
   * Upload a file and return its key, or null.
   *
   * **It no longer adds the element itself.** Choosing artwork and uploading
   * artwork used to be one action, which is why every use was a fresh upload —
   * the dialog does the choosing now, and this is the half that puts bytes in
   * the bucket.
   */
  async function upload(file: File): Promise<string | null> {
    setUploading(true)
    try {
      // The three-step handshake — authorise, PUT to R2, record — lives in
      // `lib/upload-artwork.ts` now that the page background needs the same one.
      return await uploadArtwork(file)
    } finally {
      setUploading(false)
    }
  }

  function addArtwork(assetId: string) {
    const element = FREE_ELEMENTS.artwork(assetId)
    store.setElements(addElement(elements, element))
    store.select([element.id])
  }

  function align(how: Alignment) {
    const picked = elements.filter((element) => store.selectedIds.includes(element.id))
    const boxes = alignBoxes(
      picked.map((element) => element.box),
      how
    )
    const moved = new Map(picked.map((element, index) => [element.id, boxes[index]]))
    store.setElements(
      elements.map((element) => {
        const box = moved.get(element.id)
        return box === undefined ? element : { ...element, box }
      })
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas-surround">
      <header className="flex flex-wrap items-center gap-3 border-b-hairline border-border-subtle bg-surface px-4 py-3">
        {/*
          **The way out, and it is the only thing a window changes.** On its own
          route this is a link to the library. Over the book editor there is no
          history entry behind it and the book is still mounted below, so it is
          a button that writes what is pending and hands control back.
        */}
        {onClose === undefined ? (
          <Link
            href="/blocks"
            className="flex items-center gap-2 rounded-pill px-2 py-1 font-ui text-body-sm text-secondary hover:bg-stone-100"
          >
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" strokeWidth={1.75} />
            Blocks
          </Link>
        ) : null}

        <h1 className="font-ui text-subhead text-primary">{store.name}</h1>

        <span className="rounded-pill bg-sand px-2 py-px font-ui text-eyebrow uppercase text-secondary">
          {repeats ? 'Per product' : 'Placed once'}
        </span>

        <div className="ms-auto flex items-center gap-3">
          {/* The artboard's language, not the interface's. An owner working in
              an Arabic UI who is designing an English card must see an English
              card — and Arabic is where a card breaks, so the toggle has to be
              one click away rather than a preview elsewhere. */}
          <div
            role="group"
            aria-label="Card language"
            className="flex items-center rounded-pill border-hairline border-border-subtle p-1"
          >
            {(['ltr', 'rtl'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={direction === value}
                onClick={() => store.setDirection(value)}
                className={
                  direction === value
                    ? 'rounded-pill bg-selected-bg px-3 py-1 font-ui text-body-sm text-selected-fg'
                    : 'rounded-pill px-3 py-1 font-ui text-body-sm text-secondary hover:bg-stone-100'
                }
              >
                {value === 'ltr' ? 'English' : 'العربية'}
              </button>
            ))}
          </div>

          {editable ? (
            <>
              <Button
                type="button"
                variant="ghost"
                iconOnly
                aria-label="Undo"
                disabled={store.past.length === 0}
                onClick={store.undo}
              >
                <Undo2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                iconOnly
                aria-label="Redo"
                disabled={store.future.length === 0}
                onClick={store.redo}
              >
                <Redo2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
              </Button>
              <SaveStatus blockId={blockId} />
            </>
          ) : (
            <DuplicateButton blockId={blockId} name={store.name} />
          )}

          {onClose === undefined ? null : (
            <CloseButton blockId={blockId} editable={editable} onClose={onClose} />
          )}
        </div>
      </header>

      {!editable ? (
        <p className="border-b-hairline border-border-subtle bg-sand-tint px-4 py-2 font-ui text-body-sm text-secondary">
          This block comes with every account, so it is read-only. Duplicate it
          to make a version of your own.
        </p>
      ) : null}

      <Problems problems={problems} />

      {/*
        **The save is refused above the cap, and the only sign of it was the
        words "Not saved".** `arrangementsSchema` is the authority and it is a
        long way from this screen, so a block that drifted over — before the Add
        button knew about the limit — has to be told what to do about it rather
        than left guessing at a rejected autosave.
      */}
      {store.arrangements.length > MAX_ARRANGEMENTS ? (
        <p className="border-b-hairline border-border-subtle bg-critical-bg px-4 py-2 font-ui text-body-sm text-critical-fg">
          This block has {store.arrangements.length} layouts and a block may carry{' '}
          {MAX_ARRANGEMENTS}. Nothing will save until one is removed: choose a layout above,
          then remove it from the block panel.
        </p>
      ) : null}

      <ArtworkDialog
        open={picking}
        onOpenChange={setPicking}
        onPick={(assetId) => {
          addArtwork(assetId)
          setPicking(false)
        }}
        onUpload={async (file) => {
          const assetId = await upload(file)
          if (assetId !== null) addArtwork(assetId)
          return assetId
        }}
      />

      <CanvasDrawerToggles
        open={drawer.open}
        onToggle={drawer.toggle}
        startLabel="Tools and layers"
        endLabel={selectedElement === null ? 'Block' : 'Element'}
      />

      {/* `relative`, because the drawers below `lg` position against this row —
          they have to cover the canvas and not the header above it. */}
      <div className="relative flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Tools on the far edge, layers beside them — the arrangement every
            application this is modelled on uses, and the reason an owner who has
            opened one of them knows where to look. */}
        <CanvasDrawer
          side="start"
          open={drawer.open === 'start'}
          onClose={drawer.close}
          // Collapsed, the pane *is* the rail. Below `lg` it is a drawer the
          // owner opened on purpose, so it always shows the list — hiding it
          // there would leave a drawer containing a strip of tools they can
          // already reach.
          lgWidth={panelOpen ? 'lg:w-pane-start' : 'lg:w-tool-rail'}
        >
          <ToolRail
            repeats={repeats}
            disabled={!editable}
            uploading={uploading}
            idle={store.selectedIds.length === 0}
            onSelectNone={() => store.select([])}
            panelOpen={panelOpen}
            onTogglePanel={() => setPanelOpen((open) => !open)}
            onUpload={editable ? () => setPicking(true) : undefined}
            onAdd={(element, atBottom) => {
              // Paint order is array order, so "behind everything" is the front
              // of the list. A background appended like anything else covers
              // the card.
              store.setElements(
                atBottom === true ? [element, ...elements] : addElement(elements, element)
              )
              store.select([element.id])
            }}
          />

          <div
            className={
              panelOpen
                ? 'flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-3'
                : 'flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-3 lg:hidden'
            }
          >

            <section className="flex flex-col gap-2">
              {/*
                **The heading is the toggle, and the rail carries the other
                half.** A close control belongs on the thing being closed —
                that is where anyone looks for it, and the rail button alone was
                a way out nobody found. The rail keeps its copy because once
                this pane is gone, a control inside it is gone with it.
              */}
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-ui text-eyebrow uppercase tracking-wide text-secondary">
                  Layers
                </h2>
                <button
                  type="button"
                  aria-label="Hide layers and shapes"
                  aria-expanded={panelOpen}
                  title="Hide layers and shapes"
                  onClick={() => setPanelOpen(false)}
                  className="hidden rounded-control p-1 text-secondary hover:bg-stone-100 lg:block"
                >
                  <PanelLeftClose className="size-4" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
              <LayerList
                elements={elements}
                selectedIds={store.selectedIds}
                disabled={!editable}
                onSelect={(ids, additive) => {
                  if (additive === true && ids[0] !== undefined) store.toggleSelect(ids[0])
                  else store.select(ids)
                }}
                onReorder={(from, to) => store.setElements(reorderElement(elements, from, to))}
                onRemove={(id) => {
                  store.select([id])
                  store.removeSelected()
                }}
                onToggleLock={(id) => {
                  const element = elements.find((entry) => entry.id === id)
                  if (element === undefined) return
                  store.setElement(id, { ...element, locked: !(element.locked ?? false) })
                }}
              />
            </section>

            {/*
              **Under the layers, in the pane the rail opens.** The rail holds
              one shape because it is a strip of icons that is already long;
              the other twelve were reachable only through the variant grid in
              the properties panel, which is a route an owner has to already
              know about to take. A shape nobody can find is a shape nobody
              uses, and the one they reach for instead is an uploaded picture
              they cannot recolour.
            */}
            <ShapesPanel
              disabled={!editable}
              onAdd={(element) => {
                store.setElements(addElement(elements, element))
                store.select([element.id])
              }}
            />
          </div>
        </CanvasDrawer>

        <div ref={stage} className="flex flex-1 flex-col items-center gap-8 overflow-auto p-8">
          {/*
            **One card, and it stays at the top.** The shape picker used to float
            on the dark surround above a second pill of tools — two bars of
            chrome over one canvas. They answer the two halves of the same
            question, so they are one control now, and `sticky` keeps it there
            when a tall card scrolls under it rather than taking the tools off
            the screen with it.
          */}
          <div className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center justify-center gap-2">
            <CanvasToolbar
              leading={
                repeats ? (
                  <ArrangementTabs />
                ) : (
                  <>
                    {/* **Only once there is a second one to choose between.** A
                        panel carries one layout in the ordinary case, and a
                        picker with a single option is a control that teaches an
                        owner nothing and still costs them a glance. */}
                    {store.arrangements.length > 1 ? (
                      <InlineSelect
                        label="Layout"
                        className="w-field-select"
                        value={String(store.arrangementIndex)}
                        leading={<ShapeGlyph aspect={PAGE_SHAPES[pageShape].aspect} />}
                        options={store.arrangements.map((item, i) => ({
                          value: String(i),
                          label: PAGE_SHAPES[shapeFor(item)].label,
                        }))}
                        onChange={(next) => store.selectArrangement(Number(next))}
                      />
                    ) : null}

                    <InlineSelect
                      label="Designing for"
                      className="w-field-select"
                      value={pageShape}
                      disabled={!editable}
                      leading={<ShapeGlyph aspect={PAGE_SHAPES[pageShape].aspect} />}
                      options={(Object.keys(PAGE_SHAPES) as PageShape[]).map((shape) => ({
                        value: shape,
                        label: PAGE_SHAPES[shape].label,
                      }))}
                      // **Writes the shape onto the layout**, which is what
                      // makes it survive the close and what makes a book draw
                      // the panel where it was drawn. `setAspect` takes the
                      // checkpoint, so a shape picked by accident undoes like
                      // anything else.
                      onChange={(shape) =>
                        setAspect(PAGE_SHAPES[shape].aspectMin, PAGE_SHAPES[shape].aspectMax)
                      }
                    />

                    {/* **The way out of one shape per layout.** Reshaping the
                        open layout is the right answer for a panel drawn at the
                        wrong aspect and the wrong one for a panel that has to
                        work at two, so the second shape is a second layout and
                        the block reflows into whichever the region asks for —
                        the same mechanism a repeating card has always used. */}
                    {editable ? (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={store.arrangements.length >= MAX_ARRANGEMENTS}
                        title={
                          store.arrangements.length >= MAX_ARRANGEMENTS
                            ? `A block may carry ${MAX_ARRANGEMENTS} layouts.`
                            : undefined
                        }
                        onClick={addStillArrangement}
                      >
                        <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
                        Add a layout
                      </Button>
                    ) : null}
                  </>
                )
              }
              count={store.selectedIds.length}
              zoom={store.zoom}
              disabled={!editable}
              onAlign={align}
              onGroup={store.groupSelected}
              onUngroup={store.ungroupSelected}
              onZoom={store.setZoom}
            />
          </div>

          <figure
            className="flex w-full flex-col items-center gap-2"
            // Zoom scales the pane the artboard fills rather than transforming
            // the SVG: a transform would scale the selection handles and the
            // guides with it, and a handle that shrinks as you zoom out is one
            // you cannot grab at the moment you most need to.
            style={{ maxWidth: `${Math.round(store.zoom * 100)}%` }}
          >
            <BlockArtboard
              elements={elements}
              kit={kit}
              width={width}
              height={height}
              direction={direction}
              offer={offer}
              identity={identity}
              asset={asset}
              markBound
              selectedIds={store.selectedIds}
              onSelect={
                editable
                  ? (ids, additive) => {
                      if (additive === true && ids[0] !== undefined) store.toggleSelect(ids[0])
                      else store.select(ids)
                    }
                  : undefined
              }
              onChange={editable ? (next) => store.setElements(next, false) : undefined}
              onCheckpoint={editable ? store.checkpoint : undefined}
              ariaLabel="The card you are designing"
              className="rounded-artboard"
            />
            <figcaption className="rounded-pill bg-surface px-3 py-1 font-ui text-body-sm text-secondary">
              {repeats ? 'A typical product' : 'This panel, at that shape'}
            </figcaption>
          </figure>

          {/* Persistent, never behind a tab, and at the same scale as the canvas
              above it — the comparison is the point.

              **Only for a block that repeats.** The worst case is a *product*:
              the longest Arabic name in the catalog against a three-decimal
              price. A panel placed once has no product in scope, so a second
              copy of it beside the first would show the same picture twice and
              teach nothing. */}
          {repeats ? (
            <div className="w-full max-w-2xl">
              <StressPreview
                elements={elements}
                kit={kit}
                width={width}
                height={height}
                direction={direction}
                identity={identity}
                asset={asset}
              />
            </div>
          ) : null}
        </div>

        <CanvasDrawer
          side="end"
          open={drawer.open === 'end'}
          onClose={drawer.close}
          className="flex-col p-4"
        >
          {selectedElement === null ? (
            <BlockProperties
              name={store.name}
              status={store.status}
              repeats={repeats}
              disabled={!editable}
              arrangement={arrangement}
              arrangementCount={store.arrangements.length}
              canRemoveArrangement={editable && store.arrangements.length > 1}
              onName={store.setName}
              onStatus={(status) => useDesignerStore.setState({ status, save: 'dirty' })}
              onAspect={(min, max) => setAspect(min, max)}
              onRemoveArrangement={removeArrangement}
            />
          ) : (
            <ElementProperties
              element={selectedElement}
              repeats={repeats}
              disabled={!editable}
              palette={palette}
              token={token}
              // What the size fields read their percentages against. A block
              // placed once is drawn on a page and has a size in pixels; a
              // repeating one letterboxes into whatever region the grid gives
              // it, so the proportion is all that can honestly be said.
              canvas={{ aspect, page: repeats ? null : pageSize(pageShape) }}
              // The blur control on an uploaded image re-renders from the
              // unblurred original and needs somewhere to read it from.
              assetBaseUrl={assetBaseUrl}
              onChange={(element) => store.setElement(element.id, element)}
              {...(selectedElement?.kind === 'priceMark'
                ? {
                    onSplit: () => {
                      // Computed against the artboard's own size: a split places
                      // each piece where the solver had just drawn it, and the
                      // solver works in the units the canvas draws in.
                      const split = splitPriceMark(selectedElement, offer, width, height)
                      if (split === null) return
                      store.replaceElement(selectedElement.id, [split.mark, ...split.parts])
                    },
                  }
                : {})}
            />
          )}
        </CanvasDrawer>
      </div>
    </div>
  )

  function setAspect(min: number, max: number) {
    const next = store.arrangements.map((item, index) =>
      index === store.arrangementIndex
        ? { ...item, aspectMin: safe(min, 0.05), aspectMax: safe(max, 0.05) }
        : item
    )
    useDesignerStore.setState({
      arrangements: next,
      past: [...store.past, store.arrangements].slice(-50),
      future: [],
      save: 'dirty',
    })
  }

  function removeArrangement() {
    if (store.arrangements.length <= 1) return
    const next = store.arrangements.filter((_, index) => index !== store.arrangementIndex)
    useDesignerStore.setState({
      arrangements: next,
      arrangementIndex: Math.max(0, store.arrangementIndex - 1),
      selectedIds: [],
      past: [...store.past, store.arrangements].slice(-50),
      future: [],
      save: 'dirty',
    })
  }
}

/**
 * The shape a second layout should start at: the first named one nothing claims
 * yet, tallest first, and the band when an owner has worked through all five.
 *
 * A copy of the range it was copied from would be two layouts claiming the same
 * shape, which `coverageProblems` reports as an overlap and which is never what
 * the owner meant by "add" — they are here because the block has to work
 * somewhere else.
 */
export function nextStillShape(arrangements: readonly Arrangement[]): PageShape {
  const claimed = new Set(arrangements.map(shapeFor))
  return NAMED_SHAPES.find((shape) => !claimed.has(shape)) ?? 'band'
}

/**
 * A second layout for a block placed once, drawn from the one currently open.
 *
 * `ArrangementTabs.add` is the same move for a repeating card and stays there:
 * that one walks up from the widest range it already carries, because a card's
 * layouts partition a continuum of merges, while a panel's name the handful of
 * page shapes a book actually produces.
 */
function addStillArrangement(): void {
  const state = useDesignerStore.getState()
  const current = state.arrangements[state.arrangementIndex]
  if (current === undefined || state.arrangements.length >= MAX_ARRANGEMENTS) return

  const shape = PAGE_SHAPES[nextStillShape(state.arrangements)]
  const copy: Arrangement = {
    aspectMin: shape.aspectMin,
    aspectMax: shape.aspectMax,
    elements: structuredClone(current.elements) as BlockElement[],
  }

  useDesignerStore.setState({
    arrangements: [...state.arrangements, copy],
    arrangementIndex: state.arrangements.length,
    selectedIds: [],
    past: [...state.past, state.arrangements].slice(-50),
    future: [],
    save: 'dirty',
  })
}

/**
 * One tab per layout, named by the shape it covers rather than by its index.
 *
 * Adding one copies the layout currently open, which is the only starting point
 * that is not worse than the default — the same reason a new block is a copy of
 * a seeded one rather than a blank artboard.
 */
function ArrangementTabs() {
  const arrangements = useDesignerStore((state) => state.arrangements)
  const index = useDesignerStore((state) => state.arrangementIndex)
  const editable = useDesignerStore((state) => state.editable)
  const select = useDesignerStore((state) => state.selectArrangement)

  const full = arrangements.length >= MAX_ARRANGEMENTS

  function add() {
    const current = arrangements[index]
    // **The cap is enforced here as well as in the schema**, and it was not.
    // `arrangementsSchema` refuses more than `MAX_ARRANGEMENTS`, so a seventh
    // layout made every autosave fail — and the whole of that failure, to the
    // owner, was the words "Not saved" in the corner. A limit the interface
    // does not know about is a limit the owner discovers as a bug.
    if (current === undefined || full) return
    const last = arrangements.reduce((max, item) => Math.max(max, item.aspectMax), 0)
    const copy: Arrangement = {
      aspectMin: last,
      aspectMax: Math.min(40, last * 2),
      elements: structuredClone(current.elements) as BlockElement[],
    }
    useDesignerStore.setState((state) => ({
      arrangements: [...state.arrangements, copy],
      arrangementIndex: state.arrangements.length,
      selectedIds: [],
      past: [...state.past, state.arrangements].slice(-50),
      future: [],
      save: 'dirty',
    }))
  }

  const current = arrangements[index]

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/*
        **The shape and the name on one line, which a `Select` cannot do.** Its
        label sits above its field, so on a toolbar it is three stacked things
        in a row of flat ones — and the glyph had to be parked beside it, which
        read as two controls. `InlineSelect` is the row, and the glyph is inside
        it showing the layout you are on.

        The names had stopped naming anything: every range above 2.6:1 is
        "Banner" and `add()` produces exactly those, so four layouts showed four
        identical tabs. The label carries the proportion and the glyph draws it.
      */}
      <InlineSelect
        label="Layout"
        className="w-field-select"
        value={String(index)}
        leading={<ShapeGlyph aspect={current === undefined ? 1 : middleAspect(current)} />}
        options={arrangements.map((item, i) => ({
          value: String(i),
          label: `${shapeName(item)} · ${ratioLabel(middleAspect(item))}`,
        }))}
        onChange={(next) => select(Number(next))}
      />

      {editable ? (
        <Button
          type="button"
          variant="ghost"
          disabled={full}
          title={full ? `A block may carry ${MAX_ARRANGEMENTS} layouts.` : undefined}
          onClick={add}
        >
          <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Add a layout
        </Button>
      ) : null}
    </div>
  )
}

/** The shape an aspect range is centred on — the same figure `shapeName` reads. */
const middleAspect = (arrangement: Arrangement): number =>
  Math.sqrt(arrangement.aspectMin * arrangement.aspectMax)

/**
 * A proportion as a ratio an owner can read. `3.2:1` above square, `1:1.4`
 * below it — nobody describes a portrait card as "0.71 to 1".
 */
function ratioLabel(aspect: number): string {
  const figure = (value: number) =>
    value >= 10 ? String(Math.round(value)) : String(Math.round(value * 10) / 10)
  return aspect >= 1 ? `${figure(aspect)}:1` : `1:${figure(1 / aspect)}`
}

/**
 * The shape itself, drawn.
 *
 * **A rectangle at the real proportion rather than an icon chosen from a set.**
 * Four layouts that are all "Banner" would get the same glyph from any icon
 * library, which is the problem restated rather than solved; a box drawn at 3:1
 * and a box drawn at 12:1 do not look alike. It is the one case where drawing
 * the thing is less work than naming it.
 *
 * The height is floored so a very flat band is still a rectangle rather than a
 * hairline that reads as a divider.
 */
function ShapeGlyph({ aspect }: { aspect: number }) {
  const box = 20
  const inner = box - 2
  const width = aspect >= 1 ? inner : inner * aspect
  const height = Math.max(3, aspect >= 1 ? inner / aspect : inner)

  return (
    <svg
      width={box}
      height={box}
      viewBox={`0 0 ${box} ${box}`}
      aria-hidden="true"
      className="shrink-0"
    >
      <rect
        x={(box - width) / 2}
        y={(box - height) / 2}
        width={width}
        height={height}
        rx={1.5}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
      />
    </svg>
  )
}

function shapeName(arrangement: Arrangement): string {
  const middle = Math.sqrt(arrangement.aspectMin * arrangement.aspectMax)
  if (middle < 0.85) return 'Tall'
  if (middle < 1.35) return 'Square'
  if (middle < 2.6) return 'Wide'
  return 'Banner'
}

/**
 * Problems, split by severity because the two mean different things.
 *
 * An error stops the save — the composer could not draw it. A warning is a
 * design that renders and will disappoint: a gap in aspect coverage falls back
 * to the nearest layout, which is a card drawn at a shape it was not drawn for.
 */
function Problems({ problems }: { problems: BlockProblem[] }) {
  const errors = problems.filter((problem) => problem.severity === 'error')
  const warnings = problems.filter((problem) => problem.severity === 'warning')

  if (errors.length === 0 && warnings.length === 0) return null

  return (
    <>
      {errors.length > 0 ? (
        <p className="flex items-start gap-2 border-b-hairline border-border-subtle bg-critical-bg px-4 py-2 font-ui text-body-sm text-critical-fg">
          <TriangleAlert className="mt-1 size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>{errors.map((problem) => problem.message).join('. ')}.</span>
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <p className="flex items-start gap-2 border-b-hairline border-border-subtle bg-caution-bg px-4 py-2 font-ui text-body-sm text-caution-fg">
          <TriangleAlert className="mt-1 size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>{warnings.map((problem) => problem.message).join('. ')}.</span>
        </p>
      ) : null}
    </>
  )
}

/**
 * Save and close, for the designer in a window.
 *
 * **It is a flush, not a second save model.** Both canvases autosave on a
 * two-second debounce with no save button, which `apps/web/CLAUDE.md` asks for
 * and which this does not change: the button exists because the *window* has to
 * close, and what it adds is writing whatever the debounce has not got to yet.
 * The label says "Save and close" rather than "Close" because that is the order
 * the two things happen in, and an owner who has just moved something wants to
 * be told it was kept.
 *
 * **A refused write leaves the window open.** `validateBlock` problems are
 * already on screen above the canvas; closing over one would take away the
 * design and the explanation in the same gesture.
 */
function CloseButton({
  blockId,
  editable,
  onClose,
}: {
  blockId: string
  editable: boolean
  onClose: () => void
}) {
  const [closing, setClosing] = React.useState(false)

  return (
    <Button
      type="button"
      variant="primary"
      loading={closing}
      onClick={async () => {
        setClosing(true)
        const ok = await flushBlock(blockId, editable)
        setClosing(false)
        if (ok) onClose()
      }}
    >
      {editable ? 'Save and close' : 'Close'}
    </Button>
  )
}

/**
 * What the save is doing, and a way to make it happen now.
 *
 * **Still not a second save model** — the same thing `CloseButton` says about
 * itself. Both canvases autosave on a two-second debounce, which
 * `apps/web/CLAUDE.md` asks for and this does not change; what it adds is a way
 * to stop waiting, which an owner asked for after moving something and watching
 * the corner say "Unsaved changes" with nothing to press.
 *
 * **The error state was a dead end and that is the real defect here.** "Not
 * saved" was a passive `<span>`: the only way to retry a failed write was to
 * make another change and hope the next debounce caught it. A status that
 * reports a failure and offers nothing to do about it is worse than no status.
 *
 * Ghost, never primary — the primary action on this screen is the design, and
 * saving is something the product is already doing.
 */
function SaveStatus({ blockId }: { blockId: string }) {
  const save = useDesignerStore((state) => state.save)
  const editable = useDesignerStore((state) => state.editable)
  const [flushing, setFlushing] = React.useState(false)

  // Nothing has changed, so there is nothing to say and nothing to press.
  if (save === 'idle') return null

  if (save === 'saving' || flushing) {
    return (
      <span role="status" className="font-ui text-body-sm text-secondary">
        Saving…
      </span>
    )
  }

  if (save === 'saved') {
    return (
      <span role="status" className="font-ui text-body-sm text-secondary">
        Saved
      </span>
    )
  }

  // `dirty` and `error`, both of which have something to do about them. A
  // viewer sees the words and no control, because they have nothing to save.
  if (!editable) {
    return (
      <span
        role="status"
        className={
          save === 'error'
            ? 'font-ui text-body-sm text-critical-fg'
            : 'font-ui text-body-sm text-secondary'
        }
      >
        {save === 'error' ? 'Not saved' : 'Unsaved changes'}
      </span>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className={save === 'error' ? 'text-critical-fg' : undefined}
      onClick={async () => {
        setFlushing(true)
        await flushBlock(blockId, true)
        setFlushing(false)
      }}
    >
      {save === 'error' ? 'Not saved, try again' : 'Save now'}
    </Button>
  )
}

function DuplicateButton({ blockId, name }: { blockId: string; name: string }) {
  const [busy, setBusy] = React.useState(false)

  return (
    <Button
      type="button"
      variant="primary"
      loading={busy}
      onClick={async () => {
        setBusy(true)
        const response = await fetch('/api/v1/blocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromId: blockId, name }),
        })
        const body = (await response.json()) as { data: { id: string } | null }
        setBusy(false)
        if (body.data) window.location.assign(`/card-designer/${body.data.id}`)
      }}
    >
      <Copy className="size-4" strokeWidth={1.75} aria-hidden="true" />
      Duplicate to edit
    </Button>
  )
}

/**
 * Autosave, debounced two seconds. No save button — the design system asks for
 * exactly this on both canvases.
 *
 * The document is sent whole rather than as a patch. A block is a few kilobytes,
 * and a partial write of a design is a design that is half one version and half
 * another.
 */
function useAutosave(blockId: string, editable: boolean) {
  const save = useDesignerStore((state) => state.save)
  const arrangements = useDesignerStore((state) => state.arrangements)
  const name = useDesignerStore((state) => state.name)
  const status = useDesignerStore((state) => state.status)
  const setSave = useDesignerStore((state) => state.setSave)

  React.useEffect(() => {
    if (!editable || save !== 'dirty') return

    const timer = setTimeout(() => {
      void writeBlock(blockId)
    }, 2000)

    return () => clearTimeout(timer)
  }, [blockId, editable, save, arrangements, name, status, setSave])
}

/**
 * The write itself, off the store rather than out of a closure.
 *
 * **Extracted because a second caller appeared, and the two must not drift.**
 * The debounce above is one; `flushBlock` below is the other, and a window that
 * closed by sending a *slightly different* document than the autosave would
 * have sent is a design that is one thing on screen and another in the
 * database. Reading the state at call time also means the flush sends what is
 * on the canvas now, not what was on it when the effect last ran.
 *
 * Returns whether the document landed, which only the flush has any use for.
 */
async function writeBlock(blockId: string): Promise<boolean> {
  const state = useDesignerStore.getState()
  state.setSave('saving')

  try {
    const response = await fetch(`/api/v1/blocks/${blockId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: state.name,
        status: state.status,
        arrangements: state.arrangements,
      }),
    })
    // A refusal is left visible rather than retried: the reason is almost
    // always structural — two price marks, a product field on a block that
    // is placed once — and retrying a document the server has already
    // judged invalid produces a spinner that never settles.
    state.setSave(response.ok ? 'saved' : 'error')
    return response.ok
  } catch {
    state.setSave('error')
    return false
  }
}

/**
 * Everything unsaved, written now, for a window that is about to close.
 *
 * **The two-second debounce is the reason this exists.** An owner who nudges an
 * element and immediately presses Save and close is inside that window, and
 * unmounting the designer cancels the pending timer — so without this the last
 * edit before closing is the one edit that never lands. That is the worst
 * possible edit to lose, because it is the one they were thinking about.
 *
 * A read-only block has nothing to flush and a clean one has nothing to send,
 * so both are immediate. A failed write returns false and the caller keeps the
 * window open: closing over a refusal would drop the design *and* the only
 * message saying why.
 */
async function flushBlock(blockId: string, editable: boolean): Promise<boolean> {
  if (!editable) return true
  const save = useDesignerStore.getState().save
  if (save !== 'dirty' && save !== 'error') return true
  return writeBlock(blockId)
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const safe = (value: number, min: number) => (Number.isFinite(value) ? Math.max(min, value) : min)
