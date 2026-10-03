import 'server-only'
import type { Arrangement, BrandKit } from '@souqstudio/types'
import { enqueueBlockThumbnail, prisma, type RenderKitSource } from '@souqstudio/db'
import { renderKey } from '@souqstudio/designer/lib/block-thumbnail'
import { LIBRARY_PREVIEW_KIT } from '@souqstudio/designer/lib/library-preview'
import { readEffectiveBrand } from '@/lib/brand-kit'
import { toBrandOverride, type BrandOverride } from '@/lib/brand-inheritance'

/**
 * The brand kit a thumbnail is drawn in, from the payload's description of it.
 *
 * **The same function the lists use to read it**, which is the whole point: a
 * thumbnail's key hashes the kit, so the render page and the list that asked
 * must arrive at an identical kit or the PNG lands under a key nobody looks up.
 * A shop's is its *effective* kit, through `brandOverride`, exactly as
 * `/blocks` and the editor read it; the admin library's is its one stand-in.
 *
 * Null when the shop no longer exists.
 */
export async function kitForRender(source: RenderKitSource): Promise<BrandKit | null> {
  if ('library' in source) return LIBRARY_PREVIEW_KIT

  const shop = await prisma.shop.findUnique({
    where: { id: source.shopId },
    select: { id: true, organizationId: true, brandOverride: true },
  })
  if (shop === null) return null

  const brand = await readEffectiveBrand({
    organizationId: shop.organizationId,
    shopId: shop.id,
    brandOverride: toBrandOverride(shop.brandOverride),
  })
  return brand.brandKit
}

/**
 * Queue the active shop's thumbnail of a block that was just saved.
 *
 * **Delayed, so a burst of autosaves draws once.** The designer writes every two
 * seconds while an owner works; each write queues its own key, and each job
 * checks on start whether its key is still the block's current one, so only
 * the last of a burst is drawn. Fire and forget: a save must never fail because
 * Redis did.
 */
export async function queueThumbnailAfterSave(
  block: { id: string; arrangements: readonly Arrangement[] },
  shop: { id: string; organizationId: string; brandOverride: BrandOverride }
): Promise<void> {
  try {
    const brand = await readEffectiveBrand({
      organizationId: shop.organizationId,
      shopId: shop.id,
      brandOverride: shop.brandOverride,
    })
    const key = renderKey({ arrangements: block.arrangements, kit: brand.brandKit, direction: 'ltr' })
    await enqueueBlockThumbnail(
      { blockId: block.id, renderKey: key, kit: { shopId: shop.id }, direction: 'ltr' },
      { delayMs: 8000 }
    )
  } catch (error) {
    console.error('[blocks] could not queue a thumbnail:', error)
  }
}
