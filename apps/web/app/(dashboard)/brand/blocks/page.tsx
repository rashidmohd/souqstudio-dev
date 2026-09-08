import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@souqstudio/db'
import { requireCompliantSession } from '@/lib/session'
import { getActiveShop } from '@/lib/active-shop'
import { readEffectiveBrand } from '@/lib/brand-kit'
import { listBlocks } from '@/lib/blocks'
import { NoShopBrandKit } from '@/components/brand/NoShopBrandKit'
import { BlockLibrary } from '@/components/blocks/BlockLibrary'

export const metadata: Metadata = { title: 'Blocks · SouqStudio' }

/**
 * The block library. E7.
 *
 * **Under `/brand`, because a brand kit *has* blocks.** The composition model is
 * explicit that a kit does not *contain a choice of one* — that was `gridId` and
 * `templateId`, and both came out — but the library is still the shop's own set
 * of designed pieces, and `/brand` is where an owner already goes to see them.
 * A rail item of its own would say blocks are a fifth top-level thing; they are
 * part of how this shop looks.
 *
 * It keeps the dashboard shell. The canvas is one route further in, and a screen
 * with no canvas on it has no claim on the width — the same reasoning that keeps
 * `/editor/new` inside the rail while `/editor/[id]` is full bleed.
 */
export default async function BlocksPage() {
  const session = await requireCompliantSession()
  const shop = await getActiveShop(session)

  if (!shop) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <Header />
        <NoShopBrandKit />
      </div>
    )
  }

  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { planId: true },
  })

  const [brand, blocks] = await Promise.all([
    readEffectiveBrand({
      organizationId: shop.organizationId,
      shopId: shop.id,
      brandOverride: shop.brandOverride,
    }),
    listBlocks(session.user.organizationId, organization?.planId ?? null),
  ])

  // Authoring a block changes what every future book looks like, so it is a
  // manager's decision — the same bar `PATCH /api/v1/brand` puts on the kit, and
  // the same one the API enforces for itself.
  const canEdit = shop.role === 'owner' || shop.role === 'manager'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <Header />
      <BlockLibrary
        blocks={blocks.map((block) => ({
          id: block.id,
          name: block.name,
          description: block.description,
          repeats: block.repeats,
          arrangements: block.arrangements,
          organizationId: block.organizationId,
          status: block.status,
          locked: block.locked,
          planTier: block.planTier,
        }))}
        kit={brand.brandKit}
        canEdit={canEdit}
      />
    </div>
  )
}

function Header() {
  return (
    <div className="flex flex-col gap-2">
      <Link
        href="/brand"
        className="flex w-fit items-center gap-2 rounded-pill px-2 py-1 font-ui text-body-sm text-secondary hover:bg-stone-100"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" strokeWidth={1.75} />
        Brand kit
      </Link>
      <h1 className="font-display text-title text-primary">Blocks</h1>
      <p className="font-ui text-body text-secondary">
        The building blocks your offer books are made of — an offer card, a
        header, a footer. Drawn in your own colours and typefaces.
      </p>
    </div>
  )
}
