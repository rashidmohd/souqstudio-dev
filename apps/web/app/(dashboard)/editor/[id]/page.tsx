import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@souqstudio/db'
import { requireCompliantSession } from '@/lib/session'
import { getActiveShop } from '@/lib/active-shop'
import { readEffectiveBrand } from '@/lib/brand-kit'
import { blockWindow } from '@souqstudio/engine'
import { listBlocks } from '@/lib/blocks'
import { loadBook } from '@/lib/offer-book'
import { env } from '@/lib/env'
import { EditorShell } from '@/components/editor/EditorShell'

export const metadata: Metadata = { title: 'Offer book · SouqStudio' }

/**
 * The offer book editor. E6.
 *
 * **This is the first screen in the product that runs the layout engine over
 * database rows.** Everything before it drew literals.
 *
 * A server component that reads `loadBook` directly rather than fetching its own
 * API — the same way `/catalog` reads `lib/catalog.ts`. The client shell takes
 * it from there, because selection and price edits are logical state and belong
 * in the store.
 *
 * The route escapes the dashboard shell — no rail, full bleed — per the design
 * skill's second layout family. What is still missing is the offer tray, E6-02's
 * other half: reordering, grouping two products under one offer, adding to a
 * book that already exists.
 */
export default async function EditorPage({ params }: { params: { id: string } }) {
  const session = await requireCompliantSession()
  // Read once, so every block on this page is judged against the same instant.
  const now = new Date()
  const book = await loadBook(params.id, session.user.organizationId)

  // `loadBook` already filtered by organization, so a null here is either a book
  // that does not exist or one that is not theirs — and those are the same
  // answer on purpose. A different message for the second confirms the id.
  if (book === null) notFound()

  const shop = await getActiveShop(session)
  if (shop === null) notFound()

  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { planId: true, country: true },
  })

  const [brand, tiers, blocks] = await Promise.all([
    // The shop's *effective* kit, not its own row: a branch that inherits the
    // organization's brand has an empty `brandKit` of its own, and drawing the
    // book from that would render every colour as a fallback.
    readEffectiveBrand({
      organizationId: shop.organizationId,
      shopId: shop.id,
      brandOverride: shop.brandOverride,
    }),
    // The tier is the one authoring control on the price mark, so the panel
    // needs the list. Ordered as the organization sees them everywhere else:
    // the default first, then oldest.
    prisma.promoTier.findMany({
      where: { organizationId: session.user.organizationId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, labelEn: true },
    }),
    // Only what this shop may pin: a repeating block reads the offer it was
    // given, and a pin has none, so pinning one would draw a blank card where
    // the owner put a brand panel.
    // Composing, so the organization's drafts are excluded — the designer's
    // availability control promises exactly that. `lib/blocks.ts`.
    listBlocks(session.user.organizationId, organization?.planId ?? null, {
      forComposing: true,
    }),
  ])

  /*
   * Static, unlocked and not archived — the same test `pinnable` applies, and
   * for the same reason. Narrowed to `{ id, name, category }` because a client
   * component holds it and `BlockSummary` carries the arrangements.
   */
  const bandBlocks = blocks
    .filter((block) => !block.repeats && !block.locked && block.status !== 'archived')
    .map((block) => ({ id: block.id, name: block.name, category: block.category }))

  return (
    <EditorShell
      bookId={book.id}
      title={book.title}
      status={book.status}
      edition={book.edition}
      page={book.page}
      pages={book.pages}
      offers={book.offers}
      blocks={book.blocks}
      kit={brand.brandKit}
      shopName={shop.name}
      tiers={tiers}
      // Every offer in a book shares a currency — it is the shop's, not the
      // offer's, and the per-offer column is what a multi-country group will
      // need later. The fallback matches the column default.
      currency={book.offers[0]?.priceMark.currency ?? 'AED'}
      overrides={book.overrides}
      pins={book.pins}
      layout={book.layout}
      cells={book.cells}
      // **The composer's half of E7-03.** A seasonal panel is offered first in
      // the week it matters, and the window is computed rather than read off the
      // row — Ramadan and both Eids move against the Gregorian calendar. The
      // occasion travels on the block, which is what makes an owner's *copy* of
      // the Ramadan band work as well as ours.
      pinnable={blocks
        .filter((block) => !block.repeats && !block.locked && block.status !== 'archived')
        .map((block) => {
          const window = blockWindow(block, now, organization?.country ?? 'AE')
          const live =
            window !== null && now >= window.from && now <= window.to
              ? { starts: window.starts.toISOString() }
              : null
          return { id: block.id, name: block.name, ...(live === null ? {} : { season: live }) }
        })}
      /*
       * **Which static blocks can be a running band, by what they are for.**
       * "Which of these fifty is a footer" is not a question to put to an owner,
       * so the category does the filtering here, on the server, where the
       * shipped library's own taxonomy is already attached to the row.
       *
       * A block the *shop* authored has a null category — that is a fact about
       * our library, not about their row — so theirs are offered in both lists.
       * `repeats` is the property that actually decides eligibility: a repeating
       * card in a static band reads an offer it was never given and draws an
       * empty card across every page.
       */
      headerBlocks={bandBlocks.filter(
        (block) => block.category === 'header' || block.category === null
      )}
      footerBlocks={bandBlocks.filter(
        (block) => block.category === 'footer' || block.category === null
      )}
      assetBaseUrl={env.R2_PUBLIC_URL}
      gridProblems={book.gridProblems}
    />
  )
}
