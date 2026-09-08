'use client'

import * as React from 'react'
import type { BlockElement, BrandKit } from '@souqstudio/types'
import {
  isBound,
  moveBox,
  resizeBox,
  resolveBlock,
  type Handle,
  type Rect,
} from '@souqstudio/engine'
import { resolvePalette, resolveToken } from '@/lib/brand-palette'
import { resolveScale } from '@/lib/brand-fonts'
import {
  drawElement,
  estimateWidth,
  measureText,
  type ArtboardOffer,
  type DrawContext,
} from '@/components/blocks/draw'

/**
 * The block designer's canvas. E7.
 *
 * **The same painter as the editor and `/brand`, with handles over the top.**
 * Canvas parity is a hard requirement in the design system — an owner moving
 * between designing a card and building a book must not feel they changed
 * application — and the cheapest way to guarantee it is to have one
 * implementation of a card rather than two that look alike.
 *
 * **Still no Fabric, and this is the surface that was supposed to need it.** The
 * argument for an object model is direct manipulation, which is exactly what
 * this does; what direct manipulation actually needs is a hit target, a delta
 * and somewhere to put the result, and the engine already owns the arithmetic
 * (`moveBox`, `resizeBox`). Adding Fabric here would mean a *second* painter —
 * Fabric objects built from the same elements — and the first thing that would
 * drift is the thing that matters most, which is whether the card the owner
 * designed is the card the PDF prints. E6 found the same and recorded it; this
 * is the harder case and the answer holds.
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
  shopName: string
  selected?: number | null
  onSelect?: ((index: number | null) => void) | undefined
  /** Called on every pointer move. A drag is one undo step, so it never commits. */
  onChange?: ((elements: BlockElement[]) => void) | undefined
  /** Push an undo step. Called once, as a drag begins. */
  onCheckpoint?: (() => void) | undefined
  /** Bound elements carry a persistent mark. Off for a preview that cannot be
   *  edited, where the distinction has nothing to act on. */
  markBound?: boolean
  className?: string
  ariaLabel?: string
}

type DragBase = {
  index: number
  startX: number
  startY: number
  origin: BlockElement
  /** The element holding the pointer capture, so the release goes to the same
   *  one that took it — `releasePointerCapture` on an element that never
   *  captured throws, and the svg is not the element that did. */
  captured: Element
}

type DragIntent = { kind: 'move' } | { kind: 'resize'; handle: Handle }
type Drag = DragIntent & DragBase

export function BlockArtboard({
  elements,
  kit,
  width,
  height,
  direction,
  offer,
  shopName,
  selected = null,
  onSelect,
  onChange,
  onCheckpoint,
  markBound = false,
  className,
  ariaLabel = 'Block',
}: Props) {
  const palette = resolvePalette(kit)
  const scale = resolveScale(kit)
  const blockSize = Math.sqrt(width * height)
  const interactive = onChange !== undefined && onSelect !== undefined

  // Estimate on the server and the first client paint, real metrics after mount.
  // Measuring differently on each side breaks lines differently and React flags
  // the mismatch — the same reasoning as `BookPage` and `BlockPreview`.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const svgRef = React.useRef<SVGSVGElement | null>(null)
  const drag = React.useRef<Drag | null>(null)

  const ctx: DrawContext = {
    token: (ref) => resolveToken(palette, ref),
    scale,
    blockSize,
    ar: direction === 'rtl',
    direction,
    measure: mounted ? measureText : estimateWidth,
    offer,
    shopName,
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

  /** Client pixels to block fractions, with RTL's one sign flip. */
  function delta(event: React.PointerEvent, from: { startX: number; startY: number }) {
    const box = svgRef.current?.getBoundingClientRect()
    if (box === undefined || box.width === 0 || box.height === 0) return { dStart: 0, dTop: 0 }

    const dx = (event.clientX - from.startX) / box.width
    return {
      dStart: direction === 'rtl' ? -dx : dx,
      dTop: (event.clientY - from.startY) / box.height,
    }
  }

  function onPointerMove(event: React.PointerEvent) {
    const active = drag.current
    if (active === null || onChange === undefined) return

    const { dStart, dTop } = delta(event, active)
    const next =
      active.kind === 'move'
        ? { ...active.origin, box: moveBox(active.origin.box, dStart, dTop) }
        : { ...active.origin, box: resizeBox(active.origin.box, active.handle, dStart, dTop) }

    // One undo step per drag, not one per pointer move: the step was pushed on
    // pointer down, before anything had changed.
    onChange(
      elements.map((element, index) => (index === active.index ? (next as BlockElement) : element))
    )
  }

  function endDrag(event: React.PointerEvent) {
    const active = drag.current
    if (active === null) return
    drag.current = null
    if (active.captured.hasPointerCapture?.(event.pointerId)) {
      active.captured.releasePointerCapture(event.pointerId)
    }
  }

  function startDrag(event: React.PointerEvent, next: DragIntent & Omit<DragBase, 'captured'>) {
    if (!interactive) return
    event.preventDefault()
    event.stopPropagation()
    // The undo step is the document *before* the drag, taken once here.
    onCheckpoint?.()

    // Captured on the element the pointer went down on, so a fast drag that
    // leaves the artboard keeps sending moves instead of dropping the element
    // wherever it happened to be when the pointer crossed the edge.
    const captured = event.currentTarget as Element
    captured.setPointerCapture?.(event.pointerId)
    drag.current = { ...next, captured }
  }

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
      onClick={interactive ? () => onSelect?.(null) : undefined}
    >
      {/* The paper, in the offer book's own token set. A block's own `shape`
          element usually covers it; this is what shows where it does not. */}
      <rect width={width} height={height} fill="var(--sq-tpl-paper)" />

      {resolved.map(({ element, rect }, index) => (
        <React.Fragment key={index}>{drawElement(element, rect, ctx)}</React.Fragment>
      ))}

      {interactive
        ? resolved.map(({ rect }, index) => (
            <rect
              key={`hit-${index}`}
              {...xywh(rect)}
              fill="transparent"
              className="cursor-move outline-none"
              role="button"
              tabIndex={0}
              aria-label={describe(elements[index])}
              aria-pressed={selected === index}
              onPointerDown={(event) => {
                onSelect?.(index)
                const origin = elements[index]
                if (origin === undefined) return
                startDrag(event, {
                  kind: 'move',
                  index,
                  startX: event.clientX,
                  startY: event.clientY,
                  origin,
                })
              }}
              onClick={(event) => {
                event.stopPropagation()
                onSelect?.(index)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                onSelect?.(index)
              }}
            />
          ))
        : null}

      {/* **Bound elements are marked whether or not anything is selected.** The
          design system requires the distinction in three places — here, the
          layer list and the palette — because a shop that cannot tell which
          elements move with the catalog cannot predict what their card does
          across twelve products. Dashed, so the solid ring stays selection. */}
      {markBound
        ? resolved.map(({ element, rect }, index) =>
            isBound(element) ? (
              <rect
                key={`bound-${index}`}
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

      {/* Drawn last so nothing paints over the selection — a chip anchored
          TOP_START overhangs its box by design and would otherwise cover it. */}
      {selected !== null && resolved[selected] !== undefined ? (
        <Selection
          rect={resolved[selected].rect}
          scale={Math.max(width, height)}
          interactive={interactive}
          onHandle={(handle, event) => {
            const origin = elements[selected]
            if (origin === undefined) return
            startDrag(event, {
              kind: 'resize',
              index: selected,
              handle,
              startX: event.clientX,
              startY: event.clientY,
              origin,
            })
          }}
        />
      ) : null}
    </svg>
  )
}

const xywh = (r: Rect) => ({ x: r.x, y: r.y, width: r.width, height: r.height })

/** Logical handle names, so a drag means the same thing in both directions. */
const HANDLES: { handle: Handle; fx: number; fy: number; cursor: string }[] = [
  { handle: 'start-top', fx: 0, fy: 0, cursor: 'nwse-resize' },
  { handle: 'top', fx: 0.5, fy: 0, cursor: 'ns-resize' },
  { handle: 'end-top', fx: 1, fy: 0, cursor: 'nesw-resize' },
  { handle: 'start', fx: 0, fy: 0.5, cursor: 'ew-resize' },
  { handle: 'end', fx: 1, fy: 0.5, cursor: 'ew-resize' },
  { handle: 'start-bottom', fx: 0, fy: 1, cursor: 'nesw-resize' },
  { handle: 'bottom', fx: 0.5, fy: 1, cursor: 'ns-resize' },
  { handle: 'end-bottom', fx: 1, fy: 1, cursor: 'nwse-resize' },
]

function Selection({
  rect,
  scale,
  interactive,
  onHandle,
}: {
  rect: Rect
  scale: number
  interactive: boolean
  onHandle: (handle: Handle, event: React.PointerEvent) => void
}) {
  // Handles size with the artboard rather than with the element: a handle on a
  // 4%-tall caption has to stay big enough to grab, and one on a full-bleed
  // shape must not become a slab.
  const size = scale * 0.018
  const stroke = Math.max(1.5, scale * 0.004)

  return (
    <>
      <rect
        {...xywh(rect)}
        fill="none"
        stroke="var(--sq-ui-selected-ring)"
        strokeWidth={stroke}
        pointerEvents="none"
      />
      {interactive
        ? HANDLES.map(({ handle, fx, fy, cursor }) => (
            <rect
              key={handle}
              x={rect.x + rect.width * fx - size / 2}
              y={rect.y + rect.height * fy - size / 2}
              width={size}
              height={size}
              rx={size * 0.25}
              fill="var(--sq-ui-surface)"
              stroke="var(--sq-ui-selected-ring)"
              strokeWidth={stroke}
              style={{ cursor }}
              onPointerDown={(event) => onHandle(handle, event)}
            />
          ))
        : null}
    </>
  )
}

/** What a screen reader is told an element is. Its binding, where it has one. */
function describe(element: BlockElement | undefined): string {
  if (element === undefined) return 'Element'
  switch (element.kind) {
    case 'text':
      return element.source.from === 'product'
        ? `Product ${element.source.field}`
        : element.source.from === 'shop'
          ? `Shop ${element.source.field}`
          : 'Fixed text'
    case 'image':
      return element.source.from === 'product' ? 'Product image' : 'Image'
    case 'priceMark':
      return 'Price'
    case 'chip':
      return 'Offer badge'
    case 'logo':
      return 'Logo'
    case 'shape':
      return 'Shape'
  }
}
