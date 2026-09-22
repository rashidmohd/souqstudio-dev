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
import { keyFromPublicUrl } from '@/lib/r2'

/**
 * Generate a cover, three options. E8-04.
 *
 * **No text, and that is the part of the old rule that stands.** A model asked
 * to render a shop's name produces misspelled text in a typeface nobody chose,
 * so the name is typed in the editor on top of what this draws. The seam is an
 * R2 key, exactly as uploaded block artwork already works.
 *
 * **The logo may now be drawn in, on a bag, when the owner asks for it.**
 * `useBrandLogo` is off by default and the editor's overlay is still how most
 * covers get their branding — but a mark on a carrier bag in the scene is a
 * picture being copied rather than a word being spelled, and it is the one
 * surface a cover has that can carry one. `coverLogoRule` in the worker holds
 * the reasoning.
 *
 * **The shop's own character and its own shop are what it is drawn from.** This
 * used to draw an empty background on the reasoning that E9 would composite the
 * character on afterwards; nothing composites anything yet, so what an owner got
 * was a generic graphic with their mascot nowhere in it. Both are references now
 * and the drawing is conditioned on them.
 *
 * **Nothing about which images to send comes from the client.** The body carries
 * booleans and at most a character id; the keys themselves are read here — the
 * character scoped to this shop, the scene photographs off the shop row, the
 * logo off the brand kit. A route that accepted keys would accept any key, and
 * these are the images that travel to a third party. `referenceKeys` is the one
 * exception and it pays for it with a prefix test.
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
     * Who is in it. Absent follows the prompt row's own `person`.
     *
     * **Only `staff` uses a character.** A customer is invented by the model on
     * purpose — a shop has one mascot and many customers, and a shopper wearing
     * the assistant's face is the failure this exists to prevent.
     */
    person: z.enum(['staff', 'customer', 'none']).optional(),
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
    /**
     * Images the owner uploaded for this cover alone.
     *
     * **Keys, unlike `useScene` — and checked against this organization's
     * prefix below.** The scene photographs are a known list on the shop row, so
     * a boolean is enough; these are ad-hoc uploads with no row to name them, so
     * the key has to travel and the prefix test is what stops it naming another
     * tenant's object. The same check `PATCH .../background` makes.
     */
    referenceKeys: z.array(z.string().min(1).max(300)).max(4).optional(),
    /**
     * Print the shop's logo on a carrier bag in the cover.
     *
     * **A boolean, and the logo it means is the brand kit's** — read below
     * from `brand.logoUrl`, the same way `useScene` resolves to keys off the
     * shop row. A cover that took a logo key would be a cover that takes any
     * key, which is the thing the header of this file refuses.
     *
     * **Off by default, because it is not the right answer for most logos.**
     * A mark with words in it comes back with the letters wrong; that is a
     * property of the models and the dialog says so beside this checkbox. The
     * cleared upper third, where the logo is typed on afterwards, is still how
     * a cover gets its branding.
     */
    useBrandLogo: z.boolean().default(false),
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
  /** The row's own answer, which the owner may override but rarely needs to. */
  let person: 'staff' | 'customer' | 'none'

  if (parsed.data.promptSlug === 'custom') {
    scene = `The shop owner describes what they want: "${parsed.data.described ?? ''}"`
    // Their own words say nothing about who is in it, so a choice is the only
    // answer here — and staff is what a shop with a character expects.
    person = parsed.data.person ?? 'staff'
  } else {
    const prompt = await prisma.coverPrompt.findFirst({
      where: { slug: parsed.data.promptSlug, isActive: true },
      select: { scene: true, person: true },
    })
    if (prompt === null) {
      return fail('no_prompt', 'That is not a cover we can make any more. Pick another.', 404)
    }
    scene = prompt.scene
    person = parsed.data.person ?? asPerson(prompt.person)
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

  /*
   * **An asset key is org-scoped by construction** — `uploadArtwork` writes
   * `${organizationId}/blocks/…` — so tenancy here is a prefix test, and it is
   * the only thing standing between a crafted request and another shop's
   * artwork being sent to a third-party image model.
   */
  const referenceKeys = parsed.data.referenceKeys ?? []
  if (referenceKeys.some((key) => !key.startsWith(`${session.user.organizationId}/`))) {
    return fail('asset_not_found', 'One of those images is not one of yours.', 404)
  }

  const brand = await readEffectiveBrand({
    organizationId: shop.organizationId,
    shopId: shop.id,
    brandOverride: shop.brandOverride,
  })
  const palette = resolvePalette(brand.brandKit).map((color) => color.hex)

  /**
   * Which logo, if any, goes on the bag.
   *
   * **`keyFromPublicUrl` is the seam, exactly as `POST /characters/generate`
   * uses it.** The kit stores a public URL and the worker needs an R2 key; a
   * logo hosted anywhere else is refused here rather than fetched over HTTP by
   * a background job.
   *
   * **Refused rather than ignored.** An owner who ticked the box and got a
   * cover with no logo on it has no way to tell whether the model dropped it or
   * the kit never had one — which is the whole shape of the bug this feature
   * exists to fix, reintroduced one layer up.
   */
  let logoKey: string | undefined
  if (parsed.data.useBrandLogo) {
    const resolved = brand.logoUrl === null ? null : keyFromPublicUrl(brand.logoUrl)
    if (resolved === null) {
      return fail(
        'no_brand_logo',
        'There is no logo in your brand kit to put on the bag. Add one in your brand settings first.',
        409
      )
    }
    logoKey = resolved
  }

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
      person,
      promptSlug: parsed.data.promptSlug,
      shape: parsed.data.shape,
      style: parsed.data.style,
      palette,
      ...(character === null || person !== 'staff' ? {} : { characterId: character.id }),
      ...(sceneKeys.length === 0 ? {} : { sceneKeys }),
      ...(referenceKeys.length === 0 ? {} : { referenceKeys }),
      ...(parsed.data.described === undefined ? {} : { described: parsed.data.described }),
      ...(logoKey === undefined ? {} : { logoKey }),
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

/** A stored value we no longer offer still has to resolve to something. */
function asPerson(value: string): 'staff' | 'customer' | 'none' {
  return value === 'customer' || value === 'none' ? value : 'staff'
}
