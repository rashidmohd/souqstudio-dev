'use client'

import * as React from 'react'
import type { Rect } from '@souqstudio/engine'
import { needsEvenOdd, shapePath } from '@souqstudio/engine'
import type { PickableShape } from '@/lib/block-elements'

/**
 * One shape at glyph size, drawn by the engine that draws it on the card.
 *
 * **No icon set has these, and one that did would be the wrong drawing.** A
 * picture somebody drew of a burst is a second burst to keep in step with the
 * first, which is the exact divergence `packages/engine` exists to prevent —
 * arriving through an icon. So the mark for a shape is the shape: same `d`
 * string, same generator, so a button and the card it makes cannot disagree.
 *
 * Extracted the day a second caller appeared. The properties panel's variant
 * picker drew these first; the shapes panel needs the same thirteen marks, and
 * a second copy is a second copy that drifts the day a fourteenth shape lands.
 *
 * Named a mark rather than a glyph because `DesignerShell` already has a
 * `ShapeGlyph`, and it means something else: the little rectangle standing for
 * a *page* aspect. Two things called the same thing in one folder is a question
 * every reader has to answer once.
 *
 * An uploaded outline has no mark here: there is nothing to draw until its file
 * has been read, and what it looks like is not something a toolbar can say in
 * advance. `PickableShape` is the type that keeps that honest.
 *
 * `rect`, `ellipse` and `line` are not paths — they are drawn as their own SVG
 * elements on the card too, and turning a rectangle into a path here would draw
 * a mark the card does not make.
 */

/** Inset from the 16-unit box, so a burst's points are not clipped by the edge. */
const PREVIEW: Rect = { x: 1, y: 3, width: 14, height: 10 }

/**
 * The parametric shapes' settings, so a picker can draw the element it would
 * keep rather than a generic hexagon. Absent everywhere means the defaults,
 * which is what an unplaced shape is about to become.
 */
export type ShapeMarkOptions = {
  sides?: number | undefined
  curve?: number | undefined
  waves?: number | undefined
  tail?: number | undefined
}

export function ShapeMark({
  variant,
  options = {},
}: {
  variant: PickableShape
  options?: ShapeMarkOptions
}) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
      {variant === 'rect' ? (
        <rect x={1} y={3} width={14} height={10} rx={2} fill="currentColor" />
      ) : variant === 'ellipse' ? (
        <ellipse cx={8} cy={8} rx={7} ry={5} fill="currentColor" />
      ) : variant === 'line' ? (
        <rect x={1} y={7} width={14} height={2} rx={1} fill="currentColor" />
      ) : (
        <path
          // The radius is left out on purpose: it is in artboard units and this
          // box is sixteen of them across, so passing it would round a 16px
          // glyph into a disc.
          //
          // `ltr` rather than the interface direction. These are marks in a
          // toolbar, and a tag that flips with the UI is a different picture of
          // the same shape in the same list — the card is where direction is
          // read, and `shapePath` already mirrors it there.
          d={shapePath(variant, PREVIEW, 'ltr', options)}
          fill="currentColor"
          {...(needsEvenOdd(variant) ? { fillRule: 'evenodd' as const } : {})}
        />
      )}
    </svg>
  )
}
