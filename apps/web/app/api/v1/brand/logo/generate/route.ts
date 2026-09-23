import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { CREDIT_COSTS, enqueueLogoGen, getCreditSnapshot, prisma } from '@souqstudio/db'
import { isValidHex } from '@souqstudio/engine'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { readEffectiveBrand } from '@/lib/brand-kit'
import { resolvePalette } from '@souqstudio/designer/lib/brand-palette'
import { resolveFont } from '@souqstudio/designer/lib/font-catalog'
import { loadFontCatalog } from '@/lib/font-catalog-server'

/**
 * Generate logo marks. E8-09.
 *
 * A shop with no logo gets four to choose from, assembled from a structure a
 * model picked and drawn in the shop's own colours. **No diffusion model, and
 * no image in either direction** — the inputs are a name, a trade and some hex.
 * That is what lets this exist while E8-01 to E8-04 wait on a provider decision.
 *
 * **The palette is read here rather than taken from the request.** The mark is
 * skinned from the shop's colours, so which colours those are is a fact in the
 * brand kit; a client-supplied palette would let a caller have a mark drawn in
 * anything. The one accommodation is `palette` below — an owner looking at an
 * E8-08 proposal they have not accepted yet should be able to say "and a logo
 * from *these*", and those colours are validated rather than trusted.
 */

const schema = z.object({
  /** What the shop sells, in the owner's words. Steers the structure choice. */
  trade: z.string().trim().max(200).optional(),
  /**
   * Colours to draw from, when they are not the ones in the kit yet.
   *
   * Bounded and hex-checked. It never reaches the model as a colour — the model
   * answers with positions in this list — but it does reach an SVG attribute,
   * which is reason enough to validate it here rather than downstream.
   */
  palette: z.array(z.string().trim().refine(isValidHex)).min(1).max(8).optional(),
})

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const parsed = schema.safeParse((await request.json().catch(() => null)) ?? {})
  if (!parsed.success) {
    return fail('invalid_input', 'That request could not be read.', 422)
  }

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  if (shop.role !== 'owner' && shop.role !== 'manager') {
    return fail('forbidden', 'You need to be a manager to change the logo.', 403)
  }

  const { organizationId } = session.user

  const brand = await readEffectiveBrand({
    organizationId: shop.organizationId,
    shopId: shop.id,
    brandOverride: shop.brandOverride,
  })

  const palette =
    parsed.data.palette ?? resolvePalette(brand.brandKit).map((color) => color.hex)

  /**
   * The mark is set in the shop's headline face — the slot a cover masthead and
   * a campaign headline already use, which is what a logo is nearest to. It is
   * resolved rather than read, so a kit that has not chosen one yet gets the
   * catalog's default instead of an empty `font-family`.
   */
  const family = resolveFont(brand.brandKit, 'headline', await loadFontCatalog())

  if (palette.length === 0) {
    return fail('no_palette', 'Choose your colours first. The mark is drawn in them.', 409)
  }

  const cost = CREDIT_COSTS.logo_gen
  const snapshot = await getCreditSnapshot(organizationId)
  if (snapshot.total < cost) {
    return fail(
      'insufficient_credits',
      `Making logo marks costs ${cost} credits and you have ${snapshot.total}. Top up to carry on.`,
      402
    )
  }

  const job = await prisma.aiJob.create({
    data: {
      organizationId,
      shopId: shop.id,
      type: 'logo_gen',
      status: 'queued',
      creditsCost: cost,
    },
    select: { id: true },
  })

  try {
    await enqueueLogoGen({
      jobId: job.id,
      organizationId,
      shopId: shop.id,
      shopName: shop.name,
      palette,
      family,
      ...(parsed.data.trade === undefined ? {} : { trade: parsed.data.trade }),
    })
  } catch {
    await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: 'failed', errorMessage: 'queue_unavailable', completedAt: new Date() },
    })
    return fail('queue_unavailable', 'We could not start that just now. Try again in a moment.', 503)
  }

  return ok({ jobId: job.id, creditsCost: cost }, 202)
}
