import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { CREDIT_COSTS, enqueueCoverGen, getCreditSnapshot, prisma } from '@souqstudio/db'
import {
  COVER_SHAPES,
  COVER_STYLES,
  storePhotoKeysOf,
  type CoverShape,
  type CoverStyle,
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
    /**
     * Which row in `cover_prompts` to draw from, or `custom` for the owner's
     * own words.
     *
     * **A slug, never the text.** The prompt is read here; a route that took a
     * scene would be a route that lets a caller write our instruction to the
     * image model.
     */
    promptSlug: z.string().min(1).max(64),
    shape: z
      .enum(COVER_SHAPES as unknown as [CoverShape, ...CoverShape[]])
      .default('portrait'),
    /** How it is drawn. Absent is what every cover looked like before styles. */
    style: z
      .enum(COVER_STYLES as unknown as [CoverStyle, ...CoverStyle[]])
      .default('flat-graphic'),
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
    (value) => value.promptSlug !== 'custom' || value.described !== undefined,
    'Describe the cover you want.'
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

  /**
   * The art direction, resolved here and put on the payload.
   *
   * **An owner's own words are quoted as data, never joined into an
   * instruction.** `coverPrompt` wraps whatever it is handed in a paragraph of
   * its own rules — the person's uniform, no text, the clear upper third — and
   * those rules come after this text, so a sentence trying to countermand them
   * is arguing from the wrong end of the prompt. The same treatment `shops.bio`
   * already gets.
   */
  let scene: string
  if (parsed.data.promptSlug === 'custom') {
    scene = `The shop owner describes what they want: "${parsed.data.described ?? ''}"`
  } else {
    const prompt = await prisma.coverPrompt.findFirst({
      where: { slug: parsed.data.promptSlug, isActive: true },
      select: { scene: true },
    })
    if (prompt === null) {
      return fail('no_prompt', 'That is not a cover we can make any more. Pick another.', 404)
    }
    scene = prompt.scene
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
      scene,
      promptSlug: parsed.data.promptSlug,
      shape: parsed.data.shape,
      style: parsed.data.style,
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
