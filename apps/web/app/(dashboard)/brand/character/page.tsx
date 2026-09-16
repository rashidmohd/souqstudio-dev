import type { Metadata } from 'next'
import Link from 'next/link'
import { getCreditSnapshot, prisma } from '@souqstudio/db'
import { isShopProfileComplete, profileGaps, storePhotoKeysOf } from '@souqstudio/engine'
import { requireCompliantSession } from '@/lib/session'
import { getActiveShop } from '@/lib/active-shop'
import { isBrandSetupComplete, readEffectiveBrand } from '@/lib/brand-kit'
import { publicUrl } from '@/lib/r2'
import { CharacterFlow } from '@/components/brand/CharacterFlow'
import { NoShopBrandKit } from '@/components/brand/NoShopBrandKit'
import { PageContainer } from '@/components/shared/page-container'

export const metadata: Metadata = { title: 'Make a character · SouqStudio' }

/**
 * E8-01 — making a character, as a flow.
 *
 * **Its own screen under `/brand`, beside `/brand/blocks`.** It was a dialog
 * first, which was wrong: a dialog implies one decision and this is five, two of
 * them prerequisites the owner may have to leave the screen to satisfy. A modal
 * that says "your shop profile is incomplete" and then has to be dismissed to go
 * and fix it is a dead end with a close button on it.
 *
 * **`?job=` resumes a finished generation.** The bell in the rail links here with
 * one, because a character generation that completed while the owner was
 * somewhere else has four images in R2, ten credits already spent, and — before
 * this — no route back to the picker.
 *
 * **Both prerequisites are computed here and enforced again in the route.** The
 * screen's job is to say what is missing and link to it; the route's job is to
 * be true whatever the client does.
 */
export default async function CharacterPage({
  searchParams,
}: {
  searchParams: { job?: string }
}) {
  const session = await requireCompliantSession()
  const shop = await getActiveShop(session)

  if (!shop) {
    return (
      <PageContainer>
        <Header />
        <NoShopBrandKit />
      </PageContainer>
    )
  }

  const [row, brand, credits] = await Promise.all([
    prisma.shop.findUnique({
      where: { id: shop.id },
      select: { trades: true, bio: true, storePhotoKeys: true },
    }),
    readEffectiveBrand({
      organizationId: shop.organizationId,
      shopId: shop.id,
      brandOverride: shop.brandOverride,
    }),
    getCreditSnapshot(session.user.organizationId),
  ])

  const storePhotoKeys = storePhotoKeysOf(row?.storePhotoKeys)
  const profile = {
    trades: row?.trades ?? [],
    bio: row?.bio ?? null,
    storePhotoKeys,
  }

  return (
    <PageContainer>
      <Header />

      <CharacterFlow
        credits={credits.total}
        profileComplete={isShopProfileComplete(profile)}
        profileGaps={profileGaps(profile)}
        brandComplete={isBrandSetupComplete(brand.brandKit)}
        shopId={shop.id}
        brandLogoUrl={brand.logoUrl}
        storePhotoKeys={storePhotoKeys}
        storePhotoUrls={storePhotoKeys.map(publicUrl)}
        {...(searchParams.job === undefined ? {} : { resumeJobId: searchParams.job })}
      />
    </PageContainer>
  )
}

function Header() {
  return (
    <div className="flex flex-col gap-1">
      <Link href="/brand" className="font-ui text-body-sm text-secondary hover:text-primary">
        ← Brand kit
      </Link>
      <h1 className="font-display text-title text-primary">Make a character</h1>
      <p className="font-ui text-body text-secondary">
        A shop worker in your own uniform, for the covers and banners of your offer books.
        Made once, reused everywhere.
      </p>
    </div>
  )
}
