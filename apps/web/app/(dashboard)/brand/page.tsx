import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { prisma } from '@souqstudio/db'
import type { Arrangement } from '@souqstudio/types'
import { requireCompliantSession } from '@/lib/session'
import { getActiveShop } from '@/lib/active-shop'
import { toRole } from '@/lib/authz'
import { readEffectiveBrand, isBrandSetupComplete } from '@/lib/brand-kit'
import { BrandKitScreen } from '@/components/brand/BrandKitScreen'
import { NoShopBrandKit } from '@/components/brand/NoShopBrandKit'

export const metadata: Metadata = { title: 'Brand kit · SouqStudio' }

/**
 * E4-05 — the brand kit, after setup.
 *
 * The wizard at `/onboarding` is a first run and exits for good; this is where
 * the same four choices live for the rest of the account's life. Two shipped
 * strings already promised it exists — `LogoField`'s background-removal
 * fallback and the wizard's finish screen — and the rail has linked here since
 * E1, so until now that link 404'd.
 *
 * **Shop-scoped, on the active shop.** The kit rendered belongs to whichever
 * shop the `sq_shop` cookie points at, resolved against the organization's by
 * `readEffectiveBrand`. That is the same shop the editor will render with,
 * which is what makes this screen answer "what will my next offer book look
 * like" rather than "what is stored where".
 *
 * A plain member of layout family 1 — the rail is the sidebar, so there is no
 * settings sub-nav and no layout of its own. Same container as every settings
 * page.
 */
export default async function BrandKitPage() {
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

  // Blocks are published rows identical for every shop, so they are read here
  // rather than through an API the client would have to wait on.
  const [brand, blocks] = await Promise.all([
    readEffectiveBrand({
      organizationId: shop.organizationId,
      shopId: shop.id,
      brandOverride: shop.brandOverride,
    }),
    prisma.block.findMany({
      where: { organizationId: null, status: 'published' },
      select: { id: true, name: true, description: true, arrangements: true },
      orderBy: { name: 'asc' },
    }),
  ])

  // **A brand is created in the wizard and managed here.** One creation path,
  // so the steps that decide a brand are always taken in the same order with
  // the same live preview beside them; this screen is for changing a decision
  // already made. `/onboarding` redirects back the moment the kit is
  // complete, so the two cannot bounce off each other.
  //
  // This is also the only way to reach the wizard again today — nothing else
  // gates brand completeness. E1-04 says setup "cannot be skipped", but the
  // editor that was meant to enforce it is unbuilt, so an owner who closed the
  // tab mid-wizard had no route back. See docs/E4-pending.md §2.
  if (!isBrandSetupComplete(brand.brandKit)) redirect('/onboarding')

  // Editing the brand is a manager's job, exactly as `PATCH /api/v1/brand`
  // enforces. Resetting writes `brandOverride`, so it takes the org owner —
  // the same bar `PATCH /shops/:id` puts on that column.
  const canEdit = shop.role === 'owner' || shop.role === 'manager'
  const isOwner = toRole(session.user.role) === 'owner'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <Header />

      <BrandKitScreen
        shopId={shop.id}
        shopName={shop.name}
        logoUrl={brand.logoUrl}
        brandKit={brand.brandKit}
        brandOverride={brand.override}
        source={brand.source}
        canEdit={canEdit}
        isOwner={isOwner}
        blocks={blocks.map((block) => ({
          id: block.id,
          name: block.name,
          description: block.description,
          // JSONB round-trips as Prisma.JsonValue; the shape is `Arrangement[]`
          // and the seed is its only writer.
          arrangements: block.arrangements as unknown as Arrangement[],
        }))}
      />
    </div>
  )
}

/**
 * Rendered for real in `loading.tsx` too, so the heading does not blink in and
 * the page does not reflow when the reads land.
 */
function Header() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-display text-title text-primary">Brand kit</h1>
      <p className="font-ui text-body text-secondary">
        What every new offer book starts from. Anything you have already
        published stays exactly as it is.
      </p>
    </div>
  )
}
