import type { Arrangement, BlockElement } from '@souqstudio/types'
import { layerName } from './layer-name'

/**
 * Whether a document is one a **seeded** block may hold.
 *
 * Seeded blocks are the library every account composes with, and one of them
 * has to name a colour before it has ever met a shop — so it names a role the
 * kit fills, and never a palette entry (which is one shop's) or a literal
 * (which is nobody's). An owner's own block has met them and may use all three.
 *
 * **Here rather than in the web app, because there are now two writers.** It
 * used to live in `apps/web/lib/block-document.ts`, checked when an API request
 * carried a document; `library.test.ts` then re-implemented it inline to hold
 * the shipped blocks to the same bar, with a comment admitting as much. A
 * document loaded from a file is a third caller and the one furthest from that
 * route, so the rule moved to the package all three can reach. The web app
 * re-exports it, and every existing call site is unchanged.
 *
 * **A gradient fails this by construction**, and that is the intended answer
 * rather than an oversight: its `from` is `gradient`, never `role`, so no
 * seeded block can hold one however its stops are named. The shipped library
 * stays flat — the design system's "no gradients" is about our own surfaces,
 * and a card the owner designed is not one of them.
 */
export function usesOnlyRoles(arrangements: readonly Arrangement[]): boolean {
  return colourProblems(arrangements).length === 0
}

/** One colour a seeded block may not hold: which layer, and which of its colours. */
export interface ColourProblem {
  elementId: string
  /** What the layer list calls the layer. */
  layer: string
  /** Where it sits in the layer list, counting from the top — 1 is frontmost. */
  position: number
  /** Which of its colours, in the words the properties panel uses. */
  slot: string
}

/**
 * Every colour on a block that is not a brand-kit role.
 *
 * **A list rather than a yes or no**, because "this block names a colour
 * directly" left the person publishing it to hunt through every layer and every
 * colour on it — fill, border, shadow, background, depth, twelve on a price —
 * for the one that was picked from the palette. The refusal now says which.
 */
export function colourProblems(arrangements: readonly Arrangement[]): ColourProblem[] {
  const problems: ColourProblem[] = []
  const seen = new Set<string>()
  const checkAt = (
    element: BlockElement,
    position: number,
    slot: string,
    value: { from: string } | undefined
  ) => {
    if (value === undefined || value.from === 'role') return
    // An element is repeated once per arrangement; report it once.
    const key = `${element.id}:${slot}`
    if (seen.has(key)) return
    seen.add(key)
    problems.push({ elementId: element.id, layer: layerName(element), position, slot })
  }

  for (const arrangement of arrangements) {
    arrangement.elements.forEach((element, index) => {
      // The layer list shows paint order reversed: the last element is on top.
      const at = arrangement.elements.length - index
      const check = (slot: string, value: { from: string } | undefined) =>
        checkAt(element, at, slot, value)
      // **Every colour slot on the element, including the ones added last.**
      // A slot left out here is a hole in the exact guarantee this function
      // exists for; the text's ground and its depth were missing until 27
      // September. An absent value is not a violation: an outline-only shape
      // names no fill. E14 §2.4.
      if (element.kind === 'shape') {
        check('fill', element.fill)
        check('border', element.stroke?.color)
        check('shadow', element.shadow?.color)
      }
      if (element.kind === 'text') {
        check('text colour', element.color)
        check('background', element.background?.fill)
        check('outline', element.stroke?.color)
        check('shadow', element.shadow?.color)
        check('3D depth', element.extrude?.color)
      }
      if (element.kind === 'chip') check('fill', element.fill)
      if (element.kind === 'image') {
        check('border', element.stroke?.color)
        check('shadow', element.shadow?.color)
      }
      if (element.kind === 'priceMark') {
        const style = element.style
        // **Every colour slot, not the three it shipped with.** Listed rather
        // than iterated because the object also holds `ground`, `frame`,
        // `preset` and `recipe`, which are not colours.
        const slots: [string, { from: string } | undefined][] = [
          ['tint', style?.tint],
          ['ink', style?.ink],
          ['surface', style?.surface],
          ['price colour', style?.majorInk],
          ['decimals colour', style?.minorInk],
          ['currency colour', style?.currencyInk],
          ['was-price colour', style?.compareInk],
          ['prefix colour', style?.prefixInk],
          ['ground', style?.groundFill],
          ['ground border', style?.groundStroke],
          ['tab', style?.tabFill],
          ['tab text', style?.tabInk],
        ]
        for (const [slot, value] of slots) check(slot, value)
      }
    })
  }
  return problems
}

/**
 * The problems as one sentence a person can act on — "the background and text
 * colour on Offer tier, and the fill on Shape (layer 5 from the top)" — in the
 * layer list's own words, grouped by layer. Two layers with one name get their
 * place in the list, or the sentence names one of them twice and neither can be
 * found. Every refusal of a seeded block's colours says this, so the admin
 * console, the export route and the loader agree.
 */
export function describeColourProblems(problems: readonly ColourProblem[]): string {
  const layers = new Map<string, { layer: string; position: number; slots: string[] }>()
  for (const problem of problems) {
    const entry = layers.get(problem.elementId)
    if (entry === undefined) {
      layers.set(problem.elementId, {
        layer: problem.layer,
        position: problem.position,
        slots: [problem.slot],
      })
    } else entry.slots.push(problem.slot)
  }

  const named = [...layers.values()]
  const shared = (name: string) => named.filter((entry) => entry.layer === name).length > 1
  const parts = named.map(({ layer, position, slots }) => {
    const where = shared(layer) ? `${layer} (layer ${position} from the top)` : layer
    return `the ${list(slots)} on ${where}`
  })
  return list(parts, parts.some((part) => part.includes(' and ')) ? ', and ' : ' and ')
}

/** "a", "a and b", "a, b and c". */
function list(items: readonly string[], last = ' and '): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')}${last}${items[items.length - 1]}`
}
