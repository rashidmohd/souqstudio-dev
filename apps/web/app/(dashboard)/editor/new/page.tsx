import type { Metadata } from 'next'
import { requireCompliantSession } from '@/lib/session'
import { getActiveShop } from '@/lib/active-shop'
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
  const shop = await getActiveShop(session)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">New offer book</h1>
        <p className="font-ui text-body text-secondary">
          Pick the products this book starts with. You can change them later.
        </p>
      </div>

      <NewBookForm hasShop={shop !== null} />
    </div>
  )
}
