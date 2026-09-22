/**
 * What a block document contains, described rather than drawn. E13-04.
 *
 * **This app does not render blocks, and that is deliberate.** Four surfaces in
 * `apps/web` draw from `packages/engine` through one painter,
 * `components/blocks/draw.tsx`, and CLAUDE.md is repeated and explicit that a
 * second painter is how the PDF stops matching the screen. That painter carries
 * around thirty imports from `apps/web`'s own `lib/` and `components/ui/`, so
 * bringing it here means either copying it, which *is* the second painter, or
 * extracting it into a package. The extraction is worth doing and is not a side
 * effect of building an admin screen.
 *
 * So the console describes the block's *shape*: how many arrangements it
 * declares, which aspect ranges they cover, and which product fields it binds.
 * That is most of what somebody deciding whether to publish actually checks,
 * and it is honest about being a description rather than a picture. The
 * thumbnail, where the row has one, is the picture.
 *
 * **Read defensively, never cast.** The column is JSONB, the shape has changed
 * repeatedly, and a row may predate any given field. A summary that threw would
 * take down a list of sixty-six blocks because one of them is old.
 *
 * No `server-only` here, unlike the rest of `lib/`. This module is pure — it
 * takes parsed JSON and returns a description — which is what makes it testable
 * without a database and what makes the defensive reading above worth writing
 * tests for. It holds nothing a client must not see.
 */

export type BlockSummary = {
  arrangements: number
  /**
   * Every distinct binding the document reads, as `source.field` — so "what
   * does this pull from the catalog" is answerable without opening the JSON.
   */
  bindings: string[]
  /** Elements that are identical on every card: shapes, rules, fixed copy. */
  staticElements: number
  /** Elements that pull live product, offer, shop or brand data. */
  boundElements: number
  /** The aspect ranges the arrangements claim, widest first. */
  ranges: string[]
  /** The document did not parse as a non-empty array of arrangements. */
  unreadable: boolean
}

type LooseSource = { from?: unknown; field?: unknown }
type LooseElement = { kind?: unknown; source?: unknown }
type LooseArrangement = { aspectMin?: unknown; aspectMax?: unknown; elements?: unknown }

/**
 * `static` is the one source that is not a binding. Everything else — product,
 * offer, shop, brand, asset — reads something outside the document.
 *
 * `asset` counts as bound even though the file never changes: an uploaded
 * badge resolves through `assetResolver` at draw time, so a published block
 * whose asset is missing draws a hole. That is worth seeing in this list.
 */
function describeSource(source: unknown): string | null {
  if (typeof source !== 'object' || source === null) return null
  const { from, field } = source as LooseSource
  if (typeof from !== 'string' || from === 'static') return null
  return typeof field === 'string' ? `${from}.${field}` : from
}

export function summarize(raw: unknown): BlockSummary {
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      arrangements: 0,
      bindings: [],
      staticElements: 0,
      boundElements: 0,
      ranges: [],
      unreadable: true,
    }
  }

  const arrangements = raw as LooseArrangement[]
  const bindings = new Set<string>()
  const ranges: string[] = []
  let bound = 0
  let fixed = 0

  for (const arrangement of arrangements) {
    if (typeof arrangement !== 'object' || arrangement === null) continue

    const min = arrangement.aspectMin
    const max = arrangement.aspectMax
    if (typeof min === 'number' && typeof max === 'number') {
      ranges.push(`${min.toFixed(2)} to ${max.toFixed(2)}`)
    }

    const elements = Array.isArray(arrangement.elements)
      ? (arrangement.elements as LooseElement[])
      : []

    for (const element of elements) {
      if (typeof element !== 'object' || element === null) continue
      const binding = describeSource(element.source)
      if (binding === null) {
        fixed += 1
      } else {
        bindings.add(binding)
        bound += 1
      }
    }
  }

  return {
    arrangements: arrangements.length,
    bindings: [...bindings].sort(),
    staticElements: fixed,
    boundElements: bound,
    ranges,
    unreadable: false,
  }
}
