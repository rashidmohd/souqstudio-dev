import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { CREDIT_COSTS, enqueueCoverGen, getCreditSnapshot, prisma } from '@souqstudio/db'
import {
  CAMPAIGNS,
  COVER_SHAPES,
  storePhotoKeysOf,
  type Campaign,
  type CoverShape,
} from '@souqstudio/engine'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { env } from '@/lib/env'
import { readEffectiveBrand } from '@/lib/brand-kit'
import { resolvePalette } from '@/lib/brand-palette'

/**
 * Generate a cover, three options. E8-04.
 *
 * **No text, and that is the part of the old rule that stands.** A model asked
 * to render a shop's name produces misspelled text in a typeface nobody chose,
 * so the name and the logo are typed in the editor on top of what this draws.
 * The seam is an R2 key, exactly as uploaded block artwork already works.
 *
 * **The shop's own character and its own shop are what it is drawn from.** This
 * used to draw an empty background on the reasoning that E9 would composite the
 * character on afterwards; nothing composites anything yet, so what an owner got
 * was a generic graphic with their mascot nowhere in it. Both are references now
 * and the drawing is conditioned on them.
 *
 * **Nothing about which images to send comes from the client.** The body carries
 * two booleans and at most a character id; the keys themselves are read here —
 * the character scoped to this shop, the scene photographs off the shop row. A
 * route that accepted keys would accept any key, and these are the images that
 * travel to a third party.
 *
 * **The palette is read here rather than sent**, for the same reason: which
 * colours a shop has is a fact in the brand kit, not a client's opinion.
 */

const schema = z
  .object({
    campaign: z.enum(CAMPAIGNS as unknown as [Campaign, ...Campaign[]]),
    shape: z
      .enum(COVER_SHAPES as unknown as [CoverShape, ...CoverShape[]])
      .default('portrait'),
    /** Required when the campaign is `custom`, ignored otherwise. */
    described: z.string().trim().min(3).max(200).optional(),
    /**
     * Draw the shop's character into the cover. The id is checked against this
     * shop below and the worker checks it again before it draws — a cover of
     * another shop's mascot is the failure both checks exist to prevent.
     */
    characterId: z.string().min(1).max(64).optional(),
    /**
     * Use the shop's own photographs as the setting.
     *
     * A boolean, not a list of keys. Which photographs those are is read from
     * the shop row; a caller naming keys would be naming arbitrary objects.
     */
    useScene: z.boolean().default(false),
  })
  .refine(
    (value) => value.campaign !== 'custom' || value.described !== undefined,
    'Describe the campaign you want.'
  )

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  if (env.IMAGE_PROVIDER === undefined) {
    return fail('image_generation_off', 'Cover generation is not switched on yet.', 503)
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail('invalid_input', 'Choose a campaign, then try again.', 422)

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  if (shop.role !== 'owner' && shop.role !== 'manager') {
    return fail('forbidden', 'You need to be a manager to make a cover.', 403)
  }

  /*
   * Scoped to the shop in the query rather than checked after the read, which
   * is the rule every route in this epic follows: a `findUnique` plus an `if` is
   * the same thing right up until somebody deletes the `if`.
   */
  const character =
    parsed.data.characterId === undefined
      ? null
      : await prisma.character.findFirst({
          where: { id: parsed.data.characterId, shopId: shop.id },
          select: { id: true },
        })

  if (parsed.data.characterId !== undefined && character === null) {
    return fail('no_character', 'That character is not one of this shop\'s.', 404)
  }

  /*
   * **Photographs of the shop, never of its staff.** `storePhotoKeys` is the
   * scene list E8-01 already sends to the image model; the uniform photographs
   * that show people go to the vision reader and stop there, and nothing here
   * has access to them. `CharacterGenPayload` carries the reasoning.
   */
  const shopRow = parsed.data.useScene
    ? await prisma.shop.findUnique({
        where: { id: shop.id },
        select: { storePhotoKeys: true },
      })
    : null
  const sceneKeys = storePhotoKeysOf(shopRow?.storePhotoKeys)

  const brand = await readEffectiveBrand({
    organizationId: shop.organizationId,
    shopId: shop.id,
    brandOverride: shop.brandOverride,
  })
  const palette = resolvePalette(brand.brandKit).map((color) => color.hex)

  const cost = CREDIT_COSTS.cover_gen
  const snapshot = await getCreditSnapshot(session.user.organizationId)
  if (snapshot.total < cost) {
    return fail(
      'insufficient_credits',
      `A cover costs ${cost} credits and you have ${snapshot.total}. Top up to carry on.`,
      402
    )
  }

  const job = await prisma.aiJob.create({
    data: {
      organizationId: session.user.organizationId,
      shopId: shop.id,
      type: 'cover_gen',
      status: 'queued',
      creditsCost: cost,
    },
    select: { id: true },
  })

  try {
    await enqueueCoverGen({
      jobId: job.id,
      organizationId: session.user.organizationId,
      shopId: shop.id,
      campaign: parsed.data.campaign,
      shape: parsed.data.shape,
      palette,
      ...(character === null ? {} : { characterId: character.id }),
      ...(sceneKeys.length === 0 ? {} : { sceneKeys }),
      ...(parsed.data.described === undefined ? {} : { described: parsed.data.described }),
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
