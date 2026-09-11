import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireCompliantSession } from '@/lib/session'
import { getActiveShop } from '@/lib/active-shop'
import { readEffectiveBrand } from '@/lib/brand-kit'
import { loadBook } from '@/lib/offer-book'
import { env } from '@/lib/env'
import { BookPreview } from '@/components/offer-book/BookPreview'

export const metadata: Metadata = { title: 'Preview · SouqStudio' }

/**
 * What you just made. E6 — `docs/E6-create-flow.md` §2.4.
 *
 * **The book is already real when this renders**, and that is the design rather
 * than a compromise. `loadBook` runs the layout engine over database rows and
 * there is no second path that composes a book from a request body; adding one
 * so the preview could precede the write would mean two composition paths that
 * have to agree forever, and the one nobody looks at is the one that drifts.
 *
 * So Create writes a `draft`, this draws it, and the two actions on it are
 * **Open editor** and **Discard**. Discard is what makes writing first
 * defensible: without it, a book the owner looked at and did not want would sit
 * on the home screen, and a list that fills with abandoned attempts is one the
 * owner learns to ignore.
 *
 * **Its own route rather than a state inside the wizard.** A composed page needs
 * the engine, the painter and the brand kit, all of which the server already
 * has here; reaching them from inside a client wizard would mean fetching the
 * composition over HTTP to draw something the server could have rendered. It is
 * also a URL an owner can come back to, which a step in a client component is
 * not.
 *
 * **It keeps the dashboard shell.** This is a screen you look at and press one
 * of two buttons on. The rail is one click back to where they were.
 */
export default async function BookPreviewPage({ params }: { params: { id: string } }) {
  const session = await requireCompliantSession()
  const book = await loadBook(params.id, session.user.organizationId)

  // `loadBook` already filtered by organization, so a null here is either a book
  // that does not exist or one that is not theirs, and those are the same answer
  // on purpose. A different message for the second confirms the id.
  if (book === null) notFound()

  const shop = await getActiveShop(session)
  if (shop === null) notFound()

  const brand = await readEffectiveBrand({
    organizationId: shop.organizationId,
    shopId: shop.id,
    brandOverride: shop.brandOverride,
  })

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">{book.title}</h1>
        <p className="font-ui text-body text-secondary">
          Here is what you made. Open it to set prices and change the layout.
        </p>
      </div>

      <BookPreview
        bookId={book.id}
        pages={book.pages}
        size={book.page}
        offers={Object.fromEntries(book.offers.map((offer) => [offer.id, offer]))}
        blocks={book.blocks}
        kit={brand.brandKit}
        shopName={shop.name}
        // The **book's** language, never the interface's. An owner working in an
        // Arabic UI who is producing an English flyer must see an English flyer.
        direction={book.edition === 'ar' ? 'rtl' : 'ltr'}
        background={book.layout.background}
        assetBaseUrl={env.R2_PUBLIC_URL}
        offerCount={book.offers.length}
        canDiscard={book.status === 'draft'}
      />
    </div>
  )
}
