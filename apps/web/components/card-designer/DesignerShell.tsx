'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, Copy, Plus, Redo2, TriangleAlert, Undo2 } from 'lucide-react'
import type { Alignment, BlockProblem } from '@souqstudio/engine'
import type { Arrangement, BlockElement, BrandKit } from '@souqstudio/types'
import { addElement, alignBoxes, reorderElement, validateBlock } from '@souqstudio/engine'
import { resolvePalette, resolveToken } from '@/lib/brand-palette'
import { FREE_ELEMENTS } from '@/lib/block-elements'
import { assetResolver } from '@/lib/block-assets'
import { CanvasToolbar } from '@/components/card-designer/CanvasToolbar'
import { Button } from '@/components/ui/button'
import { BlockArtboard } from '@/components/card-designer/BlockArtboard'
import { BlockProperties } from '@/components/card-designer/BlockProperties'
import { ElementPalette } from '@/components/card-designer/ElementPalette'
import { ElementProperties } from '@/components/card-designer/ElementProperties'
import { LayerList } from '@/components/card-designer/LayerList'
import { StressPreview } from '@/components/card-designer/StressPreview'
import { toArtboardOffer } from '@/lib/preview-offer'
import { TYPICAL_PRODUCT } from '@/lib/preview-product'
import { useDesignerStore, useElements, useSelectedElement } from '@/stores/designer-store'
import { useDesignerKeys } from '@/components/card-designer/useDesignerKeys'

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
  blockId: string
  name: string
  description: string | null
  status: string
  repeats: boolean
  editable: boolean
  arrangements: Arrangement[]
  kit: BrandKit
  shopName: string
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
type PageShape = 'a4' | 'square' | 'story' | 'band' | 'half'

const PAGE_SHAPES: Record<PageShape, { label: string; aspect: number }> = {
  a4: { label: 'A4 page', aspect: 1240 / 1754 },
  square: { label: 'Square post', aspect: 1 },
  story: { label: 'Story', aspect: 1080 / 1920 },
  band: { label: 'Band across a page', aspect: 3.2 },
  half: { label: 'Half a page', aspect: 1.4 },
}

/**
 * What a block opens at, read from the shape it was drawn for.
 *
 * A footer or a hero band is wide and should not open as a portrait page; a
 * message block is roughly square. Guessing from the elements would be reading
 * tea leaves, so this reads the arrangement's own range and picks the nearest
 * named shape — which for the seeded blocks' open range lands on the page.
 */
function defaultShape(arrangement: Arrangement | undefined): PageShape {
  if (arrangement === undefined) return 'a4'
  const middle = Math.sqrt(arrangement.aspectMin * arrangement.aspectMax)
  if (middle > 6) return 'band'
  if (middle > 1.2) return 'half'
  if (middle > 0.85) return 'square'
  return 'a4'
}

export function DesignerShell({
  blockId,
  name: initialName,
  status: initialStatus,
  repeats,
  editable,
  arrangements: initialArrangements,
  kit,
  shopName,
  assetBaseUrl,
}: Props) {
  const hydrate = useDesignerStore((state) => state.hydrate)
  const store = useDesignerStore()
  const elements = useElements()
  const selectedElement = useSelectedElement()

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
   * **A block placed once is drawn at whatever the owner is designing for**, and
   * that is the whole of what "design a page rather than a card" needs: a cover,
   * a full-page brand panel and a footer band are the same kind of object at
   * three shapes, and the aspect range stays open because a static block
   * letterboxes into anything close. The picker changes the *canvas*, never the
   * document.
   */
  const [pageShape, setPageShape] = React.useState<PageShape>(() =>
    repeats ? 'a4' : defaultShape(initialArrangements[0])
  )

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
  const fileInput = React.useRef<HTMLInputElement | null>(null)

  /**
   * Upload artwork, then place it.
   *
   * The bytes go straight to R2 from the browser on a presigned URL — the same
   * path the logo takes, and for the same reason: proxying a file this size
   * through a serverless function fails on the platform's own body limit rather
   * than on anything the owner did.
   */
  async function upload(file: File) {
    setUploading(true)
    try {
      const authorise = await fetch('/api/v1/blocks/artwork', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, contentLength: file.size }),
      })
      const body = (await authorise.json()) as {
        data: { uploadUrl: string; assetId: string } | null
      }
      if (body.data === null) return

      const put = await fetch(body.data.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      })
      if (!put.ok) return

      const element = FREE_ELEMENTS.artwork(body.data.assetId)
      store.setElements(addElement(elements, element))
      store.select([element.id])
    } finally {
      setUploading(false)
    }
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
    <div className="flex min-h-screen flex-col bg-canvas-surround">
      <header className="flex flex-wrap items-center gap-3 border-b-hairline border-border-subtle bg-surface px-4 py-3">
        <Link
          href="/brand/blocks"
          className="flex items-center gap-2 rounded-pill px-2 py-1 font-ui text-body-sm text-secondary hover:bg-stone-100"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" strokeWidth={1.75} />
          Blocks
        </Link>

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
              <SaveStatus />
            </>
          ) : (
            <DuplicateButton blockId={blockId} name={store.name} />
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

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <aside className="w-full shrink-0 overflow-auto border-b-hairline border-border-subtle bg-surface p-4 lg:order-first lg:w-pane-start lg:border-b-0 lg:border-e-hairline">
          <div className="flex flex-col gap-6">
            <ElementPalette
              repeats={repeats}
              disabled={!editable}
              uploading={uploading}
              onUpload={editable ? () => fileInput.current?.click() : undefined}
              onAdd={(element, atBottom) => {
                // Paint order is array order, so "behind everything" is the
                // front of the list. A background appended like anything else
                // covers the card.
                store.setElements(
                  atBottom === true ? [element, ...elements] : addElement(elements, element)
                )
                store.select([element.id])
              }}
            />

            {/* Hidden, and driven by the palette's own button: a bare file input
                is the one control in the product nobody can style, and the
                palette entry has to look like every other entry beside it. */}
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file !== undefined) void upload(file)
              }}
            />

            <section className="flex flex-col gap-2">
              <h2 className="font-ui text-eyebrow uppercase tracking-wide text-secondary">
                On this layout
              </h2>
              <LayerList
                elements={elements}
                selectedIds={store.selectedIds}
                disabled={!editable}
                onSelect={(ids, additive) => {
                  if (additive === true && ids[0] !== undefined) store.toggleSelect(ids[0])
                  else store.select(ids)
                }}
                onReorder={(from, to) => {
                  store.setElements(reorderElement(elements, from, to))
                }}
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
          </div>
        </aside>

        <div className="flex flex-1 flex-col items-center gap-8 overflow-auto p-8">
          {repeats ? (
            <ArrangementTabs />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-ui text-body-sm text-inverse">Designing for</span>
              <div role="tablist" aria-label="Canvas shape" className="flex flex-wrap gap-1">
                {(Object.keys(PAGE_SHAPES) as PageShape[]).map((shape) => (
                  <button
                    key={shape}
                    role="tab"
                    type="button"
                    aria-selected={pageShape === shape}
                    onClick={() => setPageShape(shape)}
                    className={
                      pageShape === shape
                        ? 'rounded-pill bg-surface px-3 py-1 font-ui text-body-sm text-primary'
                        : 'rounded-pill px-3 py-1 font-ui text-body-sm text-inverse hover:bg-stone-800'
                    }
                  >
                    {PAGE_SHAPES[shape].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {editable ? (
            <CanvasToolbar
              count={store.selectedIds.length}
              zoom={store.zoom}
              disabled={!editable}
              onAlign={align}
              onGroup={store.groupSelected}
              onUngroup={store.ungroupSelected}
              onZoom={store.setZoom}
            />
          ) : null}

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
              shopName={shopName}
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
                shopName={shopName}
                asset={asset}
              />
            </div>
          ) : null}
        </div>

        <aside className="w-full shrink-0 overflow-auto border-t-hairline border-border-subtle bg-surface p-4 lg:w-pane-end lg:border-s-hairline lg:border-t-0">
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
              onChange={(element) => store.setElement(element.id, element)}
            />
          )}
        </aside>
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

  function add() {
    const current = arrangements[index]
    if (current === undefined) return
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="tablist" aria-label="Layouts" className="flex flex-wrap items-center gap-1">
        {arrangements.map((item, i) => (
          <button
            key={i}
            role="tab"
            type="button"
            aria-selected={i === index}
            onClick={() => select(i)}
            className={
              i === index
                ? 'rounded-pill bg-surface px-3 py-1 font-ui text-body-sm text-primary'
                : 'rounded-pill px-3 py-1 font-ui text-body-sm text-inverse hover:bg-stone-800'
            }
          >
            {shapeName(item)}
          </button>
        ))}
      </div>

      {editable ? (
        <Button type="button" variant="ghost" onClick={add} className="text-inverse">
          <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Add a layout
        </Button>
      ) : null}
    </div>
  )
}

/** The shape a range covers, in the words an owner would use for it. */
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

function SaveStatus() {
  const save = useDesignerStore((state) => state.save)

  const copy =
    save === 'saving'
      ? 'Saving…'
      : save === 'saved'
        ? 'Saved'
        : save === 'error'
          ? 'Not saved'
          : save === 'dirty'
            ? 'Unsaved changes'
            : ''

  if (copy === '') return null

  return (
    <span
      role="status"
      className={
        save === 'error'
          ? 'font-ui text-body-sm text-critical-fg'
          : 'font-ui text-body-sm text-secondary'
      }
    >
      {copy}
    </span>
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

    const timer = setTimeout(async () => {
      setSave('saving')
      try {
        const response = await fetch(`/api/v1/blocks/${blockId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, status, arrangements }),
        })
        // A refusal is left visible rather than retried: the reason is almost
        // always structural — two price marks, a product field on a block that
        // is placed once — and retrying a document the server has already
        // judged invalid produces a spinner that never settles.
        setSave(response.ok ? 'saved' : 'error')
      } catch {
        setSave('error')
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [blockId, editable, save, arrangements, name, status, setSave])
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const safe = (value: number, min: number) => (Number.isFinite(value) ? Math.max(min, value) : min)
