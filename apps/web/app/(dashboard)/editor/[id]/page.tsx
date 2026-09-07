import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { requireCompliantSession } from '@/lib/session'
import { getActiveShop } from '@/lib/active-shop'
import { readEffectiveBrand } from '@/lib/brand-kit'
import { loadBook } from '@/lib/offer-book'
import { BookPage } from '@/components/editor/BookPage'
import { Figure } from '@/components/ui/figure'

export const metadata: Metadata = { title: 'Offer book · SouqStudio' }

/**
 * The offer book editor. E6 — **and today only the artboard half of it.**
 *
 * What exists: the book is loaded, composed and drawn. What does not: the offer
 * tray, the properties panel, selection, drag-to-reorder, undo, autosave. The
 * three-pane shell those need is E6-01 through E6-08 and is deliberately not
 * scaffolded here — an empty tray beside an empty panel would claim the screen
 * was built.
 *
 * **This is the first screen in the product that runs the layout engine over
 * database rows.** Everything before it drew literals.
 *
 * The route escapes the dashboard shell — no rail, full bleed — per the design
 * skill's second layout family. The artboard sits on `--sq-ui-canvas-surround`,
 * the one dark surface in the product, so the page pops the way paper does on a
 * desk.
 */
export default async function EditorPage({ params }: { params: { id: string } }) {
  const session = await requireCompliantSession()
  const book = await loadBook(params.id, session.user.organizationId)

  // `loadBook` already filtered by organization, so a null here is either a book
  // that does not exist or one that is not theirs — and those are the same
  // answer on purpose. A different message for the second confirms the id.
  if (book === null) notFound()

  // The shop's *effective* kit, not its own row: a branch that inherits the
  // organization's brand has an empty `brandKit` of its own, and drawing the
  // book from that would render every colour as a fallback.
  const shop = await getActiveShop(session)
  const brand = shop
    ? await readEffectiveBrand({
        organizationId: shop.organizationId,
        shopId: shop.id,
        brandOverride: shop.brandOverride,
      })
    : null

  // A book belongs to a shop, so there is always one — but `getActiveShop`
  // answers about the *cookie*, and an owner who switched shops since opening
  // this book would otherwise draw it in another branch's colours.
  if (brand === null) notFound()

  const offers = Object.fromEntries(book.offers.map((offer) => [offer.id, offer]))
  const flagged = book.offers.filter((offer) => offer.flags.length > 0).length

  return (
    <div className="flex min-h-screen flex-col bg-canvas-surround">
      <header className="flex flex-wrap items-center gap-3 border-b-hairline border-border-subtle bg-surface px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-pill px-2 py-1 font-ui text-body-sm text-secondary hover:bg-stone-100"
        >
          {/* Directional, so it mirrors in an Arabic interface. */}
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" strokeWidth={1.75} />
          Offer books
        </Link>

        <h1 className="font-ui text-subhead text-primary">{book.title}</h1>

        <span className="rounded-pill bg-sand px-2 py-px font-ui text-eyebrow uppercase text-secondary">
          {book.status}
        </span>

        <div className="ms-auto flex items-center gap-4 font-ui text-body-sm text-secondary">
          <span>
            <Figure value={book.offers.length} size="data-sm" />{' '}
            {book.offers.length === 1 ? 'offer' : 'offers'}
          </span>
          <span>
            <Figure value={book.pages.length} size="data-sm" />{' '}
            {book.pages.length === 1 ? 'page' : 'pages'}
          </span>
          <span className="uppercase">{book.edition}</span>
        </div>
      </header>

      {/* A quality flag is a publish blocker, not decoration — E6-01. Stated as a
          count with the reason, never a bare coloured dot. */}
      {flagged > 0 ? (
        <p className="flex items-center gap-2 border-b-hairline border-border-subtle bg-caution-bg px-4 py-2 font-ui text-body-sm text-caution-fg">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" strokeWidth={1.75} />
          <span>
            <Figure value={flagged} size="data-sm" /> of{' '}
            <Figure value={book.offers.length} size="data-sm" /> offers need attention before
            this book can publish — a missing price, an Arabic name or a product photo.
          </span>
        </p>
      ) : null}

      {book.gridProblems.length > 0 ? (
        <p className="border-b-hairline border-border-subtle bg-critical-bg px-4 py-2 font-ui text-body-sm text-critical-fg">
          This book&rsquo;s page grid has {book.gridProblems.length} problem
          {book.gridProblems.length === 1 ? '' : 's'}:{' '}
          {book.gridProblems.map((problem) => problem.code).join(', ')}.
        </p>
      ) : null}

      <div className="flex flex-1 flex-col items-center gap-8 overflow-auto p-8">
        {book.pages.map((page) => (
          <figure key={page.index} className="flex w-full max-w-3xl flex-col items-center gap-2">
            <BookPage
              page={page}
              size={book.page}
              offers={offers}
              blocks={book.blocks}
              kit={brand.brandKit}
              shopName={shop?.name ?? ''}
              // The artboard follows the *book's* language, never the
              // interface's. An owner working in an Arabic UI producing an
              // English flyer must see an English flyer.
              direction={book.edition === 'ar' ? 'rtl' : 'ltr'}
              className="rounded-artboard"
            />
            {/* On a chip rather than directly on the surround: the canvas
                surround is the one dark surface in the product and the system
                defines no ink token for it. Raised in `docs/E6-pending.md`
                rather than answered with an invented colour here. */}
            <figcaption className="rounded-pill bg-surface px-3 py-1 font-ui text-body-sm text-secondary">
              Page <Figure value={page.index + 1} size="data-sm" />
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}
