import type { Metadata } from 'next'
import { prisma } from '@souqstudio/db'
import { requireCompliantSession } from '@/lib/session'
import { getActiveShop } from '@/lib/active-shop'
import { readEffectiveBrand } from '@/lib/brand-kit'
import { listBlocks } from '@/lib/blocks'
import { NewBookWizard } from '@/components/offer-book/NewBookWizard'
import type { PickableBlock } from '@/components/offer-book/types'

export const metadata: Metadata = { title: 'New offer book · SouqStudio' }

/**
 * Starting an offer book. E6 — `docs/E6-create-flow.md`.
 *
 * **A static segment, and it has to be.** `editor/[id]` would otherwise catch
 * `/editor/new` and look up a book with the id `new`. Next resolves a static
 * segment ahead of a dynamic sibling, which is what makes this safe, and it is
 * the route the home screen's New button and the getting-started checklist have
 * both pointed at since E1-05.
 *
 * **It keeps the dashboard shell**, unlike the editor. This is a set of choices,
 * not an artboard: the design skill's second layout family escapes the shell
 * because a canvas needs the width, and a screen with no canvas on it has no
 * such claim. Leaving the rail also means an owner who changes their mind is one
 * click from where they were rather than needing a back control this screen
 * would have to invent.
 *
 * **Three reads on the server, in parallel, and all three are the wizard's.**
 * The block list is the one that matters: the design step draws every tile with
 * `BlockPreview`, which needs the arrangements and the brand kit, and a client
 * that fetched them would render an empty grid first and fill it in after
 * hydration.
 */
export default async function NewBookPage() {
  const session = await requireCompliantSession()
  const shop = await getActiveShop(session)

  /*
   * A book belongs to a shop and the wizard cannot invent one, so this is
   * answered before anything else is read. Returning here rather than passing
   * `hasShop={false}` down is what keeps the wizard's brand kit non-optional:
   * there is no kit to read on this path, and a component prop that is only
   * sometimes real is a prop every other branch has to check.
   */
  if (shop === null) {
    return (
      <Shell>
        <p className="font-ui text-body text-secondary">
          Create a shop before making an offer book.
        </p>
      </Shell>
    )
  }

  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { planId: true },
  })

  const [brand, blocks] = await Promise.all([
    // The shop's *effective* kit, not its own row: a branch that inherits the
    // organization's brand has an empty `brandKit` of its own, and drawing the
    // tiles from that renders every colour as a fallback.
    readEffectiveBrand({
      organizationId: shop.organizationId,
      shopId: shop.id,
      brandOverride: shop.brandOverride,
    }),
    // `forComposing` excludes the organization's drafts — the designer's
    // availability control promises exactly that, and a half-finished block is
    // not something to start a book from.
    listBlocks(session.user.organizationId, organization?.planId ?? null, {
      forComposing: true,
    }),
  ])

  /*
   * **Repeating blocks only, which is the offer card and nothing else.** A
   * static block draws once and reads no offer, so a book whose every cell named
   * one would draw a page of identical brand panels with no products on it.
   * `categoryRepeats` says the same thing from the other direction.
   *
   * The shop's own are included whatever their category, because a block an
   * owner authored has no category — that is a fact about the library we
   * shipped, not about their row — and `repeats` is the property that actually
   * decides whether it can hold a product.
   */
  const pickable: PickableBlock[] = blocks
    .filter((block) => block.repeats)
    .map((block) => ({
      id: block.id,
      name: block.name,
      arrangements: block.arrangements,
      organizationId: block.organizationId,
      locked: block.locked,
      planTier: block.planTier,
    }))

  return (
    <Shell>
      <NewBookWizard
        blocks={pickable}
        kit={brand.brandKit}
        // The book's language *defaults* from the interface and is not asked
        // about. An owner working in an Arabic UI is overwhelmingly making an
        // Arabic flyer, and the one who is not changes it in the editor. It stays
        // a real property of the book: the artboard follows the document's
        // language, never the interface's.
        lang="en"
      />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    // The dashboard's content measure, the same one `/catalog` and the settings
    // screens use. Without it the steps stretch to the full width of the
    // viewport.
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">New offer book</h1>
        <p className="font-ui text-body text-secondary">
          Four steps. You can change any of it afterwards.
        </p>
      </div>
      {children}
    </div>
  )
}
