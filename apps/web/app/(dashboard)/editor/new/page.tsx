import type { Metadata } from 'next'
import { requireCompliantSession } from '@/lib/session'
import { getActiveShop } from '@/lib/active-shop'
import { listImportsForBook } from '@/lib/offer-book'
import { NewBookForm } from '@/components/offer-book/NewBookForm'

export const metadata: Metadata = { title: 'New offer book · SouqStudio' }

/**
 * Starting an offer book. E6-02.
 *
 * **A static segment, and it has to be.** `editor/[id]` would otherwise catch
 * `/editor/new` and look up a book with the id `new`. Next resolves a static
 * segment ahead of a dynamic sibling, which is what makes this safe — and it is
 * the route the home screen's New button and the getting-started checklist have
 * both pointed at since E1-05.
 *
 * **It keeps the dashboard shell**, unlike `editor/[id]`. This is a form, not an
 * artboard: the design skill's second layout family escapes the shell because a
 * canvas needs the width, and a screen with no canvas on it has no such claim.
 * Leaving the rail also means an owner who changes their mind is one click from
 * where they were rather than needing a back control this screen would have to
 * invent.
 */
export default async function NewBookPage() {
  const session = await requireCompliantSession()
  const [shop, imports] = await Promise.all([
    getActiveShop(session),
    // Empty for most shops, and then the choice is not offered at all. E5-06
    // committed these into the catalog and stopped; carrying their prices into
    // a book is the half it left to E6.
    listImportsForBook(session.user.organizationId),
  ])

  return (
    // The dashboard's content measure, the same one `/catalog` and the settings
    // screens use. Without it the form fields stretch to the full width of the
    // viewport — a title input a metre wide on a desktop monitor, which is what
    // this screen shipped as until someone looked at it.
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">New offer book</h1>
        <p className="font-ui text-body text-secondary">
          Pick the products this book starts with. You can change them later.
        </p>
      </div>

      <NewBookForm hasShop={shop !== null} imports={imports} />
    </div>
  )
}
