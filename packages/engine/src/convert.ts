import type { Arrangement, Block, BlockElement } from '@souqstudio/types'
import { fixed } from './frame'
import type { DesignSize, LayoutFrame, LayoutLeaf, LayoutNode } from './frame'

/**
 * The flat element list, as a frame tree. E14 Phase 5 —
 * `docs/E14-implementation-plan.md` Phase 5.
 *
 * **Lossless by construction, and that is the whole design of this phase.** The
 * plan says each block takes a `designSize` equal to its current rendered size
 * "which makes the conversion exact rather than approximate", and the way to be
 * exact is to change no geometry at all: an arrangement becomes a **`free`
 * frame** holding one leaf per element, each carrying the element's own
 * fractional box.
 *
 * That is identical *by construction* rather than by testing. `resolveBlock`
 * maps a fractional box onto a container with one mirroring rule; `boxRect` in
 * `solve.ts` does the same arithmetic with the same rule for a child of a
 * `free` frame. Same input, same formula, same rect — which is why `free`
 * frames were kept in the design as "the `groupId` migration path" rather than
 * dropped once rows and columns existed.
 *
 * **This is a migration, not a redesign.** Nothing here produces a hugging row
 * or a filling child, because nothing can: turning a card into a real frame tree
 * is a design decision per block, and that is Phase 6, which rewrites
 * `library-cards.ts` and its siblings by hand. Phase 5's only job is to get 66
 * blocks across the boundary without moving a pixel.
 *
 * ## What does not convert losslessly, and why it is reported rather than hidden
 *
 * `priceMark` and `chip` are composite: one element that draws several pieces,
 * positioned by `layoutPriceMark` and `layoutChipStack` from ~1,200 and ~90
 * lines of bespoke fitting. §4 says both become frames — a row or column of
 * ordinary children — and under frames their pieces are laid out by `solve`
 * instead.
 *
 * **Those two cannot be both converted and byte-identical**, and the reason is
 * not effort. `layoutPriceMark` takes the *amount*: a mark's internal geometry
 * is a function of the price it is drawing, so there is no fixed set of boxes to
 * bake in. Either it stays a composite element that reflows per offer, or it
 * becomes a frame that reflows per offer under different rules. It cannot become
 * a frozen arrangement of boxes.
 *
 * So `convertArrangement` leaves both as leaves and **records a note**. The
 * conversion is complete and exact for the 759 elements that are ordinary, and
 * honest about the 179 that are not. `conversionNotes` is what Phase 6 works
 * through.
 */

export type ConversionNote = {
  blockId: string
  arrangement: number
  elementId: string
  kind: BlockElement['kind']
  /** Why this element did not become a frame. */
  reason: string
}

export interface ConvertedArrangement {
  aspectMin: number
  aspectMax: number
  root: LayoutFrame
}

export interface ConvertedBlock {
  id: string
  /**
   * The size the tree solves at. §5.1 — a block with frames in it is no longer
   * scale-free, so it declares one size and placement is a scalar.
   *
   * Taken from the reference region the library is authored against, so that a
   * converted block solves to exactly the rects `resolveBlock` produced there.
   */
  designSize: DesignSize
  arrangements: ConvertedArrangement[]
  /**
   * `ref` → the original element. The painter joins on this, which is what
   * `LayoutLeaf.ref` was added for: a converted tree carries geometry, and the
   * thing being drawn stays where it already was.
   */
  elements: Record<string, BlockElement>
  notes: ConversionNote[]
}

/**
 * Composite elements: one element, several drawn pieces, positioned by their
 * own fitting code rather than by a box.
 *
 * Named rather than inferred, for the reason `MARK_GROUNDS` is a list rather
 * than an `Exclude`: a kind added later should have to be considered, not
 * silently inherit whichever branch it happens to fall into.
 */
const COMPOSITE: readonly BlockElement['kind'][] = ['priceMark', 'chip']

const REASON: Readonly<Record<string, string>> = {
  priceMark:
    'layoutPriceMark positions its pieces from the amount being drawn, so there is no fixed set of boxes to bake in. Phase 6 authors it as a frame.',
  chip: 'layoutChipStack stacks its rows from the labels being drawn. Phase 6 authors it as a frame with a fill and a text.',
}

/** One element, as a leaf positioned by the box it already had. */
function toLeaf(element: BlockElement): LayoutLeaf {
  return {
    id: element.id,
    kind: 'leaf',
    ref: element.id,
    box: element.box,
    /*
     * A child of a `free` frame is positioned by its box and its sizing is not
     * read. Written as `fixed` of the fractional extent anyway: `hug` would be
     * a claim this element can report an intrinsic size, and `fill` is refused
     * outside a flow. The honest value is "it is what its box says".
     */
    width: fixed(element.box.width),
    height: fixed(element.box.height),
  }
}

export function convertArrangement(
  blockId: string,
  arrangement: Arrangement,
  index: number,
  design: DesignSize
): { converted: ConvertedArrangement; notes: ConversionNote[] } {
  const notes: ConversionNote[] = []
  const children: LayoutNode[] = []

  for (const element of arrangement.elements) {
    if (COMPOSITE.includes(element.kind)) {
      notes.push({
        blockId,
        arrangement: index,
        elementId: element.id,
        kind: element.kind,
        reason: REASON[element.kind] ?? 'Composite element.',
      })
    }
    // Composite or not, it converts to a leaf at the same box. What differs is
    // whether Phase 6 still has work to do on it.
    children.push(toLeaf(element))
  }

  const root: LayoutFrame = {
    id: `${blockId}#${index}`,
    kind: 'frame',
    width: fixed(design.width),
    height: fixed(design.height),
    layout: { mode: 'free' },
    children,
  }

  return {
    converted: { aspectMin: arrangement.aspectMin, aspectMax: arrangement.aspectMax, root },
    notes,
  }
}

/**
 * A whole block.
 *
 * `designSize` is the caller's, not the block's: a block does not carry one yet,
 * and the reference region is a property of where the library is drawn rather
 * than of the design. Phase 6 puts it on the document.
 */
export function convertBlock(block: Block, design: DesignSize): ConvertedBlock {
  const arrangements: ConvertedArrangement[] = []
  const notes: ConversionNote[] = []
  const elements: Record<string, BlockElement> = {}

  block.arrangements.forEach((arrangement, index) => {
    const result = convertArrangement(block.id, arrangement, index, design)
    arrangements.push(result.converted)
    notes.push(...result.notes)
    for (const element of arrangement.elements) elements[element.id] = element
  })

  return { id: block.id, designSize: design, arrangements, elements, notes }
}

/** Every element the conversion could not make a frame of, across a library. */
export function conversionNotes(blocks: readonly ConvertedBlock[]): ConversionNote[] {
  return blocks.flatMap((block) => block.notes)
}
