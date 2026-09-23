'use client'

import * as React from 'react'
import type { BlockElement, Box, BrandColor } from '@souqstudio/types'
import {
  BLEED,
  CHIP_BLEED,
  isBound,
  moveBox,
  recentre,
  SNAP,
  resizeBox,
  resolveBlock,
  snapBox,
  type Guides,
  type Handle,
  type Rect,
} from '@souqstudio/engine'
import { resolvePalette, resolveToken } from '../../lib/brand-palette'
import { resolveScale } from '../../lib/font-catalog'
import { useFontCatalog } from '../brand/FontCatalogProvider'
import { useFontsReady } from '../../lib/use-fonts-ready'
import {
  drawElement,
  estimateWidth,
  measureText,
  paintedRect,
  type ArtboardOffer,
  type DrawContext,
} from '../blocks/draw'
import type { BrandKit } from '@souqstudio/types'
import type { ArtboardIdentity } from '../../lib/artboard-identity'

/**
 * The block designer's canvas. E7.
 *
 * **The same painter as the editor and `/brand`, with handles over the top.**
 * Canvas parity is a hard requirement in the design system — an owner moving
 * between designing a card and building a book must not feel they changed
 * application — and the cheapest way to guarantee it is one implementation of a
 * card rather than two that look alike.
 *
 * **Still no Fabric, and this is the surface that was supposed to need it.**
 * Direct manipulation needs a hit target, a delta and somewhere to put the
 * result; the engine owns the arithmetic (`moveBox`, `resizeBox`, `snapBox`) in
 * block fractions. Adding Fabric would mean a *second painter* — Fabric objects
 * built from the same elements — and the first thing to drift would be whether
 * the card the owner designed is the card the PDF prints.
 *
 * **Deltas are in block fractions, computed from the rendered rectangle.** The
 * artboard scales with its container, so a pointer delta in CSS pixels means
 * nothing until it is divided by the drawn width — and in an Arabic edition the
 * logical start runs the other way, which is one sign flip here rather than a
 * mirrored coordinate system anywhere else.
 */

type Props = {
  elements: BlockElement[]
  kit: BrandKit
  /** The artboard's own aspect. Fractions resolve against it; nothing is px. */
  width: number
  height: number
  /** The **block's** direction, never the interface's. */
  direction: 'ltr' | 'rtl'
  offer: ArtboardOffer | undefined
  identity: ArtboardIdentity
  /** Artwork the owner uploaded, by asset id. */
  asset?: ((assetId: string) => string | null) | undefined
  selectedIds?: readonly string[]
  /** `additive` is a shift-click: add to the selection rather than replace it. */
  onSelect?: ((ids: string[], additive?: boolean) => void) | undefined
  /** Called on every pointer move. A drag is one undo step, so it never commits. */
  onChange?: ((elements: BlockElement[]) => void) | undefined
  /** Push an undo step. Called once, as a drag begins. */
  onCheckpoint?: (() => void) | undefined
  /** Bound elements carry a persistent mark. Off for a preview. */
  markBound?: boolean
  className?: string
  ariaLabel?: string
}

type DragIntent =
  | { kind: 'move' }
  | { kind: 'resize'; handle: Handle }
  | { kind: 'rotate' }
  | { kind: 'marquee' }

type Drag = DragIntent & {
  startX: number
  startY: number
  /** Every element as it was when the drag began. Deltas apply to these, so a
   *  drag never accumulates its own rounding. */
  origin: BlockElement[]
  captured: Element
}

export function BlockArtboard({
  elements,
  kit,
  width,
  height,
  direction,
  offer,
  identity,
  asset,
  selectedIds = [],
  onSelect,
  onChange,
  onCheckpoint,
  markBound = false,
  className,
  ariaLabel = 'Block',
}: Props) {
  const palette: readonly BrandColor[] = resolvePalette(kit)
  const scale = resolveScale(kit, useFontCatalog())
  const blockSize = Math.sqrt(width * height)
  const interactive = onChange !== undefined && onSelect !== undefined

  // Estimate on the server and the first client paint, real metrics after mount.
  // Measuring differently on each side breaks lines differently and React flags
  // the mismatch — the same reasoning as `BookPage` and `BlockPreview`.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  /**
   * The real measurer only once the shop's faces can actually be measured.
   *
   * `measureText` asks a canvas for a width using a shorthand that names the
   * brand family; before that face has loaded the canvas answers for the
   * fallback, and every wrap on the card is decided against the wrong metrics.
   * A font change re-runs this, which is what re-measures the artboard.
   */
  const fontsReady = useFontsReady(
    React.useMemo(() => Object.values(scale.families), [scale.families]),
    React.useMemo(() => Object.values(scale.levels).map((step) => step.weight), [scale.levels])
  )

  const svgRef = React.useRef<SVGSVGElement | null>(null)
  const uid = React.useId()
  const drag = React.useRef<Drag | null>(null)
  const [guides, setGuides] = React.useState<Guides>({ x: [], y: [] })
  const [marquee, setMarquee] = React.useState<Rect | null>(null)

  const ctx: DrawContext = {
    uid,
    token: (ref) => resolveToken(palette, ref),
    palette,
    scale,
    blockSize,
    ar: direction === 'rtl',
    direction,
    measure: mounted && fontsReady ? measureText : estimateWidth,
    offer,
    ...identity,
    asset,
  }

  const { elements: resolved } = resolveBlock(
    {
      id: 'designer',
      organizationId: null,
      name: 'designer',
      repeats: true,
      arrangements: [{ aspectMin: 0.01, aspectMax: 100, elements }],
      thumbnailUrl: null,
    },
    { x: 0, y: 0, width, height },
    direction
  )

  /**
   * Client pixels to **artboard units, on the screen's own axes**.
   *
   * Artboard units rather than fractions, because the next thing that happens
   * to a resize delta is a rotation — and a vector written as a fraction of the
   * width and a fraction of the height cannot be rotated. The two axes are
   * different lengths, so turning it 90° would stretch it.
   */
  function screenDelta(event: React.PointerEvent, from: { startX: number; startY: number }) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (rect === undefined || rect.width === 0 || rect.height === 0) return { dx: 0, dy: 0 }

    return {
      dx: ((event.clientX - from.startX) / rect.width) * width,
      dy: ((event.clientY - from.startY) / rect.height) * height,
    }
  }

  /**
   * Artboard units to the logical fractions a box is written in.
   *
   * **The mirror happens here and only here**, after any rotation has been
   * undone: an element is drawn rotated in *screen* space — `resolveBlock` has
   * already mirrored its rectangle by then — so the turn has to come off in
   * screen space too, and the reading direction is applied to what is left.
   */
  function logical(vector: { dx: number; dy: number }) {
    return {
      dStart: (direction === 'rtl' ? -vector.dx : vector.dx) / width,
      dTop: vector.dy / height,
    }
  }

  /** A screen-space vector in an element's own axes: the turn, taken off. */
  function untilted(vector: { dx: number; dy: number }, turn: number) {
    if (turn === 0) return vector
    const radians = (-turn * Math.PI) / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    return {
      dx: vector.dx * cos - vector.dy * sin,
      dy: vector.dx * sin + vector.dy * cos,
    }
  }

  /** Where the pointer is, in block fractions. Used by the marquee. */
  function pointAt(event: React.PointerEvent) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (rect === undefined || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
    const x = (event.clientX - rect.left) / rect.width
    return { x: direction === 'rtl' ? 1 - x : x, y: (event.clientY - rect.top) / rect.height }
  }

  function onPointerMove(event: React.PointerEvent) {
    const active = drag.current
    if (active === null || onChange === undefined) return

    if (active.kind === 'marquee') {
      const from = pointAt({ ...event, clientX: active.startX, clientY: active.startY } as React.PointerEvent)
      const to = pointAt(event)
      setMarquee({
        x: Math.min(from.x, to.x) * width,
        y: Math.min(from.y, to.y) * height,
        width: Math.abs(to.x - from.x) * width,
        height: Math.abs(to.y - from.y) * height,
      })
      return
    }

    const screen = screenDelta(event, active)
    const moving = new Set(selectedIds)

    if (active.kind === 'rotate') {
      /*
       * **The angle the pointer stands at, not how far sideways it went.**
       *
       * A horizontal-only gesture was defensible while the handle sat above an
       * upright box: it reads as a slider and it cannot spin. It stops being
       * defensible the moment the handle turns with the shape — at 90° the
       * handle is out to the side, and dragging it *along* the arc it should
       * follow does nothing while dragging it away from the shape turns it.
       *
       * Measured from the centre, the handle simply goes where the pointer is,
       * and the wild spinning the old comment warned about does not happen: it
       * came from feeding two axes into one number, not from using the angle.
       */
      const rect = svgRef.current?.getBoundingClientRect()
      if (rect === undefined || rect.width === 0 || rect.height === 0) return

      const middle = centreOf(selectionRects.map(({ rect: drawn }) => drawn))
      const cx = rect.left + (middle.x / width) * rect.width
      const cy = rect.top + (middle.y / height) * rect.height

      const before = Math.atan2(active.startY - cy, active.startX - cx)
      const now = Math.atan2(event.clientY - cy, event.clientX - cx)
      // Through the half turn rather than the long way round it: the raw
      // difference jumps by 360° as the pointer crosses due west.
      const swept = wrapTurn(((now - before) * 180) / Math.PI)

      // Shift snaps to 15°, which is every angle anybody sets on purpose — a
      // tilted badge is 15° or 30°, and by hand it is 14° and looks it.
      const step = event.shiftKey ? 15 : 1

      onChange(
        active.origin.map((element) =>
          moving.has(element.id)
            ? {
                ...element,
                rotation: wrapTurn(
                  Math.round(((element.rotation ?? 0) + swept) / step) * step
                ),
              }
            : element
        )
      )
      return
    }

    const { dStart, dTop } = logical(screen)

    if (active.kind === 'resize') {
      const chosen = active.origin.filter((element) => moving.has(element.id))
      if (chosen.length === 0) return

      /*
       * **The drag, read in the element's own frame.** A handle on a shape
       * turned 30° points 30° off the screen's axes, so the pointer travelling
       * along it is travelling diagonally as far as the box is concerned —
       * and a box resized by the raw screen delta grows on both axes at once
       * and slides out from under the pointer.
       */
      const turn = sharedTurn(chosen)
      const local = logical(untilted(screen, turn))

      /*
       * **The selection is resized, and the elements follow it.**
       *
       * Every element used to be handed the same delta, which is only right
       * when there is one of them: two elements a handle-width apart both grew
       * by the full drag, so the pair spread past the frame that was supposed
       * to be containing them and the handle came off the pointer within about
       * a centimetre. Scaling the selection's own box and mapping each element
       * into the result keeps the group's internal proportions — which is the
       * same argument the move branch already makes for snapping.
       *
       * One element is a group of one, so this is the only arithmetic here.
       * There is no second path to disagree with it.
       */
      const bounds = boundsOf(chosen.map((element) => element.box))
      const next = resizeBox(bounds, active.handle, local.dStart, local.dTop, {
        // **A corner holds the ratio unless Shift says otherwise.** Stretching
        // a photograph or a logo by dragging its corner is the one thing a
        // corner is never used for, and an owner who wants it has the edge
        // handles as well as the modifier.
        aspect: isCorner(active.handle) && !event.shiftKey,
        overhang: overhangOf(chosen),
      })

      const sx = bounds.width === 0 ? 1 : next.width / bounds.width
      const sy = bounds.height === 0 ? 1 : next.height / bounds.height

      /*
       * **Putting the pinned corner back where it was.**
       *
       * A rotated element turns about its own centre, and resizing with one
       * edge pinned *moves* that centre — so the corner the owner is not
       * dragging swings away from where they left it, by more the further the
       * shape is turned. The shift that undoes it works out to
       * `(I − R) · (centre before − centre after)`, which is nothing at all
       * when the turn is zero, and is why this costs an upright drag nothing.
       */
      const drift = recentre(bounds, next, turn, {
        width,
        height,
        mirror: direction === 'rtl',
      })

      onChange(
        active.origin.map((element) =>
          moving.has(element.id)
            ? {
                ...element,
                box: {
                  start: tidy(next.start + (element.box.start - bounds.start) * sx + drift.start),
                  top: tidy(next.top + (element.box.top - bounds.top) * sy + drift.top),
                  width: tidy(element.box.width * sx),
                  height: tidy(element.box.height * sy),
                },
              }
            : element
        )
      )
      return
    }

    // Move. **The snap is computed for the primary element and applied to all
    // of them**, so a group keeps its internal spacing: snapping each element
    // separately would pull a selection apart the first time two of them found
    // different guides.
    const primaryId = selectedIds[0]
    const primary = active.origin.find((element) => element.id === primaryId)
    if (primary === undefined) return

    const others = active.origin
      .filter((element) => !moving.has(element.id))
      .map((element) => element.box)

    // **Past the edge is allowed now, up to `BLEED`.** A band running off both
    // sides and a photograph filling the trim are what a flyer is made of, and
    // clamping every box inside the block refused all of it. `moveBox` keeps a
    // sliver of every element inside, so nothing can be dragged away and lost.
    const dragged = moveBox(primary.box, dStart, dTop, SNAP, BLEED)
    const snapped = snapBox(dragged, others)
    setGuides(snapped.guides)

    const adjustStart = snapped.box.start - dragged.start
    const adjustTop = snapped.box.top - dragged.top

    onChange(
      active.origin.map((element) => {
        if (!moving.has(element.id)) return element
        const moved = moveBox(element.box, dStart, dTop, SNAP, BLEED)
        return {
          ...element,
          box: { ...moved, start: moved.start + adjustStart, top: moved.top + adjustTop },
        }
      })
    )
  }

  function endDrag(event: React.PointerEvent) {
    const active = drag.current
    if (active === null) return

    if (active.kind === 'marquee' && marquee !== null && onSelect !== undefined) {
      // Anything the rubber band touches, not only what it encloses: a band
      // that must swallow an element whole is one an owner has to draw twice.
      const hit = resolved
        .filter(({ rect }) => intersects(rect, marquee))
        .map(({ element }) => element.id)
      onSelect(hit)
    }

    drag.current = null
    setMarquee(null)
    setGuides({ x: [], y: [] })
    if (active.captured.hasPointerCapture?.(event.pointerId)) {
      active.captured.releasePointerCapture(event.pointerId)
    }
  }

  function startDrag(event: React.PointerEvent, intent: DragIntent) {
    if (!interactive) return
    event.preventDefault()
    event.stopPropagation()
    if (intent.kind !== 'marquee') onCheckpoint?.()

    const captured = event.currentTarget as Element
    captured.setPointerCapture?.(event.pointerId)
    drag.current = {
      ...intent,
      startX: event.clientX,
      startY: event.clientY,
      origin: elements,
      captured,
    }
  }

  const selectionRects = resolved.filter(({ element }) => selectedIds.includes(element.id))

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      className={className}
      role={interactive ? 'application' : 'img'}
      aria-label={ariaLabel}
      onPointerMove={interactive ? onPointerMove : undefined}
      onPointerUp={interactive ? endDrag : undefined}
      onPointerCancel={interactive ? endDrag : undefined}
      onPointerDown={
        interactive
          ? (event) => {
              // On the ground rather than on an element: clear, then rubber-band.
              onSelect?.([])
              startDrag(event, { kind: 'marquee' })
            }
          : undefined
      }
    >
      {/* The paper, in the offer book's own token set. A block's own `shape`
          element usually covers it; this is what shows where it does not. */}
      <rect width={width} height={height} fill="var(--sq-tpl-paper)" />

      {resolved.map(({ element, rect }) => (
        <React.Fragment key={element.id}>{drawElement(element, rect, ctx)}</React.Fragment>
      ))}

      {/* **Bound elements are marked whether or not anything is selected.** The
          design system requires the distinction in three places — here, the
          layer list and the palette — because a shop that cannot tell which
          elements move with the catalog cannot predict what their card does
          across twelve products. */}
      {markBound
        ? resolved.map(({ element, rect }) =>
            isBound(element) ? (
              <rect
                key={`bound-${element.id}`}
                {...xywh(rect)}
                fill="none"
                stroke="var(--sq-ui-selected-ring)"
                strokeWidth={Math.max(1, Math.max(width, height) * 0.002)}
                strokeDasharray={`${Math.max(width, height) * 0.012} ${Math.max(width, height) * 0.008}`}
                opacity={0.55}
                pointerEvents="none"
              />
            ) : null
          )
        : null}

      {interactive
        ? resolved.map(({ element, rect }) => (
            <rect
              key={`hit-${element.id}`}
              {...xywh(grab(rect, Math.max(width, height)))}
              // The same transform `drawElement` puts on the element itself. A
              // target that stayed upright while its shape turned is a shape
              // you have to click beside.
              {...(element.rotation === undefined || element.rotation === 0
                ? {}
                : {
                    transform: `rotate(${element.rotation} ${rect.x + rect.width / 2} ${rect.y + rect.height / 2})`,
                  })}
              fill="transparent"
              className={element.locked === true ? 'outline-none' : 'cursor-move outline-none'}
              role="button"
              tabIndex={0}
              aria-label={describe(element)}
              aria-pressed={selectedIds.includes(element.id)}
              onPointerDown={(event) => {
                if (element.locked === true) return
                const additive = event.shiftKey || event.metaKey
                if (additive) onSelect?.([element.id], true)
                else if (!selectedIds.includes(element.id)) onSelect?.(groupOf(elements, element))
                startDrag(event, { kind: 'move' })
              }}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                onSelect?.([element.id])
              }}
            />
          ))
        : null}

      {/* Guides, then the selection, then the marquee — each drawn over what it
          describes. A chip anchored TOP_START overhangs its box by design and
          would otherwise cover the ring. */}
      {guides.x.map((x) => (
        <line
          key={`gx-${x}`}
          x1={(direction === 'rtl' ? 1 - x : x) * width}
          y1={0}
          x2={(direction === 'rtl' ? 1 - x : x) * width}
          y2={height}
          stroke="var(--sq-ui-selected-ring)"
          strokeWidth={1}
          strokeDasharray="4 4"
          pointerEvents="none"
        />
      ))}
      {guides.y.map((y) => (
        <line
          key={`gy-${y}`}
          x1={0}
          y1={y * height}
          x2={width}
          y2={y * height}
          stroke="var(--sq-ui-selected-ring)"
          strokeWidth={1}
          strokeDasharray="4 4"
          pointerEvents="none"
        />
      ))}

      {selectionRects.length > 0 ? (
        <Selection
          rects={selectionRects.map(({ rect }) => rect)}
          /*
           * Where the paint lands, for the two kinds whose box is not their
           * picture — a line of text at the top of a tall box, a packshot inset
           * inside its own. The ring stays on the box because the box is what a
           * handle moves; this says what is actually in it.
           */
          content={selectionRects.map(({ element, rect }) => paintedRect(element, rect, ctx))}
          // One turn per outline, and one for the handle frame. They differ
          // whenever a selection holds elements at different angles — then the
          // frame is upright and each outline still sits on its own shape.
          turns={selectionRects.map(({ element }) => element.rotation ?? 0)}
          frameTurn={sharedTurn(selectionRects.map(({ element }) => element))}
          mirror={direction === 'rtl'}
          scale={Math.max(width, height)}
          interactive={interactive}
          onHandle={(handle, event) => startDrag(event, { kind: 'resize', handle })}
          onRotate={(event) => startDrag(event, { kind: 'rotate' })}
        />
      ) : null}

      {marquee !== null ? (
        <rect
          {...xywh(marquee)}
          fill="var(--sq-ui-selected-ring)"
          fillOpacity={0.12}
          stroke="var(--sq-ui-selected-ring)"
          strokeWidth={1}
          pointerEvents="none"
        />
      ) : null}
    </svg>
  )
}

const xywh = (r: Rect) => ({ x: r.x, y: r.y, width: r.width, height: r.height })

/**
 * An angle brought back into the half turn either side of upright.
 *
 * **Wrapped rather than clamped, which it used to be.** Clamping means a shape
 * turned to 180° stops dead and will not come round the other side — the owner
 * keeps dragging and nothing happens, at the one angle where carrying on is the
 * obvious thing to do. −170° and 190° are the same picture; only one of them is
 * inside what the schema stores.
 */
export function wrapTurn(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180
}

/** The middle of a set of rectangles, in artboard units. */
function centreOf(rects: readonly Rect[]): { x: number; y: number } {
  const x = Math.min(...rects.map((rect) => rect.x))
  const y = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  return { x: (x + right) / 2, y: (y + bottom) / 2 }
}

/**
 * The turn a selection shares, or none.
 *
 * **One answer for the whole selection, because the handles are one frame.**
 * Two elements at different angles have no common frame to draw a box in, so
 * the selection falls back to an upright one around both — which is what every
 * tool does, and what the resize arithmetic below already assumed before any of
 * this could be rotated at all.
 */
export function sharedTurn(elements: readonly BlockElement[]): number {
  const first = elements[0]?.rotation ?? 0
  return elements.every((element) => (element.rotation ?? 0) === first) ? first : 0
}

/** Rounds away the floating-point tail scaling a group leaves behind. */
const tidy = (value: number) => Math.round(value * 1e6) / 1e6

/** A corner names both axes, and only a corner can hold a ratio. */
const isCorner = (handle: Handle) => handle.includes('-')

/**
 * The smallest thing worth asking somebody to click, as a fraction of the
 * artboard. About the width of a fingertip at the size the canvas is usually
 * drawn, and a shade under the corner handles so it never hides them.
 */
const MIN_GRAB = 0.022

/**
 * The target for an element, which is its rectangle or a little more.
 *
 * **A hit area the size of the element is only fair for elements you can
 * see.** A rule is two thousandths of the block tall and a caption on a dense
 * card is not much more; both were drawn correctly, selectable in theory, and
 * in practice reached by clicking four times and then giving up and using the
 * layer list. Grown from the centre so the target stays over the thing it
 * belongs to, and only ever grown — a full-bleed shape is already easy to hit
 * and does not need to reach further.
 */
function grab(rect: Rect, scale: number): Rect {
  const least = scale * MIN_GRAB
  const width = Math.max(rect.width, least)
  const height = Math.max(rect.height, least)
  return {
    x: rect.x - (width - rect.width) / 2,
    y: rect.y - (height - rect.height) / 2,
    width,
    height,
  }
}

/** The box that holds all of them, in block fractions. */
function boundsOf(boxes: readonly Box[]): Box {
  const start = Math.min(...boxes.map((box) => box.start))
  const top = Math.min(...boxes.map((box) => box.top))
  return {
    start,
    top,
    width: Math.max(...boxes.map((box) => box.start + box.width)) - start,
    height: Math.max(...boxes.map((box) => box.top + box.height)) - top,
  }
}

/**
 * How far past the block this selection's handles may travel.
 *
 * **A chip overhangs on purpose and everything else does not**, which is the
 * same split `validateBlock` makes and the same reserve it allows — `CHIP_BLEED`
 * rather than the larger `BLEED` a move may use, because a resize that outruns
 * the room the slot gap reserved is a chip on the neighbouring card.
 * Clamping a chip to the block pulled it back inside the moment a handle moved,
 * so the corner stopped following the pointer on the one element in the library
 * that is *designed* to sit over the edge.
 *
 * The most restrictive member wins: a chip dragged as part of a mixed selection
 * is being resized as part of a group, and a group that can leave the block
 * because one of its members may is not what anyone asked for.
 */
function overhangOf(elements: readonly BlockElement[]): number {
  return Math.min(...elements.map((element) => (element.kind === 'chip' ? CHIP_BLEED : 0)))
}

const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

/**
 * What clicking one element selects.
 *
 * A grouped element brings its group. That is the whole of what a group is here
 * — "these move together" — and it is why grouping is a shared id rather than a
 * tree: nothing about the geometry changes, only what a click means.
 */
function groupOf(elements: readonly BlockElement[], element: BlockElement): string[] {
  if (element.groupId === undefined) return [element.id]
  return elements
    .filter((entry) => entry.groupId === element.groupId)
    .map((entry) => entry.id)
}

/** Logical handle names, so a drag means the same thing in both directions. */
const HANDLES: { handle: Handle; fx: number; fy: number }[] = [
  { handle: 'start-top', fx: 0, fy: 0 },
  { handle: 'top', fx: 0.5, fy: 0 },
  { handle: 'end-top', fx: 1, fy: 0 },
  { handle: 'start', fx: 0, fy: 0.5 },
  { handle: 'end', fx: 1, fy: 0.5 },
  { handle: 'start-bottom', fx: 0, fy: 1 },
  { handle: 'bottom', fx: 0.5, fy: 1 },
  { handle: 'end-bottom', fx: 1, fy: 1 },
]

/**
 * The cursor for a handle, from where it actually is on the screen.
 *
 * **It was a column in the table, and a table cannot know.** A handle's
 * direction is a property of the *drawing*: the top-start corner of a shape
 * turned 90° is over on the right and resizes left-to-right, and in an Arabic
 * edition it is on the other side before any turn is applied. A fixed
 * `nwse-resize` was right in exactly one of those cases and quietly wrong in
 * the rest — the cursor is the only thing that tells an owner what a handle
 * will do before they commit to dragging it.
 *
 * Measured clockwise from upright and folded into a half turn, because a resize
 * cursor is a double-headed arrow: north-east and south-west are one picture.
 */
export function handleCursor(fx: number, fy: number, turn: number): string {
  const facing = (Math.atan2(fx - 0.5, 0.5 - fy) * 180) / Math.PI + turn
  const half = ((Math.round(facing / 45) * 45) % 180 + 180) % 180
  if (half === 0) return 'ns-resize'
  if (half === 45) return 'nesw-resize'
  if (half === 90) return 'ew-resize'
  return 'nwse-resize'
}

/**
 * The selection, and its handles.
 *
 * **One outline per element, one set of handles for the lot.** Handles on every
 * element of a multi-selection is eight times the furniture and answers a
 * question nobody asked — resizing several elements means resizing the group,
 * and the outlines are what say which ones are in it.
 */
function Selection({
  rects,
  content,
  turns,
  frameTurn,
  mirror,
  scale,
  interactive,
  onHandle,
  onRotate,
}: {
  rects: Rect[]
  /** Where the paint lands, one per `rects` entry. Null means it fills its box. */
  content: (Rect | null)[]
  /** Each element's own turn, one per `rects` entry. */
  turns: number[]
  /** The turn the handle frame is drawn at — zero when the selection disagrees. */
  frameTurn: number
  /** Whether the artboard reads right to left, which moves `start` to the right. */
  mirror: boolean
  scale: number
  interactive: boolean
  onHandle: (handle: Handle, event: React.PointerEvent) => void
  onRotate: (event: React.PointerEvent) => void
}) {
  const bounds = rects.reduce(
    (acc, rect) => ({
      x: Math.min(acc.x, rect.x),
      y: Math.min(acc.y, rect.y),
      right: Math.max(acc.right, rect.x + rect.width),
      bottom: Math.max(acc.bottom, rect.y + rect.height),
    }),
    { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity }
  )
  const box: Rect = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.right - bounds.x,
    height: bounds.bottom - bounds.y,
  }

  // Handles size with the artboard rather than with the element: a handle on a
  // 4%-tall caption has to stay big enough to grab, and one on a full-bleed
  // shape must not become a slab.
  const size = scale * 0.018

  /**
   * **The outline is furniture, not content, and it was competing with the
   * card.** A 1.5px minimum at full opacity draws a hard blue box around the
   * thing the owner is trying to look at — on a photograph it reads as part of
   * the design. Thinner and part-transparent still says "this one is selected"
   * without repainting its edges.
   *
   * The handles keep full opacity: they are targets rather than decoration, and
   * a target you have to hunt for is worse than a line that is slightly loud.
   */
  const stroke = Math.max(1, scale * 0.0022)
  const OUTLINE_OPACITY = 0.55

  /**
   * The mid-edge handles are drawn smaller than the corners, which is what
   * every tool this is modelled on does — a corner resizes both axes and is the
   * one reached for most, so it earns the larger mark.
   *
   * **Only the drawing shrinks.** Each handle keeps a transparent hit rect
   * larger than the square, so a smaller mark is not a smaller target:
   * shrinking the thing you have to grab is how "tidier" becomes "harder to
   * use" on a trackpad, and none of this is visible in a screenshot. How much
   * larger is `hit`, below.
   */
  const edgeSize = size * 0.62

  /**
   * **The target shrinks with the element, down to a floor.** A fixed target is
   * right up to the point where eight of them are wider than the thing they
   * belong to: on a small element the four corners then cover it completely
   * plus a margin all round, and the neighbour underneath cannot be clicked at
   * all while it is selected. Two thirds of the shorter side keeps every handle
   * inside its own half of the box, and the floor keeps it grabbable.
   */
  const hit = Math.max(size * 0.9, Math.min(size * 1.5, Math.min(box.width, box.height) * 0.66))

  return (
    <>
      {/*
        **Only when it is worth saying.** A mark that traces a ring already there
        is two lines where one would do, so it is drawn only where the paint
        falls meaningfully short of the box on one axis or the other — which on a
        well-packed card is almost never, and on the tall caption box that
        prompted this is every time.
      */}
      {content.map((rect, index) => {
        const ring = rects[index]
        if (rect === null || ring === undefined) return null
        const short = scale * 0.03
        if (ring.width - rect.width <= short && ring.height - rect.height <= short) return null

        return (
          <rect
            key={`content-${index}`}
            {...xywh(rect)}
            {...spin(turns[index] ?? 0, ring)}
            fill="none"
            stroke="var(--sq-ui-selected-ring)"
            strokeWidth={stroke}
            strokeOpacity={0.35}
            strokeDasharray={`${scale * 0.008} ${scale * 0.008}`}
            pointerEvents="none"
          />
        )
      })}

      {rects.map((rect, index) => (
        <rect
          key={index}
          {...xywh(rect)}
          // Turned about the element's own centre, exactly as the element is.
          {...spin(turns[index] ?? 0, rect)}
          fill="none"
          stroke="var(--sq-ui-selected-ring)"
          strokeWidth={stroke}
          strokeOpacity={OUTLINE_OPACITY}
          pointerEvents="none"
        />
      ))}

      {interactive ? (
        /*
          **One group, turned once.** The handles, the stalk and the rotation
          knob all belong to the same frame, so they are placed in upright
          coordinates and the whole assembly is turned about the frame's centre
          — which is also what makes the arithmetic in `onPointerMove` the
          inverse of what is drawn here, rather than a second version of it.
        */
        <g {...spin(frameTurn, box)}>
          <line
            x1={box.x + box.width / 2}
            y1={box.y}
            x2={box.x + box.width / 2}
            y2={box.y - size * 1.6}
            stroke="var(--sq-ui-selected-ring)"
            strokeWidth={stroke}
            strokeOpacity={OUTLINE_OPACITY}
            pointerEvents="none"
          />
          <circle
            cx={box.x + box.width / 2}
            cy={box.y - size * 1.6}
            r={size * 0.55}
            fill="var(--sq-ui-surface)"
            stroke="var(--sq-ui-selected-ring)"
            strokeWidth={stroke}
            style={{ cursor: 'grab' }}
            onPointerDown={onRotate}
          />

          {HANDLES.map(({ handle, fx: logical, fy }) => {
            /*
             * **`start` is a reading-order name and this is a screen**, so the
             * table's `fx` is mirrored here for an Arabic artboard — the one
             * place it can be, because `resolveBlock` has already mirrored the
             * rectangle these are drawn on.
             *
             * It was not, and the handles came out on the wrong edges: the
             * control on the screen-left was labelled `start`, `dStart` is
             * sign-flipped for the same direction, and the two cancelled into a
             * left edge that grew the shape to the right. Nothing in an
             * English artboard could show it.
             */
            const fx = mirror ? 1 - logical : logical

            // A corner names both axes; an edge names one. `fx`/`fy` at 0.5 is
            // exactly what "on an edge" means, so the table does not need a
            // column for it.
            const edge = fx === 0.5 || fy === 0.5
            const drawn = edge ? edgeSize : size
            const cx = box.x + box.width * fx
            const cy = box.y + box.height * fy
            const cursor = handleCursor(fx, fy, frameTurn)

            return (
              <g key={handle} style={{ cursor }} onPointerDown={(event) => onHandle(handle, event)}>
                {/* Where the modifier is said out loud. A corner holding the
                    proportions is the behaviour an owner expects and will not
                    think to question; the way *out* of it is the part nobody
                    guesses, so it is on the thing they are already pointing at. */}
                <title>
                  {edge
                    ? 'Drag to resize'
                    : 'Drag to resize. Hold Shift to change the proportions'}
                </title>
                {/* The target, invisible and larger than the mark. */}
                <rect
                  x={cx - hit / 2}
                  y={cy - hit / 2}
                  width={hit}
                  height={hit}
                  fill="transparent"
                />
                <rect
                  x={cx - drawn / 2}
                  y={cy - drawn / 2}
                  width={drawn}
                  height={drawn}
                  rx={drawn * 0.25}
                  fill="var(--sq-ui-surface)"
                  stroke="var(--sq-ui-selected-ring)"
                  strokeWidth={stroke}
                  pointerEvents="none"
                />
              </g>
            )
          })}
        </g>
      ) : null}
    </>
  )
}

/**
 * The SVG transform that turns something about a rectangle's own centre.
 *
 * `drawElement` writes the same string for the element itself; this is the
 * selection's half of it, and the two have to agree or the outline sits beside
 * the shape rather than on it.
 */
function spin(turn: number, about: Rect): { transform?: string } {
  return turn === 0
    ? {}
    : {
        transform: `rotate(${turn} ${about.x + about.width / 2} ${about.y + about.height / 2})`,
      }
}

/** What a screen reader is told an element is. Its binding, where it has one. */
function describe(element: BlockElement): string {
  switch (element.kind) {
    case 'text':
      return element.source.from === 'product'
        ? `Product ${element.source.field}`
        : element.source.from === 'shop'
          ? `Shop ${element.source.field}`
          : 'Fixed text'
    case 'image':
      return element.source.from === 'product' ? 'Product image' : 'Artwork'
    case 'priceMark':
      return 'Price'
    case 'chip':
      return 'Offer badge'
    case 'logo':
      return 'Logo'
    case 'shape':
      return element.variant === 'line' ? 'Line' : element.variant === 'ellipse' ? 'Circle' : 'Shape'
  }
}
