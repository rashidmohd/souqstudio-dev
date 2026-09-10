import { bookletGrid, postGrid } from '@souqstudio/engine'
import type { PageGrid } from '@souqstudio/types'
import { KIND_SPEC, kindOf, type BookKind } from '@/lib/book-kind'

/**
 * The master grid a new book starts from, chosen by what the owner said they
 * were making. E6 — `docs/E6-create-flow.md` §5.1.
 *
 * **Its own module, and the reason is bundle size rather than tidiness.**
 * `bookletGrid` and `postGrid` live in the engine's `library.ts` beside the
 * sixty-five seeded designs, so importing either as a *value* pulls every
 * element of every block into whatever bundle does it. `block-category.ts`
 * carries the measurement that made this a rule: 72 KB of blocks in a browser
 * chunk, to render six segment labels.
 *
 * So `book-kind.ts` holds the vocabulary and imports nothing but a type — the
 * wizard imports that — and this file holds the one function that reaches for
 * the engine. Nothing that runs in a browser imports this.
 *
 * No `server-only` even so: it is pure, it has a test, and marking it would only
 * mean the test could not import it.
 */

export interface GridChoice {
  /** What the owner is making. Decides the shape and whether there is a footer. */
  kind: BookKind
  /**
   * The repeating offer card every cell draws.
   *
   * **Checked by the caller, never here.** A block id arriving from a client is
   * a tenancy question — is it this organization's, is it seeded, is it behind a
   * plan — and this function has no session to answer it with. `createBook`
   * resolves it through `loadBlock` before calling. Undefined means the engine's
   * own default, which is what every book created before this existed used.
   */
  cardBlockId?: string
  /** Overrides the kind's own count. The editor's layout panel sends these. */
  perRow?: number
  bodyRows?: number
}

/**
 * **Two grids, not one with a flag**, because the footer is a real structural
 * difference and not a decoration: `bookletGrid` writes a merged static region
 * across a short extra row, and `postGrid` has no such row at all. A
 * `footer: false` parameter would make the grid with no footer read as the
 * special case, when on three of the four kinds it is what a page normally is.
 */
export function gridForKind(choice: GridChoice): PageGrid {
  const spec = KIND_SPEC[choice.kind]
  const perRow = choice.perRow ?? spec.perRow
  const bodyRows = choice.bodyRows ?? spec.bodyRows

  const options = {
    perRow,
    bodyRows,
    ...(choice.cardBlockId === undefined ? {} : { cardBlockId: choice.cardBlockId }),
  }

  return spec.footer ? bookletGrid(options) : postGrid(options)
}

/** The grid a *stored* book would start from, for a caller holding a format. */
export function gridForFormat(
  format: string,
  options: Omit<GridChoice, 'kind'> = {}
): PageGrid {
  return gridForKind({ kind: kindOf(format), ...options })
}
