import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { thumbnailsFor } from '@souqstudio/designer/lib/block-thumbnail'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { readEffectiveBrand } from '@/lib/brand-kit'
import { loadBlock } from '@/lib/blocks'

/**
 * Whether this block's PNG, in the active shop's kit, has been drawn yet.
 *
 * What the "we will let you know" after leaving the designer polls. A miss
 * queues the render if nothing has, so asking is enough to get one drawn.
 * `{ url: null }` means not yet, never "never": the list draws live meanwhile.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const shop = await getActiveShop(session)
  if (shop === null) return fail('no_shop', 'Choose a shop first.', 409)

  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { planId: true },
  })
  const block = await loadBlock(params.id, session.user.organizationId, organization?.planId ?? null)
  if (block === null) return fail('not_found', 'That block does not exist.', 404)

  const brand = await readEffectiveBrand({
    organizationId: shop.organizationId,
    shopId: shop.id,
    brandOverride: shop.brandOverride,
  })
  const urls = await thumbnailsFor([block], { kit: brand.brandKit, source: { shopId: shop.id } })

  return ok({ url: urls.get(block.id) ?? null })
}
