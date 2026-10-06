'use client'

import * as React from 'react'
import { MAX_RESIZE, MIN_RESIZE } from '../../lib/arrangement-shape'
import { cn } from '../../lib/utils'

/**
 * Handles on the card's own edges, for a layout that keeps its shape: drag the
 * bottom up to make the card shorter, drag the end in to make it narrower.
 * `lib/arrangement-shape.ts` re-expresses the content against the new edge, so
 * the empty strip goes and the design stays where it was.
 *
 * **Only for a locked layout.** An unlocked one fills whatever cell picks it,
 * so a handle there would promise a size the book then ignores.
 *
 * **The cut is previewed and applied on release**, not redrawn every frame: a
 * dashed outline shows the card's new edge while the pointer moves, and the
 * document changes once, as one undo step. Redrawing the artboard per pointer
 * move would re-run the layout engine sixty times a second for an outline.
 *
 * **On the artboard's end, not the interface's.** The overlay carries the
 * card's own `dir`, so in an Arabic edition the width handle sits on the left,
 * where that card ends, whatever language the designer itself is in.
 *
 * Keyboard: each handle is a button, and the arrow keys resize by 5%.
 */
export function ShapeHandles({
  direction,
  onResize,
}: {
  /** The artboard's direction, which decides which side is the end. */
  direction: 'ltr' | 'rtl'
  /** New width and height as shares of the old: 0.83 is 17% shorter. */
  onResize: (width: number, height: number) => void
}) {
  const frame = React.useRef<HTMLDivElement>(null)
  const [drag, setDrag] = React.useState<{
    axis: 'x' | 'y'
    origin: number
    size: number
    ratio: number
  } | null>(null)

  const clamp = (ratio: number) => Math.min(MAX_RESIZE, Math.max(MIN_RESIZE, ratio))

  function begin(axis: 'x' | 'y', event: React.PointerEvent<HTMLButtonElement>) {
    const rect = frame.current?.getBoundingClientRect()
    if (rect === undefined) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({
      axis,
      origin: axis === 'y' ? event.clientY : event.clientX,
      size: axis === 'y' ? rect.height : rect.width,
      ratio: 1,
    })
  }

  function move(event: React.PointerEvent<HTMLButtonElement>) {
    if (drag === null) return
    const raw = (drag.axis === 'y' ? event.clientY : event.clientX) - drag.origin
    // The end is on the left of a right-to-left card, so dragging left grows it.
    const delta = drag.axis === 'x' && direction === 'rtl' ? -raw : raw
    setDrag({ ...drag, ratio: clamp((drag.size + delta) / drag.size) })
  }

  function end() {
    if (drag === null) return
    // A click without a drag changes nothing, and must not cost an undo step.
    if (Math.abs(drag.ratio - 1) > 0.005) {
      onResize(drag.axis === 'x' ? drag.ratio : 1, drag.axis === 'y' ? drag.ratio : 1)
    }
    setDrag(null)
  }

  function nudge(axis: 'x' | 'y', event: React.KeyboardEvent<HTMLButtonElement>) {
    const grow = axis === 'y' ? 'ArrowDown' : direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
    const shrink = axis === 'y' ? 'ArrowUp' : direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
    if (event.key !== grow && event.key !== shrink) return
    event.preventDefault()
    const ratio = event.key === grow ? 1.05 : 0.95
    onResize(axis === 'x' ? ratio : 1, axis === 'y' ? ratio : 1)
  }

  const handle = (axis: 'x' | 'y') => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => begin(axis, event),
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: () => setDrag(null),
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => nudge(axis, event),
  })

  return (
    <div
      ref={frame}
      dir={direction}
      // Over the artboard and out of its way: only the handles take pointers,
      // so selecting and dragging elements works exactly as before.
      className="pointer-events-none absolute inset-0"
    >
      {drag === null ? null : (
        <div
          aria-hidden="true"
          className="absolute start-0 top-0 rounded-artboard border-2 border-dashed border-border-focus"
          style={{
            width: drag.axis === 'x' ? `${drag.ratio * 100}%` : '100%',
            height: drag.axis === 'y' ? `${drag.ratio * 100}%` : '100%',
          }}
        />
      )}

      <div className="absolute bottom-0 end-0 start-0 flex translate-y-1/2 justify-center">
        <button
          type="button"
          aria-label="Card height: drag, or use the up and down arrow keys"
          title="Drag to make the card shorter or taller"
          className={cn(
            'pointer-events-auto h-2 w-12 cursor-ns-resize touch-none rounded-pill bg-action-primary',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus'
          )}
          {...handle('y')}
        />
      </div>

      <div className="absolute bottom-0 end-0 top-0 flex translate-x-1/2 items-center rtl:-translate-x-1/2">
        <button
          type="button"
          aria-label="Card width: drag, or use the arrow keys"
          title="Drag to make the card narrower or wider"
          className={cn(
            'pointer-events-auto h-12 w-2 cursor-ew-resize touch-none rounded-pill bg-action-primary',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus'
          )}
          {...handle('x')}
        />
      </div>
    </div>
  )
}
