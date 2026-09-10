import type { OfferBookFormat } from '@souqstudio/types'

/**
 * What a shop owner is making. E6 — `docs/E6-create-flow.md` §2.1.
 *
 * **A kind is the question; a format is the answer nobody asked for.** The
 * creation screen used to open with a seven-value select of `OfferBookFormat` —
 * `leaflet`, `catalog`, `a3`, `instagram_post`, `story`, `whatsapp`, `print` —
 * which is a list of page rectangles wearing product names. Three of those seven
 * are the same 1240×1754 sheet and two more are the same 1080 square, so an
 * owner was being asked to distinguish between options that produce identical
 * bytes. Nobody arrives wanting a format. They arrive wanting a flyer, a post,
 * a status or a poster.
 *
 * **Nothing new is stored.** A kind resolves to a format on the way in and is
 * never persisted: `offer_books.format` is the column it always was, every book
 * already written keeps rendering, and no migration is owed. A book created as
 * `catalog` before this existed reads back as a booklet, because `kindOf`
 * inverts the mapping rather than requiring a stored kind.
 *
 * **No `server-only`.** The wizard is a client component and needs the labels;
 * the create route needs the same table to validate against. One vocabulary,
 * both sides — the same argument `block-category.ts` makes at greater length.
 */
export const BOOK_KINDS = ['booklet', 'post', 'status', 'poster'] as const

export type BookKind = (typeof BOOK_KINDS)[number]

export interface KindSpec {
  /** What gets written to `offer_books.format`. */
  format: OfferBookFormat
  /** Sentence case, and it names the artefact rather than its dimensions. */
  label: string
  /** One line under the label. What the owner would do with it. */
  description: string
  /** Cards across. */
  perRow: number
  /** Card rows down, before any footer band. */
  bodyRows: number
  /**
   * Whether the page carries a footer band.
   *
   * The one structural difference between the two grids, and it is a real one:
   * a footer is print furniture. A post is looked at once, in a feed, at
   * thumbnail size first, and a strip of shop address across the bottom spends a
   * tenth of the only impression it gets on something nobody reads at that
   * scale. `postGrid` in the engine carries the same note.
   */
  footer: boolean
}

/**
 * The four, and why each is the shape it is.
 *
 * **The track counts are measured, not chosen.** A cell's aspect ratio decides
 * which arrangement `pickArrangement` selects, and the seeded offer cards carry
 * exactly two: `TALL` (0.35–0.85) and `WIDE` (1.35–2.6), from `library-kit.ts`.
 * **No card defines a `SQUARISH` arrangement**, and `pickArrangement` falls back
 * to the nearest rather than failing — so a grid whose cells land near 1.0
 * renders a tall design stretched into a square. Nothing errors. It just looks
 * wrong, which is the class of defect `docs/STATUS.md` §1.0 is about.
 *
 * Every count below was computed against the real page rectangle, the real gap
 * and the real margin, and every one lands inside `TALL`:
 *
 * | Kind | Page | Grid | Cell aspect | Band | Per page |
 * | --- | --- | --- | --- | --- | --- |
 * | booklet | 1240×1754 | 3 × 3 + footer | 0.769 | TALL | 9 |
 * | post | 1080×1080 | 3 × 2 | 0.645 | TALL | 6 |
 * | status | 1080×1920 | 2 × 3 | 0.807 | TALL | 6 |
 * | poster | 1754×2480 | 4 × 4 + footer | 0.744 | TALL | 16 |
 *
 * `book-kind.test.ts` recomputes that table from the grids the engine actually
 * returns and fails if any kind leaves the band. **That test is the point of
 * this comment** — the numbers here are the kind of thing a later change tidies
 * into rounder ones, and 3 × 4 on the poster (which reads as the obvious choice)
 * gives 1.017 and the stretched fallback.
 *
 * A poster is 4 × 4 rather than a bigger 3 × 3 because at 3 × 3 it is a leaflet
 * page printed larger, holding the same nine offers on four times the paper.
 *
 * **An owner can still reach `SQUARISH` from the editor's layout panel**, which
 * takes arbitrary track counts. That is not something this flow introduced and
 * not something it can fix. The fix is arrangements on the cards.
 * `docs/E6-create-flow.md` §7.
 */
export const KIND_SPEC: Record<BookKind, KindSpec> = {
  booklet: {
    format: 'leaflet',
    label: 'Offer booklet',
    description: 'Several pages of offers. Print it, or share the whole thing.',
    perRow: 3,
    bodyRows: 3,
    footer: true,
  },
  post: {
    format: 'instagram_post',
    label: 'Post',
    description: 'A square image for Instagram or WhatsApp.',
    perRow: 3,
    bodyRows: 2,
    footer: false,
  },
  status: {
    format: 'story',
    label: 'Status',
    description: 'A tall image for WhatsApp status or a story.',
    perRow: 2,
    bodyRows: 3,
    footer: false,
  },
  poster: {
    format: 'a3',
    label: 'Poster',
    description: 'One large sheet to print and put up in the shop.',
    perRow: 4,
    bodyRows: 4,
    footer: true,
  },
}

/**
 * The kind a stored format reads back as.
 *
 * **Total over `OfferBookFormat`, including the three the wizard no longer
 * offers.** `catalog` and `print` are the A4 sheet a booklet already is, and
 * `whatsapp` is the square a post already is; books carrying them exist and open
 * fine. Dropping them from the *menu* is a choice about what to ask an owner.
 * Dropping them from *here* would be a book that cannot say what it is.
 */
export function kindOf(format: string): BookKind {
  switch (format) {
    case 'instagram_post':
    case 'whatsapp':
      return 'post'
    case 'story':
      return 'status'
    case 'a3':
      return 'poster'
    default:
      return 'booklet'
  }
}

export function isBookKind(value: string): value is BookKind {
  return (BOOK_KINDS as readonly string[]).includes(value)
}
